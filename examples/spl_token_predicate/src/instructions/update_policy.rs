//! Update policy instruction

use anchor_lang::prelude::*;
use crate::instructions::UpdatePolicy;
use crate::events::PolicyUpdated;
use crate::errors::SplTokenPredicateError;

/// Update the policy for an existing protected token account
/// 
/// This function allows the account owner to modify the policy rules for their
/// protected token account. The policy is updated both locally and in the
/// Predicate Registry.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `new_policy` - The new policy data to set
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn update_policy(
    ctx: Context<UpdatePolicy>,
    new_policy: Vec<u8>
) -> Result<()> {
    let protected_account = &mut ctx.accounts.protected_account;
    let owner = &ctx.accounts.owner;
    let clock = Clock::get()?;

    // Validate new policy data
    require!(!new_policy.is_empty(), SplTokenPredicateError::InvalidPolicy);
    require!(new_policy.len() <= 200, SplTokenPredicateError::PolicyTooLong);

    // Store old policy for event emission
    let old_policy = protected_account.get_policy().to_vec();
    let old_policy_string = String::from_utf8_lossy(&old_policy).to_string();

    // Update policy in the Predicate Registry via CPI
    let policy_data = new_policy.clone();
    let cpi_program = ctx.accounts.predicate_registry.to_account_info();
    
    // Create CPI context for updating policy in predicate registry
    let cpi_accounts = predicate_registry::cpi::accounts::UpdatePolicy {
        registry: ctx.accounts.registry.to_account_info(),
        policy_account: ctx.accounts.policy_account.to_account_info(),
        client: owner.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    // Call the predicate registry to update the policy
    predicate_registry::cpi::update_policy(cpi_ctx, policy_data)?;

    // Update the local policy
    protected_account.update_policy(&new_policy, &clock)?;

    // Emit policy updated event
    emit!(PolicyUpdated {
        protected_account: protected_account.key(),
        owner: owner.key(),
        old_policy: old_policy_string,
        new_policy: String::from_utf8_lossy(&new_policy).to_string(),
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Policy updated for protected account: {} by owner: {}",
        protected_account.key(),
        owner.key()
    );

    Ok(())
}

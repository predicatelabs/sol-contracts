//! Update policy instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::UpdatePolicy;
use crate::events::PolicyUpdated;
use crate::errors::PredicateRegistryError;

/// Update an existing policy for a client
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `policy` - The new policy data to set
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn update_policy(ctx: Context<UpdatePolicy>, policy: Vec<u8>) -> Result<()> {
    require!(!policy.is_empty(), PredicateRegistryError::InvalidPolicy);
    require!(policy.len() <= 200, PredicateRegistryError::PolicyTooLong);

    let registry = &ctx.accounts.registry;
    let policy_account = &mut ctx.accounts.policy_account;
    let client = &ctx.accounts.client;
    let clock = Clock::get()?;

    let previous_policy = String::from_utf8_lossy(policy_account.get_policy()).to_string();

    // Update the policy
    policy_account.update_policy(&policy, &clock)?;

    // Emit policy updated event
    emit!(PolicyUpdated {
        registry: registry.key(),
        client: client.key(),
        previous_policy,
        new_policy: String::from_utf8_lossy(&policy).to_string(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Policy updated for client {}: {}", client.key(), String::from_utf8_lossy(&policy));
    
    Ok(())
}
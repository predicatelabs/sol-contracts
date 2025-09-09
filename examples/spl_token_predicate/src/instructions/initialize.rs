//! Initialize protected token account instruction

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::instructions::InitializeProtectedAccount;
use crate::events::ProtectedAccountInitialized;
use crate::errors::SplTokenPredicateError;

/// Initialize a new protected token account with policy enforcement
/// 
/// This function creates a new protected token account that wraps an existing
/// SPL token account and enforces policy-based transfers through the Predicate Registry.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `policy` - The policy data to set for this account
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn initialize_protected_account(
    ctx: Context<InitializeProtectedAccount>,
    policy: Vec<u8>
) -> Result<()> {
    let protected_account = &mut ctx.accounts.protected_account;
    let token_account = &ctx.accounts.token_account;
    let mint = &ctx.accounts.mint;
    let owner = &ctx.accounts.owner;
    let clock = Clock::get()?;

    // Validate policy data
    require!(!policy.is_empty(), SplTokenPredicateError::InvalidPolicy);
    require!(policy.len() <= 200, SplTokenPredicateError::PolicyTooLong);

    // Get the bump seed for the PDA
    let bump = ctx.bumps.protected_account;

    // Initialize the protected account
    protected_account.initialize(
        token_account.key(),
        mint.key(),
        owner.key(),
        &policy,
        bump,
        &clock
    )?;

    // Set policy in the Predicate Registry via CPI
    let policy_data = policy.clone();
    let cpi_program = ctx.accounts.predicate_registry.to_account_info();
    
    // Create CPI context for setting policy in predicate registry
    let cpi_accounts = predicate_registry::cpi::accounts::SetPolicy {
        registry: ctx.accounts.registry.to_account_info(),
        policy_account: ctx.accounts.policy_account.to_account_info(),
        client: owner.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    // Call the predicate registry to set the policy
    predicate_registry::cpi::set_policy(cpi_ctx, policy_data)?;

    // Emit initialization event
    emit!(ProtectedAccountInitialized {
        protected_account: protected_account.key(),
        token_account: token_account.key(),
        mint: mint.key(),
        owner: owner.key(),
        policy: String::from_utf8_lossy(&policy).to_string(),
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Protected token account initialized: {} for owner: {} with policy: {}",
        protected_account.key(),
        owner.key(),
        String::from_utf8_lossy(&policy)
    );

    Ok(())
}

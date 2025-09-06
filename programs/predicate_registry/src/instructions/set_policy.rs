//! Set policy instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::SetPolicy;
use crate::events::PolicySet;
use crate::errors::PredicateRegistryError;

/// Set or update a policy for a client
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `policy` - The policy data to set
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn set_policy(ctx: Context<SetPolicy>, policy: Vec<u8>) -> Result<()> {
    require!(!policy.is_empty(), PredicateRegistryError::InvalidPolicy);
    require!(policy.len() <= 200, PredicateRegistryError::PolicyTooLong);

    let registry = &ctx.accounts.registry;
    let policy_account = &mut ctx.accounts.policy_account;
    let client = &ctx.accounts.client;
    let clock = Clock::get()?;

    // Initialize new policy account
    policy_account.initialize(client.key(), &policy, &clock)?;

    // Emit policy set event
    emit!(PolicySet {
        registry: registry.key(),
        client: client.key(),
        setter: client.key(),
        policy: String::from_utf8_lossy(&policy).to_string(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Policy set for client {}: {}", client.key(), String::from_utf8_lossy(&policy));
    
    Ok(())
}
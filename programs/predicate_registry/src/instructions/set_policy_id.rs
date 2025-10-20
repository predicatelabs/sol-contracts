//! Set policy ID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::SetPolicyId;
use crate::events::PolicySet;
use crate::errors::PredicateRegistryError;

/// Set or update a policy ID for a client
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `policy_id` - The policy ID string to set
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn set_policy_id(ctx: Context<SetPolicyId>, policy_id: String) -> Result<()> {
    require!(!policy_id.is_empty(), PredicateRegistryError::InvalidPolicyId);
    require!(policy_id.len() <= 64, PredicateRegistryError::PolicyIdTooLong);

    let registry = &ctx.accounts.registry;
    let policy_account = &mut ctx.accounts.policy_account;
    let client = &ctx.accounts.client;
    let clock = Clock::get()?;

    // Initialize new policy account
    policy_account.initialize(client.key(), policy_id.clone(), &clock)?;

    // Emit policy set event
    emit!(PolicySet {
        registry: registry.key(),
        client: client.key(),
        setter: client.key(),
        policy_id: policy_id.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Policy ID set for client {}: {}", client.key(), policy_id);
    
    Ok(())
}


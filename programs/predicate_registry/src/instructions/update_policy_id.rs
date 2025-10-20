//! Update policy ID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::UpdatePolicyId;
use crate::events::PolicyUpdated;
use crate::errors::PredicateRegistryError;

/// Update an existing policy ID for a client
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `policy_id` - The new policy ID string to set
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn update_policy_id(ctx: Context<UpdatePolicyId>, policy_id: String) -> Result<()> {
    require!(!policy_id.is_empty(), PredicateRegistryError::InvalidPolicyId);
    require!(policy_id.len() <= 64, PredicateRegistryError::PolicyIdTooLong);

    let registry = &ctx.accounts.registry;
    let policy_account = &mut ctx.accounts.policy_account;
    let client = &ctx.accounts.client;
    let clock = Clock::get()?;

    let previous_policy_id = policy_account.policy_id.clone();

    // Update the policy ID
    policy_account.update_policy_id(policy_id.clone(), &clock)?;

    // Emit policy updated event
    emit!(PolicyUpdated {
        registry: registry.key(),
        client: client.key(),
        previous_policy_id,
        new_policy_id: policy_id.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Policy ID updated for client {}: {}", client.key(), policy_id);
    
    Ok(())
}


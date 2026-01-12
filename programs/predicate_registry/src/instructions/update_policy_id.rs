//! Update policy ID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::{UpdatePolicyId, verify_upgrade_authority};
use crate::events::PolicyUpdated;

/// Update an existing policy ID for a client program
/// 
/// This instruction updates a policy for a PROGRAM (not a user). Only the program's
/// upgrade authority can call this instruction.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `policy_id` - The new policy ID string to set
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Security
/// - Verifies the signer is the program's upgrade authority via `verify_upgrade_authority()`
/// - Policy ID validation is handled by `PolicyAccount::validate_policy_id()`
/// - Policy PDA is derived from the program address, not the user
pub fn update_policy_id(
    ctx: Context<UpdatePolicyId>, 
    policy_id: String
) -> Result<()> {
    // Verify the signer is the program's upgrade authority
    verify_upgrade_authority(
        &ctx.accounts.program_data,
        &ctx.accounts.authority.key(),
    )?;

    let registry = &mut ctx.accounts.registry;
    let policy_account = &mut ctx.accounts.policy_account;
    let clock = Clock::get()?;

    let client_program = ctx.accounts.client_program.key();
    let previous_policy_id = policy_account.policy_id.clone();
    policy_account.update_policy_id(policy_id.clone(), &clock)?;
    
    registry.updated_at = clock.unix_timestamp;

    emit!(PolicyUpdated {
        registry: registry.key(),
        client_program: client_program,
        authority: ctx.accounts.authority.key(),
        previous_policy_id,
        new_policy_id: policy_id.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Policy ID updated for program {}: {}", client_program, policy_id);
    
    Ok(())
}


//! Set policy ID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::{SetPolicyId, verify_upgrade_authority};
use crate::events::PolicySet;

/// Set a policy ID for a client program
/// 
/// This instruction creates a policy for a PROGRAM (not a user). Only the program's
/// upgrade authority can call this instruction.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `policy_id` - The policy ID string to set
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Security
/// - Verifies the signer is the program's upgrade authority via `verify_upgrade_authority()`
/// - Policy ID validation is handled by `PolicyAccount::validate_policy_id()`
/// - Policy PDA is derived from the program address, not the user
/// - The client_program value stored in PolicyAccount matches the PDA derivation source
pub fn set_policy_id(
    ctx: Context<SetPolicyId>, 
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

    // Get the client_program from the account's key
    // The PDA is derived from client_program.key() in the account validation
    let client_program = ctx.accounts.client_program.key();

    // Initialize with client_program and authority
    policy_account.initialize(
        client_program,
        ctx.accounts.authority.key(),
        policy_id.clone(),
        &clock
    )?;
    
    registry.increment_policy_count(&clock)?;

    emit!(PolicySet {
        registry: registry.key(),
        client_program: client_program,
        authority: ctx.accounts.authority.key(),
        policy_id: policy_id.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Policy ID set for program {}: {}", client_program, policy_id);
    
    Ok(())
}


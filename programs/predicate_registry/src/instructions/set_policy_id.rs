//! Set policy ID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::SetPolicyId;
use crate::events::PolicySet;
use crate::errors::PredicateRegistryError;

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
/// - Verifies the signer is the program's upgrade authority
/// - Policy PDA is derived from the program address, not the user
/// - The client_program value stored in PolicyAccount matches the PDA derivation source
pub fn set_policy_id(
    ctx: Context<SetPolicyId>, 
    policy_id: String
) -> Result<()> {
    require!(!policy_id.is_empty(), PredicateRegistryError::InvalidPolicyId);
    require!(policy_id.len() <= 64, PredicateRegistryError::PolicyIdTooLong);

    // Verify the authority is the program's upgrade authority
    // ProgramData account layout:
    // - Bytes 0-3: discriminator (3 for ProgramData)
    // - Bytes 4-11: slot (u64)
    // - Byte 12: option byte (1 if Some, 0 if None)
    // - Bytes 13-44: upgrade authority (32 bytes if Some)
    let program_data_account = &ctx.accounts.program_data;
    let program_data_bytes = program_data_account.try_borrow_data()?;
    
    if program_data_bytes.len() < 45 {
        return Err(PredicateRegistryError::InvalidProgramData.into());
    }
    
    // Check discriminator (should be 3 for ProgramData)
    let discriminator = u32::from_le_bytes([
        program_data_bytes[0],
        program_data_bytes[1],
        program_data_bytes[2],
        program_data_bytes[3],
    ]);
    require!(discriminator == 3, PredicateRegistryError::InvalidProgramData);
    
    // Check if upgrade authority is Some
    let has_authority = program_data_bytes[12] == 1;
    require!(has_authority, PredicateRegistryError::Unauthorized);
    
    // Extract upgrade authority (bytes 13-44)
    let mut authority_bytes = [0u8; 32];
    authority_bytes.copy_from_slice(&program_data_bytes[13..45]);
    let upgrade_authority = Pubkey::new_from_array(authority_bytes);
    
    // Verify the signer is the upgrade authority
    require!(
        upgrade_authority == ctx.accounts.authority.key(),
        PredicateRegistryError::Unauthorized
    );

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


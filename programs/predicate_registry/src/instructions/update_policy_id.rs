//! Update policy ID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::UpdatePolicyId;
use crate::events::PolicyUpdated;
use crate::errors::PredicateRegistryError;

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
/// - Verifies the signer is the program's upgrade authority
/// - Policy PDA is derived from the program address, not the user
pub fn update_policy_id(
    ctx: Context<UpdatePolicyId>, 
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


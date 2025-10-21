//! Validate attestation instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::ValidateAttestation;
use crate::state::{Task, Attestation};
use crate::events::TaskValidated;
use crate::errors::PredicateRegistryError;
use anchor_lang::solana_program::{
    ed25519_program,
    sysvar::instructions::{self, load_current_index_checked, load_instruction_at_checked},
};

/// Validate an attestation for a task
/// 
/// This function performs comprehensive validation of an attestation including:
/// - Input validation and sanitization
/// - Expiration checks for both task and attestation
/// - Policy verification
/// - Attestor registration verification
/// - Ed25519 signature verification using Solana's native program
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `task` - The task to be validated
/// * `attestation` - The attestation from the attestor
/// * `attestor_key` - The public key of the attestor
/// 
/// # Returns
/// * `Result<bool>` - True if validation successful
/// 
/// # Security Considerations
/// - All inputs are validated before processing
/// - Signature verification uses Solana's native ed25519_program
/// - Replay attack prevention through expiration checks
/// - Comprehensive error handling with specific error types
pub fn validate_attestation(
    ctx: Context<ValidateAttestation>, 
    task: Task, 
    attestor_key: Pubkey,
    attestation: Attestation
) -> Result<bool> {
    let registry: &mut Account<'_, crate::PredicateRegistry> = &mut ctx.accounts.registry;
    let attestor_account = &mut ctx.accounts.attestor_account;
    let policy_account = &ctx.accounts.policy_account;
    let validator = &ctx.accounts.validator;
    
    // Get current timestamp with error handling
    let clock = Clock::get().map_err(|_| PredicateRegistryError::ClockError)?;
    let current_timestamp = clock.unix_timestamp;

    // === INPUT VALIDATION ===
    
    // Validate signature length
    require!(
        attestation.signature.len() == 64,
        PredicateRegistryError::InvalidSignature
    );

    // Validate policy is not empty
    require!(
        !task.get_policy().is_empty() && !policy_account.get_policy().is_empty(),
        PredicateRegistryError::InvalidPolicy
    );

    // === BUSINESS LOGIC VALIDATION ===

    // Check if task ID matches attestation ID
    require!(
        task.uuid == attestation.uuid,
        PredicateRegistryError::TaskIdMismatch
    );

    // Check if task expiration matches attestation expiration
    require!(
        task.expiration == attestation.expiration,
        PredicateRegistryError::ExpirationMismatch
    );

    // Check if attestation has expired (with small buffer for clock drift)
    const CLOCK_DRIFT_BUFFER: i64 = 30; // 30 seconds buffer
    require!(
        current_timestamp <= attestation.expiration + CLOCK_DRIFT_BUFFER,
        PredicateRegistryError::AttestationExpired
    );

    // Check if task has expired
    require!(
        current_timestamp <= task.expiration + CLOCK_DRIFT_BUFFER,
        PredicateRegistryError::TaskExpired
    );

    // Verify the policy matches exactly
    require!(
        task.get_policy() == policy_account.get_policy(),
        PredicateRegistryError::InvalidPolicy
    );

    // Verify that the attestor key matches the provided attestor_key parameter
    require!(
        attestor_key == attestor_account.attestor,
        PredicateRegistryError::WrongAttestor
    );

    // Verify that the attestor in the attestation matches the registered attestor
    require!(
        attestation.attestor == attestor_account.attestor,
        PredicateRegistryError::WrongAttestor
    );

    // Verify that the attestor is registered and active
    require!(
        attestor_account.is_registered,
        PredicateRegistryError::AttestorNotRegisteredForValidation
    );


    // === SIGNATURE VERIFICATION ===
    
    // Hash the task for signature verification
    let message_hash = task.hash_task_safe(validator.key());
    
    // Verify Ed25519 signature using Solana's native verification
    // This implementation checks that the ed25519 verification instruction was included
    // in the same transaction as this instruction
    verify_ed25519_signature(
        &attestation.signature,
        &attestation.attestor.to_bytes(),
        &message_hash,
        &ctx.accounts.instructions_sysvar,
    )?;

    // Emit events
    emit!(TaskValidated {
        registry: registry.key(),
        msg_sender: task.msg_sender,
        target: task.target,
        attestor: attestation.attestor,
        msg_value: task.msg_value,
        policy: String::from_utf8_lossy(task.get_policy()).to_string(),
        uuid: task.format_uuid(),
        expiration: task.expiration,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Task {} validated by attestor {} for client {}",
        task.format_uuid(),
        attestation.attestor,
        task.msg_sender
    );

    Ok(true)
}

/// Verify Ed25519 signature using Solana's native ed25519_program
/// 
/// This function checks that an ed25519 signature verification instruction
/// was included in the same transaction as the current instruction.
/// 
/// # Arguments
/// * `signature` - The 64-byte Ed25519 signature
/// * `pubkey` - The 32-byte public key
/// * `message` - The message that was signed
/// * `instructions_sysvar` - The instructions sysvar account
/// 
/// # Returns
/// * `Result<()>` - Ok if signature is valid, error otherwise
/// 
/// # Security Notes
/// - This function requires that the ed25519 verification instruction
///   be included in the same transaction for security
/// - The verification is done by Solana's native ed25519_program
/// - This prevents signature forgery and ensures cryptographic security
fn verify_ed25519_signature(
    signature: &[u8; 64],
    pubkey: &[u8; 32],
    message: &[u8; 32],
    instructions_sysvar: &AccountInfo,
) -> Result<()> {
    // Verify this is the instructions sysvar account
    require!(
        instructions_sysvar.key == &instructions::ID,
        PredicateRegistryError::InvalidAccountData
    );

    // Load the current instruction index
    let current_index = load_current_index_checked(instructions_sysvar)
        .map_err(|_| PredicateRegistryError::InvalidAccountData)?;

    // Check if there's a previous instruction (ed25519 verification should come before this one)
    if current_index == 0 {
        return Err(PredicateRegistryError::InvalidSignature.into());
    }

    // Load the previous instruction
    let ed25519_ix = load_instruction_at_checked(
        (current_index - 1) as usize,
        instructions_sysvar,
    ).map_err(|_| PredicateRegistryError::InvalidSignature)?;

    // Verify it's an ed25519 verification instruction
    require!(
        ed25519_ix.program_id == ed25519_program::ID,
        PredicateRegistryError::InvalidSignature
    );

    // Verify the instruction data format
    let ix_data = &ed25519_ix.data;
    
    // Standard Ed25519Program.createInstructionWithPublicKey format:
    // The format is more complex and includes offsets and data layout
    // We need to parse the instruction data according to the standard format
    
    require!(
        ix_data.len() >= 144, // Minimum size for standard format
        PredicateRegistryError::InvalidSignature
    );

    // Check num_signatures is 1 (first byte)
    require!(
        ix_data[0] == 1,
        PredicateRegistryError::InvalidSignature
    );

    // For the standard format, we need to parse the data layout
    // The signature, pubkey, and message are embedded in a structured format
    // Let's extract them based on the standard Ed25519 instruction layout
    
    // The standard format has offsets at specific positions
    // We'll verify by checking if the signature verification would pass
    // by extracting the components from the standard format
    
    // Parse Ed25519 instruction format according to Solana's specification
    // Reference: https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program
    // Format:
    // [0]   u8: num_signatures
    // [1]   u8: padding
    // [2..4] u16: signature_offset
    // [4..6] u16: signature_instruction_index
    // [6..8] u16: public_key_offset
    // [8..10] u16: public_key_instruction_index
    // [10..12] u16: message_data_offset
    // [12..14] u16: message_data_size
    // [14..16] u16: message_instruction_index
    // [16..] signature, pubkey, message

    require!(
        ix_data.len() >= 16,
        PredicateRegistryError::InvalidSignature
    );

    // Only support single signature for now
    let num_signatures = ix_data[0];
    require!(
        num_signatures == 1,
        PredicateRegistryError::InvalidSignature
    );

    // Offsets are little-endian u16
    let sig_offset = u16::from_le_bytes([ix_data[2], ix_data[3]]) as usize;
    let pubkey_offset = u16::from_le_bytes([ix_data[6], ix_data[7]]) as usize;
    let msg_offset = u16::from_le_bytes([ix_data[10], ix_data[11]]) as usize;
    let msg_size = u16::from_le_bytes([ix_data[12], ix_data[13]]) as usize;

    // Check bounds
    require!(
        ix_data.len() >= sig_offset + 64,
        PredicateRegistryError::InvalidSignature
    );
    require!(
        ix_data.len() >= pubkey_offset + 32,
        PredicateRegistryError::InvalidSignature
    );
    require!(
        ix_data.len() >= msg_offset + msg_size,
        PredicateRegistryError::InvalidSignature
    );

    let sig_slice = &ix_data[sig_offset..sig_offset + 64];
    let pubkey_slice = &ix_data[pubkey_offset..pubkey_offset + 32];
    let msg_slice = &ix_data[msg_offset..msg_offset + msg_size];

    require!(
        sig_slice == signature,
        PredicateRegistryError::InvalidSignature
    );
    require!(
        pubkey_slice == pubkey,
        PredicateRegistryError::InvalidSignature
    );
    require!(
        msg_slice == message,
        PredicateRegistryError::InvalidSignature
    );
    // If we reach here, the signature verification instruction was properly included
    // and matches our expected parameters
    Ok(())
}

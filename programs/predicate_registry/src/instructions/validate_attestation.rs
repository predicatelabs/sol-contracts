//! Validate attestation instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::ValidateAttestation;
use crate::state::{Statement, Attestation};
use crate::events::{StatementValidated, UuidMarkedUsed};
use crate::errors::PredicateRegistryError;
use anchor_lang::solana_program::{
    ed25519_program,
    sysvar::instructions::{self, load_current_index_checked, load_instruction_at_checked},
};

/// Validate an attestation for a statement
/// 
/// This function performs comprehensive validation of an attestation including:
/// - Input validation and sanitization
/// - Expiration checks for both statement and attestation
/// - Policy verification
/// - Attester registration verification
/// - Ed25519 signature verification using Solana's native program
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `statement` - The statement to be validated
/// * `attestation` - The attestation from the attester
/// * `attester_key` - The public key of the attester
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
    statement: Statement, 
    attester_key: Pubkey,
    attestation: Attestation
) -> Result<bool> {
    let registry: &mut Account<'_, crate::PredicateRegistry> = &mut ctx.accounts.registry;
    let attester_account = &mut ctx.accounts.attester_account;
    let policy_account = &ctx.accounts.policy_account;
    let used_uuid_account = &mut ctx.accounts.used_uuid_account;
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

    // Validate policy ID is not empty
    require!(
        !statement.policy_id.is_empty() && !policy_account.policy_id.is_empty(),
        PredicateRegistryError::InvalidPolicyId
    );

    // === BUSINESS LOGIC VALIDATION ===

    // Check if statement ID matches attestation ID
    require!(
        statement.uuid == attestation.uuid,
        PredicateRegistryError::StatementIdMismatch
    );

    // Check if statement expiration matches attestation expiration
    require!(
        statement.expiration == attestation.expiration,
        PredicateRegistryError::ExpirationMismatch
    );

    // Check if attestation has expired (with small buffer for clock drift)
    const CLOCK_DRIFT_BUFFER: i64 = 30; // 30 seconds buffer
    require!(
        current_timestamp <= attestation.expiration + CLOCK_DRIFT_BUFFER,
        PredicateRegistryError::AttestationExpired
    );

    // Check if statement has expired
    require!(
        current_timestamp <= statement.expiration + CLOCK_DRIFT_BUFFER,
        PredicateRegistryError::StatementExpired
    );

    // Verify the policy ID matches exactly
    require!(
        statement.policy_id == policy_account.policy_id,
        PredicateRegistryError::PolicyIdMismatch
    );

    // Verify that the attester key matches the provided attester_key parameter
    require!(
        attester_key == attester_account.attester,
        PredicateRegistryError::WrongAttester
    );

    // Verify that the attester in the attestation matches the registered attester
    require!(
        attestation.attester == attester_account.attester,
        PredicateRegistryError::WrongAttester
    );

    // Verify that the attester is registered and active
    require!(
        attester_account.is_registered,
        PredicateRegistryError::AttesterNotRegisteredForValidation
    );


    // === SIGNATURE VERIFICATION ===
    
    // Hash the statement for signature verification
    let message_hash = statement.hash_statement_safe(validator.key());
    
    // Verify Ed25519 signature using Solana's native verification
    // This implementation checks that the ed25519 verification instruction was included
    // in the same transaction as this instruction
    verify_ed25519_signature(
        &attestation.signature,
        &attestation.attester.to_bytes(),
        &message_hash,
        &ctx.accounts.instructions_sysvar,
    )?;

    // === REPLAY PROTECTION: Mark UUID as used ===
    // Note: The `init` constraint on used_uuid_account will automatically fail
    // if the UUID account already exists, preventing replay attacks.
    // This is the primary replay protection mechanism.
    
    // Initialize the used_uuid_account
    used_uuid_account.uuid = statement.uuid;
    used_uuid_account.used_at = current_timestamp;
    used_uuid_account.expires_at = statement.expiration;
    used_uuid_account.validator = validator.key();

    // Emit UUID marked as used event
    emit!(UuidMarkedUsed {
        uuid: statement.format_uuid(),
        validator: validator.key(),
        expires_at: statement.expiration,
        timestamp: current_timestamp,
    });

    // Emit statement validated event
    emit!(StatementValidated {
        registry: registry.key(),
        msg_sender: statement.msg_sender,
        target: statement.target,
        attester: attestation.attester,
        msg_value: statement.msg_value,
        policy_id: statement.policy_id.clone(),
        uuid: statement.format_uuid(),
        expiration: statement.expiration,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Statement {} validated by attester {} for client {}",
        statement.format_uuid(),
        attestation.attester,
        statement.msg_sender
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

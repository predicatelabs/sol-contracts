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

/// Validate an attestation for a transaction
/// 
/// This function constructs a Statement internally from validated sources,
/// ensuring that critical fields (msg_sender, policy_id) cannot be faked by the client.
/// This mirrors the Solidity PredicateClient._authorizeTransaction pattern.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `target` - The program being called
/// * `msg_value` - The value being transferred (typically 0 on Solana)
/// * `encoded_sig_and_args` - The encoded function signature and arguments
/// * `attestation` - The attestation containing uuid, expiration, signature, and attester
/// 
/// # Returns
/// * `Result<bool>` - True if validation succeeds
/// 
/// # Security
/// The Statement is constructed from:
/// - `msg_sender`: validator.key() - the actual transaction signer (can't be faked)
/// - `policy_id`: policy_account.policy_id - from validated PDA (can't be faked)
/// - Other fields: Provided by client but validated via signature verification
pub fn validate_attestation(
    ctx: Context<ValidateAttestation>,
    target: Pubkey,
    msg_value: u64,
    encoded_sig_and_args: Vec<u8>,
    attestation: Attestation
) -> Result<bool> {
    let registry: &mut Account<'_, crate::PredicateRegistry> = &mut ctx.accounts.registry;
    let attester_account = &mut ctx.accounts.attester_account;
    let policy_account = &ctx.accounts.policy_account;
    let used_uuid_account = &mut ctx.accounts.used_uuid_account;
    let signer = &ctx.accounts.signer;
    

    let statement = Statement {
        uuid: attestation.uuid,
        msg_sender: signer.key(),                   
        target,
        msg_value,
        encoded_sig_and_args,
        policy_id: policy_account.policy_id.clone(),
        expiration: attestation.expiration,
    };
    
    // Get current timestamp with error handling
    let clock = Clock::get().map_err(|_| PredicateRegistryError::ClockError)?;
    let current_timestamp = clock.unix_timestamp;

    // === INPUT VALIDATION ===
    
    // Validate signature length
    require!(
        attestation.signature.len() == 64,
        PredicateRegistryError::InvalidSignature
    );

    // Note: Policy ID validation is not needed here because:
    // 1. Policy IDs are validated when set/updated via PolicyAccount::validate_policy_id()
    // 2. The statement.policy_id is copied from policy_account.policy_id (always matches)
    // 3. Any policy_id mismatch with what the attester signed would cause signature verification to fail

    // === BUSINESS LOGIC VALIDATION ===

    // Check if attestation has expired (with buffer for clock drift)
    require!(
        attestation.is_valid_at(current_timestamp),
        PredicateRegistryError::StatementExpired
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
    let message_hash = statement.hash_statement_safe();
    
    // Verify Ed25519 signature using Solana's native verification
    // This implementation checks that the ed25519 verification instruction was included
    // in the same transaction as this instruction
    verify_ed25519_signature(
        &attestation.signature,
        &attestation.attester.to_bytes(),
        &message_hash,
        &ctx.accounts.instructions_sysvar,
    )?;

    // === REPLAY PROTECTION: Mark attestation as used ===
    // Note: The `init` constraint on used_uuid_account will automatically fail
    // if the UUID account already exists, preventing replay attacks.
    // This is the primary replay protection mechanism.
    
    // Initialize the used_uuid_account with the full attestation
    used_uuid_account.attestation = attestation.clone();
    used_uuid_account.used_at = current_timestamp;
    used_uuid_account.signer = signer.key();

    // Emit UUID marked as used event
    emit!(UuidMarkedUsed {
        uuid: attestation.format_uuid(),
        signer: signer.key(),
        expires_at: attestation.expiration,
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

/// Verify Ed25519 signature using defense-in-depth approach
/// 
/// This function validates that an Ed25519 signature verification instruction
/// was properly included in the same transaction using multiple security layers.
/// 
/// # Security Layers
/// 1. Position check - Ed25519 must be immediately before this instruction
/// 2. Program ID check - Must be Ed25519Program
/// 3. Stateless check - Ed25519 instruction has no accounts
/// 4. Instruction index validation - Data is self-contained (0xFFFF)
/// 5. Offset validation - Offsets don't overlap with header
/// 6. Message size validation - Exactly 32 bytes
/// 7. Data comparison - Signature, pubkey, and message match expected values
/// 
/// # Arguments
/// * `signature` - The 64-byte Ed25519 signature
/// * `pubkey` - The 32-byte public key
/// * `message` - The message that was signed (32-byte hash)
/// * `instructions_sysvar` - The instructions sysvar account
/// 
/// # Returns
/// * `Result<()>` - Ok if all validation passes, error otherwise
/// 
/// # Security Notes
/// - Multiple independent layers prevent various attack vectors
/// - Instruction index validation prevents cross-instruction data sourcing
/// - The Ed25519Program has already verified the cryptographic signature
fn verify_ed25519_signature(
    signature: &[u8; 64],
    pubkey: &[u8; 32],
    message: &[u8; 32],
    instructions_sysvar: &AccountInfo,
) -> Result<()> {    
    const HEADER_LEN: usize = 16;
    const SIG_LEN: usize = 64;
    const PUBKEY_LEN: usize = 32;
    const INSTRUCTION_INDEX_CURRENT: usize = u16::MAX as usize;

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

    // Verify the instruction has no accounts (stateless check)
    require!(
        ed25519_ix.accounts.is_empty(),
        PredicateRegistryError::InvalidSignature
    );

    // Verify the instruction data format
    let ix_data = &ed25519_ix.data;
    
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
        ix_data.len() >= HEADER_LEN,
        PredicateRegistryError::InvalidSignature
    );

    // Only support single signature for now
    let num_signatures = ix_data[0];
    require!(
        num_signatures == 1,
        PredicateRegistryError::InvalidSignature
    );

    // Parse offsets and instruction indices (all little-endian u16)
    let sig_offset = u16::from_le_bytes([ix_data[2], ix_data[3]]) as usize;
    let sig_ix_idx = u16::from_le_bytes([ix_data[4], ix_data[5]]) as usize;
    let pubkey_offset = u16::from_le_bytes([ix_data[6], ix_data[7]]) as usize;
    let pubkey_ix_idx = u16::from_le_bytes([ix_data[8], ix_data[9]]) as usize;
    let msg_offset = u16::from_le_bytes([ix_data[10], ix_data[11]]) as usize;
    let msg_size = u16::from_le_bytes([ix_data[12], ix_data[13]]) as usize;
    let msg_ix_idx = u16::from_le_bytes([ix_data[14], ix_data[15]]) as usize;

    // Verify all instruction indices point to current instruction
    // The Ed25519 program uses u16::MAX (0xFFFF) as a sentinel value for "current instruction"
    // This prevents reading signature, public key, or message from other instructions
    require!(
        sig_ix_idx == INSTRUCTION_INDEX_CURRENT
            && pubkey_ix_idx == INSTRUCTION_INDEX_CURRENT
            && msg_ix_idx == INSTRUCTION_INDEX_CURRENT,
        PredicateRegistryError::InvalidSignature
    );

    // Verify all offsets point beyond the header (into the data region)
    require!(
        sig_offset >= HEADER_LEN 
            && pubkey_offset >= HEADER_LEN 
            && msg_offset >= HEADER_LEN,
        PredicateRegistryError::InvalidSignature
    );

    // Bounds checks for signature, pubkey, and message slices
    require!(
        ix_data.len() >= sig_offset + SIG_LEN,
        PredicateRegistryError::InvalidSignature
    );
    require!(
        ix_data.len() >= pubkey_offset + PUBKEY_LEN,
        PredicateRegistryError::InvalidSignature
    );
    require!(
        ix_data.len() >= msg_offset + msg_size,
        PredicateRegistryError::InvalidSignature
    );

    // Verify message size matches our expected hash size (32 bytes)
    require!(
        msg_size == 32,
        PredicateRegistryError::InvalidSignature
    );

    // Extract the signature, public key, and message from the instruction data
    let sig_slice = &ix_data[sig_offset..sig_offset + SIG_LEN];
    let pubkey_slice = &ix_data[pubkey_offset..pubkey_offset + PUBKEY_LEN];
    let msg_slice = &ix_data[msg_offset..msg_offset + msg_size];

    // Verify that the signature matches what we expect
    require!(
        sig_slice == signature,
        PredicateRegistryError::InvalidSignature
    );

    // Verify that the public key matches what we expect
    require!(
        pubkey_slice == pubkey,
        PredicateRegistryError::InvalidSignature
    );

    // Verify that the message matches what we expect
    require!(
        msg_slice == message,
        PredicateRegistryError::InvalidSignature
    );

    // If we reach here, the signature verification instruction was properly included
    // and matches our expected parameters. The Ed25519Program has already verified
    // the cryptographic signature (or the transaction would have failed).
    Ok(())
}

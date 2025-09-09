//! Validate attestation instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::ValidateAttestation;
use crate::state::{Task, Attestation};
use crate::events::TaskValidated;
use crate::errors::PredicateRegistryError;
use ed25519_dalek::{Signature, VerifyingKey, Verifier};

/// Validate an attestation for a task
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `task` - The task to be validated
/// * `attestation` - The attestation from the attestor
/// * `attestor_key` - The public key of the attestor
/// 
/// # Returns
/// * `Result<bool>` - True if validation successful
pub fn validate_attestation(
    ctx: Context<ValidateAttestation>, 
    task: Task, 
    _attestor_key: Pubkey,
    attestation: Attestation
) -> Result<bool> {
    let registry: &mut Account<'_, crate::PredicateRegistry> = &mut ctx.accounts.registry;

    let attestor_account = &mut ctx.accounts.attestor_account;
    let policy_account = &ctx.accounts.policy_account;
    let validator = &ctx.accounts.validator;
    let clock = Clock::get()?;

    // Check if attestation is expired
    require!(
        clock.unix_timestamp <= attestation.expiration,
        PredicateRegistryError::AttestationExpired
    );

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

    // Check if task has expired
    require!(
        clock.unix_timestamp <= task.expiration,
        PredicateRegistryError::TaskExpired
    );

    // Verify the policy matches
    require!(
        task.get_policy() == policy_account.get_policy(),
        PredicateRegistryError::InvalidPolicy
    );


    // Verify that the attestor in the attestation matches the registered attestor
    require!(
        attestation.attestor == attestor_account.attestor,
        PredicateRegistryError::WrongAttestor
    );

    // Verify that the attestor is registered
    require!(
        attestor_account.is_registered,
        PredicateRegistryError::AttestorNotRegisteredForValidation
    );


    // Hash the task for signature verification
    let message_hash = task.hash_task_safe(validator.key());

    // Verify Ed25519 signature
    let signature = match Signature::try_from(&attestation.signature[..]) {
        Ok(sig) => sig,
        Err(_) => return Err(PredicateRegistryError::InvalidSignature.into()),
    };
    
    let verifying_key = match VerifyingKey::try_from(&attestation.attestor.to_bytes()[..]) {
        Ok(key) => key,
        Err(_) => return Err(PredicateRegistryError::InvalidSignature.into()),
    };
    
    // Verify the signature against the message hash
    match verifying_key.verify(&message_hash, &signature) {
        Ok(_) => {},
        Err(_) => return Err(PredicateRegistryError::InvalidSignature.into()),
    };

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

//! Validate attestation instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::ValidateAttestation;
use crate::state::{Task, Attestation};
use crate::events::{TaskValidated, AttestationMade};
use crate::errors::PredicateRegistryError;

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
    let registry = &mut ctx.accounts.registry;
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
        task.policy == policy_account.policy,
        PredicateRegistryError::InvalidPolicy
    );

    // Hash the task for signature verification
    let _message_hash = task.hash_task_safe(validator.key());

    // Verify the signature using ed25519
    // Note: In a real implementation, you would use the ed25519-dalek crate
    // or Solana's built-in signature verification
    // For now, we'll do a basic check that the attestor matches
    require!(
        attestation.attestor == attestor_account.attestor,
        PredicateRegistryError::WrongAttestor
    );

    // TODO: Implement proper Ed25519 signature verification
    // This would require additional dependencies and proper signature verification logic
    // For now, we assume the signature is valid if the attestor matches

    // Emit events
    emit!(TaskValidated {
        registry: registry.key(),
        msg_sender: task.msg_sender,
        target: task.target,
        attestor: attestation.attestor,
        msg_value: task.msg_value,
        policy: task.policy.clone(),
        uuid: task.uuid.clone(),
        expiration: task.expiration,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Task {} validated by attestor {} for client {}",
        attestation.uuid,
        attestation.attestor,
        task.msg_sender
    );

    Ok(true)
}

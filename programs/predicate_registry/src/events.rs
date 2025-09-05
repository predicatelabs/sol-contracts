//! # Events Module
//! 
//! This module contains all event definitions for the predicate registry program.
//! Events provide a way to emit structured data that can be observed
//! by off-chain applications.

use anchor_lang::prelude::*;

/// Event emitted when the registry is initialized
#[event]
pub struct RegistryInitialized {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The authority of the registry
    pub authority: Pubkey,
    /// Timestamp when initialized
    pub timestamp: i64,
}

/// Event emitted when an attestor is registered
#[event]
pub struct AttestorRegistered {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The attestor that was registered
    pub attestor: Pubkey,
    /// The authority who registered the attestor
    pub authority: Pubkey,
    /// Timestamp when registered
    pub timestamp: i64,
}

/// Event emitted when an attestor is deregistered
#[event]
pub struct AttestorDeregistered {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The attestor that was deregistered
    pub attestor: Pubkey,
    /// The authority who deregistered the attestor
    pub authority: Pubkey,
    /// Timestamp when deregistered
    pub timestamp: i64,
}

/// Event emitted when a policy is set for a client
#[event]
pub struct PolicySet {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The client for whom the policy was set
    pub client: Pubkey,
    /// The account that set the policy (should be same as client)
    pub setter: Pubkey,
    /// The policy string
    pub policy: String,
    /// Timestamp when policy was set
    pub timestamp: i64,
}

/// Event emitted when a task is validated
#[event]
pub struct TaskValidated {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The message sender from the task
    pub msg_sender: Pubkey,
    /// The target address from the task
    pub target: Pubkey,
    /// The attestor who validated the task
    pub attestor: Pubkey,
    /// The message value from the task
    pub msg_value: u64,
    /// The policy used for validation
    pub policy: String,
    /// The unique task identifier
    pub uuid: String,
    /// The expiration timestamp
    pub expiration: i64,
    /// Timestamp when validated
    pub timestamp: i64,
}

/// Event emitted when registry authority is transferred
#[event]
pub struct AuthorityTransferred {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The previous authority
    pub previous_authority: Pubkey,
    /// The new authority
    pub new_authority: Pubkey,
    /// Timestamp when transferred
    pub timestamp: i64,
}

/// Event emitted when a policy is updated
#[event]
pub struct PolicyUpdated {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The client whose policy was updated
    pub client: Pubkey,
    /// The previous policy string
    pub previous_policy: String,
    /// The new policy string
    pub new_policy: String,
    /// Timestamp when updated
    pub timestamp: i64,
}

/// Event emitted when an attestor makes an attestation
#[event]
pub struct AttestationMade {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The attestor who made the attestation
    pub attestor: Pubkey,
    /// The task UUID that was attested
    pub task_uuid: String,
    /// The client who submitted the task
    pub client: Pubkey,
    /// Total attestations made by this attestor
    pub total_attestations: u64,
    /// Timestamp when attestation was made
    pub timestamp: i64,
}


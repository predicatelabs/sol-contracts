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

/// Event emitted when an attester is registered
#[event]
pub struct AttesterRegistered {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The attester that was registered
    pub attester: Pubkey,
    /// The authority who registered the attester
    pub authority: Pubkey,
    /// Timestamp when registered
    pub timestamp: i64,
}

/// Event emitted when an attester is deregistered
#[event]
pub struct AttesterDeregistered {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The attester that was deregistered
    pub attester: Pubkey,
    /// The authority who deregistered the attester
    pub authority: Pubkey,
    /// Timestamp when deregistered
    pub timestamp: i64,
}

/// Event emitted when a policy ID is set for a client
#[event]
pub struct PolicySet {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The client for whom the policy ID was set
    pub client: Pubkey,
    /// The account that set the policy ID (should be same as client)
    pub setter: Pubkey,
    /// The policy ID string
    pub policy_id: String,
    /// Timestamp when policy was set
    pub timestamp: i64,
}

/// Event emitted when a statement is validated
#[event]
pub struct StatementValidated {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The message sender from the statement
    pub msg_sender: Pubkey,
    /// The target address from the statement
    pub target: Pubkey,
    /// The attester who validated the statement
    pub attester: Pubkey,
    /// The message value from the statement
    pub msg_value: u64,
    /// The policy ID used for validation
    pub policy_id: String,
    /// The unique statement identifier
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

/// Event emitted when a policy ID is updated
#[event]
pub struct PolicyUpdated {
    /// The public key of the registry account
    pub registry: Pubkey,
    /// The client whose policy ID was updated
    pub client: Pubkey,
    /// The previous policy ID string
    pub previous_policy_id: String,
    /// The new policy ID string
    pub new_policy_id: String,
    /// Timestamp when updated
    pub timestamp: i64,
}

/// Event emitted when a UUID is marked as used (replay protection)
#[event]
pub struct UuidMarkedUsed {
    /// The UUID that was marked as used (formatted)
    pub uuid: String,
    /// Who performed the validation (the transaction signer)
    pub signer: Pubkey,
    /// When the statement expires
    pub expires_at: i64,
    /// Timestamp when marked as used
    pub timestamp: i64,
}



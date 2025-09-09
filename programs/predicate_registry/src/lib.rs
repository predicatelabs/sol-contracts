//! # Predicate Registry Program
//! 
//! A comprehensive predicate registry program for managing attestors, policies, and task validation
//! on Solana. This program provides a decentralized way to register attestors, set client policies,
//! and validate tasks with cryptographic attestations.
//!
//! ## Features
//! - Attestor registration and management
//! - Client policy management
//! - Task validation with cryptographic attestations
//! - Authority management and transfer
//!
//! ## Security
//! - All operations require proper authorization
//! - Signature verification ensures attestation authenticity
//! - Expiration timestamps prevent stale attestations

// Suppress warnings from Anchor's internal behavior
// These are framework-level warnings, not from our code
#![allow(deprecated)]
#![allow(ambiguous_glob_reexports)]

use anchor_lang::prelude::*;


// Import our modules
pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

// Re-export for easier access
pub use instructions::*;
pub use state::*;
pub use errors::*;
pub use events::*;

// Program ID - This should be updated when you deploy
declare_id!("GNhUnSDSxfpFqHV73TPNGFCmfgrxuLLL6jcE1zXe9xx");

/// Main program module containing all instruction handlers
#[program]
pub mod predicate_registry {
    use super::*;

    /// Initialize a new predicate registry
    /// 
    /// Creates the main registry account with the specified authority.
    /// Only needs to be called once per deployment.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `RegistryInitialized` - Emitted when registry is successfully initialized
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    /// Register a new attestor
    /// 
    /// Allows the registry authority to register a new attestor who can
    /// provide attestations for task validation.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `attestor` - The public key of the attestor to register
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `AttestorRegistered` - Emitted when attestor is successfully registered
    /// 
    /// # Errors
    /// * `AttestorAlreadyRegistered` - If attestor is already registered
    /// * `Unauthorized` - If caller is not the registry authority
    pub fn register_attestor(ctx: Context<RegisterAttestor>, attestor: Pubkey) -> Result<()> {
        instructions::register_attestor(ctx, attestor)
    }

    /// Deregister an existing attestor
    /// 
    /// Allows the registry authority to deregister an attestor, preventing
    /// them from providing new attestations.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `attestor` - The public key of the attestor to deregister
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `AttestorDeregistered` - Emitted when attestor is successfully deregistered
    /// 
    /// # Errors
    /// * `AttestorNotRegistered` - If attestor is not currently registered
    /// * `Unauthorized` - If caller is not the registry authority
    pub fn deregister_attestor(ctx: Context<DeregisterAttestor>, attestor: Pubkey) -> Result<()> {
        instructions::deregister_attestor(ctx, attestor)
    }

    /// Set a policy for a client
    /// 
    /// Allows a client to set their validation policy string.
    /// This policy will be used when validating tasks from this client.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `policy` - The policy data (max 200 bytes)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `PolicySet` - Emitted when policy is successfully set
    /// 
    /// # Errors
    /// * `PolicyTooLong` - If policy data exceeds 200 bytes
    /// * `InvalidPolicy` - If policy data is empty
    pub fn set_policy(ctx: Context<SetPolicy>, policy: Vec<u8>) -> Result<()> {
        instructions::set_policy(ctx, policy)
    }

    /// Update an existing policy for a client
    /// 
    /// Allows a client to update their existing validation policy string.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `policy` - The new policy data (max 200 bytes)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `PolicyUpdated` - Emitted when policy is successfully updated
    /// 
    /// # Errors
    /// * `PolicyTooLong` - If policy data exceeds 200 bytes
    /// * `InvalidPolicy` - If policy data is empty
    /// * `PolicyNotFound` - If no existing policy found for client
    pub fn update_policy(ctx: Context<UpdatePolicy>, policy: Vec<u8>) -> Result<()> {
        instructions::update_policy(ctx, policy)
    }

    /// Validate an attestation for a task
    /// 
    /// Validates that an attestation is valid for a given task, checking:
    /// - Attestor is registered
    /// - Task hasn't expired
    /// - Attestation signature is valid
    /// - Policy matches
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `task` - The task to validate
    /// * `attestation` - The attestation for the task
    /// * `attestor_key` - The public key of the attestor
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `TaskValidated` - Emitted when task is successfully validated
    /// 
    /// # Errors
    /// * `AttestorNotRegisteredForValidation` - If attestor is not registered
    /// * `TaskExpired` - If task has expired
    /// * `AttestationExpired` - If attestation has expired
    /// * `InvalidSignature` - If attestation signature is invalid
    /// * `TaskIdMismatch` - If task and attestation UUIDs don't match
    /// * `ExpirationMismatch` - If task and attestation expirations don't match
    /// * `WrongAttestor` - If signature doesn't match provided attestor
    pub fn validate_attestation(
        ctx: Context<ValidateAttestation>, 
        task: Task, 
        attestor_key: Pubkey,
        attestation: Attestation
    ) -> Result<()> {
        instructions::validate_attestation(ctx, task, attestor_key, attestation).map(|_| ())
    }

    /// Transfer registry authority to a new account
    /// 
    /// Allows the current authority to transfer ownership of the registry
    /// to a new account. This is irreversible.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `new_authority` - The public key of the new authority
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `AuthorityTransferred` - Emitted when authority is successfully transferred
    /// 
    /// # Errors
    /// * `Unauthorized` - If caller is not the current authority
    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        instructions::transfer_authority(ctx, new_authority)
    }
}
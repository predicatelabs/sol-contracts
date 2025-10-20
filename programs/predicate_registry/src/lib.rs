//! # Predicate Registry Program
//! 
//! A comprehensive predicate registry program for managing attesters, policies, and statement validation
//! on Solana. This program provides a decentralized way to register attesters, set client policies,
//! and validate statements with cryptographic attestations.
//!
//! ## Features
//! - Attester registration and management
//! - Client policy management
//! - Statement validation with cryptographic attestations
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
declare_id!("gg929D9WoMes8gSQUuoYTL31TvTy4bXCZB2ruQdizNv");

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

    /// Register a new attester
    /// 
    /// Allows the registry authority to register a new attester who can
    /// provide attestations for statement validation.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `attester` - The public key of the attester to register
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `AttesterRegistered` - Emitted when attester is successfully registered
    /// 
    /// # Errors
    /// * `AttesterAlreadyRegistered` - If attester is already registered
    /// * `Unauthorized` - If caller is not the registry authority
    pub fn register_attester(ctx: Context<RegisterAttester>, attester: Pubkey) -> Result<()> {
        instructions::register_attester(ctx, attester)
    }

    /// Deregister an existing attester
    /// 
    /// Allows the registry authority to deregister an attester, preventing
    /// them from providing new attestations.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `attester` - The public key of the attester to deregister
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `AttesterDeregistered` - Emitted when attester is successfully deregistered
    /// 
    /// # Errors
    /// * `AttesterNotRegistered` - If attester is not currently registered
    /// * `Unauthorized` - If caller is not the registry authority
    pub fn deregister_attester(ctx: Context<DeregisterAttester>, attester: Pubkey) -> Result<()> {
        instructions::deregister_attester(ctx, attester)
    }

    /// Set a policy ID for a client
    /// 
    /// Allows a client to set their validation policy ID.
    /// This policy ID will be used when validating statements from this client.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `policy_id` - The policy ID string (max 64 bytes)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `PolicySet` - Emitted when policy ID is successfully set
    /// 
    /// # Errors
    /// * `PolicyIdTooLong` - If policy ID exceeds 64 bytes
    /// * `InvalidPolicyId` - If policy ID is empty
    pub fn set_policy_id(ctx: Context<SetPolicyId>, policy_id: String) -> Result<()> {
        instructions::set_policy_id(ctx, policy_id)
    }

    /// Update an existing policy ID for a client
    /// 
    /// Allows a client to update their existing validation policy ID.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `policy_id` - The new policy ID string (max 64 bytes)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `PolicyUpdated` - Emitted when policy ID is successfully updated
    /// 
    /// # Errors
    /// * `PolicyIdTooLong` - If policy ID exceeds 64 bytes
    /// * `InvalidPolicyId` - If policy ID is empty
    /// * `PolicyNotFound` - If no existing policy found for client
    pub fn update_policy_id(ctx: Context<UpdatePolicyId>, policy_id: String) -> Result<()> {
        instructions::update_policy_id(ctx, policy_id)
    }

    /// Validate an attestation for a statement
    /// 
    /// Validates that an attestation is valid for a given statement, checking:
    /// - Attester is registered
    /// - Statement hasn't expired
    /// - Attestation signature is valid
    /// - Policy matches
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `statement` - The statement to validate
    /// * `attestation` - The attestation for the statement
    /// * `attester_key` - The public key of the attester
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `StatementValidated` - Emitted when statement is successfully validated
    /// 
    /// # Errors
    /// * `AttesterNotRegisteredForValidation` - If attester is not registered
    /// * `StatementExpired` - If statement has expired
    /// * `AttestationExpired` - If attestation has expired
    /// * `InvalidSignature` - If attestation signature is invalid
    /// * `StatementIdMismatch` - If statement and attestation UUIDs don't match
    /// * `ExpirationMismatch` - If statement and attestation expirations don't match
    /// * `WrongAttester` - If signature doesn't match provided attester
    pub fn validate_attestation(
        ctx: Context<ValidateAttestation>, 
        statement: Statement, 
        attester_key: Pubkey,
        attestation: Attestation
    ) -> Result<()> {
        instructions::validate_attestation(ctx, statement, attester_key, attestation).map(|_| ())
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

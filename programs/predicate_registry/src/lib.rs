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
declare_id!("GjXtvmWihnf22Bg48srpzYrs6iGhSUvu1tzsf9L4u9Ck");

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

    /// Set a policy ID for a client program
    /// 
    /// Creates a policy for a PROGRAM (not a user). Only the program's upgrade
    /// authority can call this instruction. The policy is tied to the program
    /// address, and all users calling that program will be validated against
    /// this policy.
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
    /// * `Unauthorized` - If signer is not the program's upgrade authority
    /// * `InvalidProgramData` - If program data account is invalid
    pub fn set_policy_id(
        ctx: Context<SetPolicyId>, 
        policy_id: String
    ) -> Result<()> {
        instructions::set_policy_id(ctx, policy_id)
    }

    /// Update an existing policy ID for a client program
    /// 
    /// Updates a policy for a PROGRAM (not a user). Only the program's upgrade
    /// authority can call this instruction.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `client_program` - The program address that this policy applies to
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
    /// * `PolicyNotFound` - If no existing policy found for program
    /// * `Unauthorized` - If signer is not the program's upgrade authority
    /// * `InvalidProgramData` - If program data account is invalid
    /// * `InvalidClientProgram` - If program doesn't match policy account
    pub fn update_policy_id(
        ctx: Context<UpdatePolicyId>, 
        client_program: Pubkey,
        policy_id: String
    ) -> Result<()> {
        instructions::update_policy_id(ctx, client_program, policy_id)
    }

    /// Validate an attestation for a transaction
    /// 
    /// Constructs a Statement internally from validated sources and verifies the attestation.
    /// This function mirrors the Solidity PredicateClient._authorizeTransaction pattern.
    /// 
    /// The Statement is built from:
    /// - `msg_sender`: Derived from the validator (Signer) - cannot be faked
    /// - `policy_id`: Derived from the validated policy_account PDA - cannot be faked
    /// - Other fields: Provided by caller but validated via signature verification
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `target` - The program being called (e.g., counter program ID)
    /// * `msg_value` - The value being transferred (typically 0 on Solana)
    /// * `encoded_sig_and_args` - The encoded function signature and arguments
    /// * `attestation` - The attestation containing uuid, expiration, signature, and attester
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `StatementValidated` - Emitted when statement is successfully validated
    /// * `UuidMarkedUsed` - Emitted when UUID is marked as used
    /// 
    /// # Errors
    /// * `AttesterNotRegisteredForValidation` - If attester is not registered
    /// * `StatementExpired` - If statement has expired
    /// * `AttestationExpired` - If attestation has expired
    /// * `InvalidSignature` - If attestation signature is invalid
    /// * `WrongAttester` - If signature doesn't match provided attester
    /// * `UuidAlreadyUsed` - If UUID has already been validated (replay attack)
    /// * `PolicyIdMismatch` - If derived policy doesn't match expected
    pub fn validate_attestation(
        ctx: Context<ValidateAttestation>,
        target: Pubkey,
        msg_value: u64,
        encoded_sig_and_args: Vec<u8>,
        attestation: Attestation
    ) -> Result<()> {
        instructions::validate_attestation(
            ctx,
            target,
            msg_value,
            encoded_sig_and_args,
            attestation
        ).map(|_| ())
    }

    /// Cleanup an expired UUID account to reclaim rent
    /// 
    /// Allows anyone to cleanup expired UUID accounts, returning the rent
    /// to the original validator (payer). This is permissionless and can be
    /// called by anyone after the statement has expired.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Errors
    /// * `StatementNotExpired` - If statement hasn't expired yet
    pub fn cleanup_expired_uuid(ctx: Context<CleanupExpiredUuid>) -> Result<()> {
        instructions::cleanup_expired_uuid(ctx)
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

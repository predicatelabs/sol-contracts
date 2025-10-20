//! # Error Module
//! 
//! This module contains all custom error types for the predicate registry program.
//! Using custom errors provides better debugging information and user experience.

use anchor_lang::prelude::*;

/// Custom error codes for the predicate registry program
#[error_code]
pub enum PredicateRegistryError {
    /// Error when trying to register an already registered attester
    #[msg("Attester already registered: The attester is already registered in the registry")]
    AttesterAlreadyRegistered,
    
    /// Error when trying to deregister a non-registered attester
    #[msg("Attester not registered: The attester is not registered in the registry")]
    AttesterNotRegistered,
    
    /// Error when unauthorized user tries to perform an action
    #[msg("Unauthorized: Only the authority can perform this action")]
    Unauthorized,
    
    /// Error when trying to initialize an already initialized registry
    #[msg("Already initialized: Registry has already been initialized")]
    AlreadyInitialized,
    
    /// Error when trying to perform operations on an uninitialized registry
    #[msg("Not initialized: Registry has not been initialized")]
    NotInitialized,
    
    /// Error when providing invalid parameters
    #[msg("Invalid parameter: The provided parameter is invalid")]
    InvalidParameter,
    
    /// Error when arithmetic operation fails
    #[msg("Arithmetic error: Mathematical operation failed")]
    ArithmeticError,
    
    /// Error when attestation has expired
    #[msg("Attestation expired: The attestation has passed its expiration time")]
    AttestationExpired,
    
    
    /// Error when statement ID doesn't match attestation ID
    #[msg("Statement ID mismatch: Statement UUID does not match attestation UUID")]
    StatementIdMismatch,
    
    /// Error when statement expiration doesn't match attestation expiration
    #[msg("Expiration mismatch: Statement expiration does not match attestation expiration")]
    ExpirationMismatch,
    
    /// Error when signature verification fails
    #[msg("Invalid signature: The attestation signature is invalid")]
    InvalidSignature,
    
    /// Error when attester is not registered for validation
    #[msg("Attester not registered: The attester is not registered for validation")]
    AttesterNotRegisteredForValidation,
    
    /// Error when policy string is too long (deprecated - use PolicyIdTooLong)
    #[msg("Policy too long: Policy string exceeds maximum allowed length")]
    PolicyTooLong,
    
    /// Error when policy ID string is too long
    #[msg("Policy ID too long: Policy ID string exceeds maximum allowed length")]
    PolicyIdTooLong,
    
    /// Error when UUID string is too long
    #[msg("UUID too long: UUID string exceeds maximum allowed length")]
    UuidTooLong,
    
    /// Error when policy is empty or invalid (deprecated - use InvalidPolicyId)
    #[msg("Invalid policy: Policy cannot be empty")]
    InvalidPolicy,
    
    /// Error when policy ID is empty or invalid
    #[msg("Invalid policy ID: Policy ID cannot be empty")]
    InvalidPolicyId,
    
    /// Error when policy IDs don't match
    #[msg("Policy ID mismatch: Statement policy ID does not match account policy ID")]
    PolicyIdMismatch,
    
    /// Error when statement has expired
    #[msg("Statement expired: The statement has passed its expiration time")]
    StatementExpired,
    
    /// Error when trying to validate with wrong attester
    #[msg("Wrong attester: The recovered attester does not match the provided attester")]
    WrongAttester,
    
    /// Error when signature recovery fails
    #[msg("Signature recovery failed: Could not recover public key from signature")]
    SignatureRecoveryFailed,
    
    /// Error when account data is corrupted or invalid
    #[msg("Invalid account data: Account data is corrupted or invalid")]
    InvalidAccountData,
    
    /// Error when trying to access non-existent policy
    #[msg("Policy not found: No policy found for the specified client")]
    PolicyNotFound,
    
    /// Error when trying to access non-existent attester
    #[msg("Attester not found: No attester account found")]
    AttesterNotFound,
    
    
    /// Error when clock/timestamp operations fail
    #[msg("Clock error: Failed to get current timestamp")]
    ClockError,
    
    /// Error when serialization/deserialization fails
    #[msg("Serialization error: Failed to serialize or deserialize data")]
    SerializationError,
}

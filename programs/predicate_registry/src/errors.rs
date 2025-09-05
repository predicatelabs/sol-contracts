//! # Error Module
//! 
//! This module contains all custom error types for the predicate registry program.
//! Using custom errors provides better debugging information and user experience.

use anchor_lang::prelude::*;

/// Custom error codes for the predicate registry program
#[error_code]
pub enum PredicateRegistryError {
    /// Error when trying to register an already registered attestor
    #[msg("Attestor already registered: The attestor is already registered in the registry")]
    AttestorAlreadyRegistered,
    
    /// Error when trying to deregister a non-registered attestor
    #[msg("Attestor not registered: The attestor is not registered in the registry")]
    AttestorNotRegistered,
    
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
    
    
    /// Error when task ID doesn't match attestation ID
    #[msg("Task ID mismatch: Task UUID does not match attestation UUID")]
    TaskIdMismatch,
    
    /// Error when task expiration doesn't match attestation expiration
    #[msg("Expiration mismatch: Task expiration does not match attestation expiration")]
    ExpirationMismatch,
    
    /// Error when signature verification fails
    #[msg("Invalid signature: The attestation signature is invalid")]
    InvalidSignature,
    
    /// Error when attestor is not registered for validation
    #[msg("Attestor not registered: The attestor is not registered for validation")]
    AttestorNotRegisteredForValidation,
    
    /// Error when policy string is too long
    #[msg("Policy too long: Policy string exceeds maximum allowed length")]
    PolicyTooLong,
    
    
    /// Error when UUID string is too long
    #[msg("UUID too long: UUID string exceeds maximum allowed length")]
    UuidTooLong,
    
    /// Error when policy is empty or invalid
    #[msg("Invalid policy: Policy cannot be empty")]
    InvalidPolicy,
    
    /// Error when task has expired
    #[msg("Task expired: The task has passed its expiration time")]
    TaskExpired,
    
    /// Error when trying to validate with wrong attestor
    #[msg("Wrong attestor: The recovered attestor does not match the provided attestor")]
    WrongAttestor,
    
    /// Error when signature recovery fails
    #[msg("Signature recovery failed: Could not recover public key from signature")]
    SignatureRecoveryFailed,
    
    /// Error when account data is corrupted or invalid
    #[msg("Invalid account data: Account data is corrupted or invalid")]
    InvalidAccountData,
    
    /// Error when trying to access non-existent policy
    #[msg("Policy not found: No policy found for the specified client")]
    PolicyNotFound,
    
    /// Error when trying to access non-existent attestor
    #[msg("Attestor not found: No attestor account found")]
    AttestorNotFound,
    
    
    /// Error when clock/timestamp operations fail
    #[msg("Clock error: Failed to get current timestamp")]
    ClockError,
    
    /// Error when serialization/deserialization fails
    #[msg("Serialization error: Failed to serialize or deserialize data")]
    SerializationError,
}

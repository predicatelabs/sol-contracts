//! Errors module for the Counter program
//! 
//! This module contains all custom error definitions used by the Counter program.
//! Each error provides specific context about what went wrong during execution.

use anchor_lang::prelude::*;

/// Custom error codes for the Counter program
/// 
/// These errors provide specific feedback about failures during program execution.
/// Each error includes a descriptive message to help with debugging and user feedback.
#[error_code]
pub enum CounterError {
    /// The caller is not authorized to perform this operation
    /// 
    /// This error occurs when:
    /// - The task msg_sender doesn't match the counter owner
    /// - An unauthorized account tries to perform protected operations
    #[msg("Unauthorized operation")]
    Unauthorized,

    /// The provided task parameters are invalid
    /// 
    /// This error occurs when:
    /// - Task target doesn't match the counter program ID
    /// - Task encoded signature doesn't match expected increment signature
    /// - Task UUID or other parameters are malformed
    #[msg("Invalid task parameters")]
    InvalidTask,

    /// An arithmetic operation failed (overflow, underflow, etc.)
    /// 
    /// This error occurs when:
    /// - Counter increment would cause overflow
    /// - Mathematical operations exceed safe bounds
    #[msg("Arithmetic error")]
    ArithmeticError,

    /// The counter account is not properly initialized
    /// 
    /// This error occurs when:
    /// - Attempting to operate on an uninitialized counter
    /// - Counter account data is corrupted or invalid
    #[msg("Counter not initialized")]
    NotInitialized,

    /// The predicate registry configuration is invalid
    /// 
    /// This error occurs when:
    /// - Counter is not properly linked to a predicate registry
    /// - Predicate registry account is invalid or corrupted
    #[msg("Invalid predicate registry configuration")]
    InvalidRegistryConfig,

    /// The policy account is not properly configured
    /// 
    /// This error occurs when:
    /// - Policy account doesn't exist for the counter owner
    /// - Policy account is corrupted or invalid
    /// - Policy doesn't match expected format
    #[msg("Invalid policy configuration")]
    InvalidPolicyConfig,

    /// The attestor account is not properly configured
    /// 
    /// This error occurs when:
    /// - Attestor account doesn't exist or is not registered
    /// - Attestor account is corrupted or invalid
    #[msg("Invalid attestor configuration")]
    InvalidAttestorConfig,

    /// General validation failure from predicate registry
    /// 
    /// This error occurs when:
    /// - The predicate registry validation fails
    /// - CPI call to validate_attestation returns an error
    #[msg("Predicate validation failed")]
    ValidationFailed,
}
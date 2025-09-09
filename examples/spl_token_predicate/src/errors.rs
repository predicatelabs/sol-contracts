//! # Error Module
//! 
//! This module contains all custom error definitions for the SPL Token Predicate
//! example program.

use anchor_lang::prelude::*;

/// Custom errors for the SPL Token Predicate program
#[error_code]
pub enum SplTokenPredicateError {
    /// Policy data is too long (max 200 bytes)
    #[msg("Policy data exceeds maximum length of 200 bytes")]
    PolicyTooLong,

    /// Policy data is empty or invalid
    #[msg("Policy data cannot be empty")]
    InvalidPolicy,

    /// Caller is not authorized to perform this action
    #[msg("Unauthorized: caller does not have permission")]
    Unauthorized,

    /// The provided token account is invalid
    #[msg("Invalid token account provided")]
    InvalidTokenAccount,

    /// The token mint does not match expected mint
    #[msg("Token mint mismatch")]
    TokenMintMismatch,

    /// Insufficient token balance for transfer
    #[msg("Insufficient token balance")]
    InsufficientBalance,

    /// Insufficient allowance for delegated transfer
    #[msg("Insufficient allowance for transfer")]
    InsufficientAllowance,

    /// Transfer amount exceeds policy limits
    #[msg("Transfer amount violates policy limits")]
    PolicyViolation,

    /// Attestation validation failed
    #[msg("Attestation validation failed")]
    AttestationValidationFailed,

    /// Task has expired
    #[msg("Task has expired")]
    TaskExpired,

    /// Transfer request has expired
    #[msg("Transfer request has expired")]
    TransferRequestExpired,

    /// Invalid transfer request
    #[msg("Invalid transfer request")]
    InvalidTransferRequest,

    /// Protected account is not active
    #[msg("Protected account is not active")]
    AccountNotActive,

    /// Transfer failed during execution
    #[msg("Token transfer failed")]
    TransferFailed,

    /// Arithmetic operation resulted in overflow
    #[msg("Arithmetic overflow")]
    ArithmeticError,

    /// Invalid UUID format
    #[msg("Invalid UUID format")]
    InvalidUUID,

    /// Task ID mismatch between task and attestation
    #[msg("Task ID does not match attestation ID")]
    TaskIdMismatch,

    /// Expiration mismatch between task and attestation
    #[msg("Task expiration does not match attestation expiration")]
    ExpirationMismatch,

    /// Invalid signature in attestation
    #[msg("Invalid signature in attestation")]
    InvalidSignature,

    /// Attestor is not registered
    #[msg("Attestor is not registered")]
    AttestorNotRegistered,

    /// Wrong attestor provided
    #[msg("Wrong attestor provided for validation")]
    WrongAttestor,

    /// Policy not found for client
    #[msg("Policy not found for client")]
    PolicyNotFound,

    /// Invalid program ID for CPI call
    #[msg("Invalid program ID for cross-program invocation")]
    InvalidProgramId,

    /// CPI call failed
    #[msg("Cross-program invocation failed")]
    CpiCallFailed,

    /// Invalid account for operation
    #[msg("Invalid account provided for operation")]
    InvalidAccount,

    /// Account already exists
    #[msg("Account already exists")]
    AccountAlreadyExists,

    /// Invalid bump seed
    #[msg("Invalid bump seed for PDA derivation")]
    InvalidBump,

    /// Token program mismatch
    #[msg("Token program mismatch")]
    TokenProgramMismatch,

    /// Invalid token account owner
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,

    /// Token account is frozen
    #[msg("Token account is frozen")]
    TokenAccountFrozen,

    /// Invalid mint authority
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,

    /// Operation not supported
    #[msg("Operation not supported")]
    OperationNotSupported,

    /// Invalid timestamp
    #[msg("Invalid timestamp provided")]
    InvalidTimestamp,

    /// Rate limit exceeded
    #[msg("Rate limit exceeded for this operation")]
    RateLimitExceeded,

    /// Daily limit exceeded
    #[msg("Daily transfer limit exceeded")]
    DailyLimitExceeded,

    /// Invalid policy format
    #[msg("Invalid policy format")]
    InvalidPolicyFormat,

    /// Policy parsing error
    #[msg("Error parsing policy configuration")]
    PolicyParsingError,

    /// Minimum transfer amount not met
    #[msg("Transfer amount below minimum threshold")]
    BelowMinimumAmount,

    /// Maximum transfer amount exceeded
    #[msg("Transfer amount exceeds maximum threshold")]
    ExceedsMaximumAmount,

    /// Invalid destination account
    #[msg("Invalid destination account")]
    InvalidDestination,

    /// Blacklisted account
    #[msg("Account is blacklisted")]
    BlacklistedAccount,

    /// Whitelist validation failed
    #[msg("Destination not in whitelist")]
    NotWhitelisted,

    /// Time-based restriction violated
    #[msg("Transfer not allowed at this time")]
    TimeRestrictionViolated,

    /// Multisig requirement not met
    #[msg("Multisig requirement not satisfied")]
    MultisigRequirementNotMet,

    /// Invalid nonce
    #[msg("Invalid nonce provided")]
    InvalidNonce,

    /// Replay attack detected
    #[msg("Replay attack detected")]
    ReplayAttack,

    /// Emergency stop activated
    #[msg("Emergency stop is activated")]
    EmergencyStop,

    /// Maintenance mode active
    #[msg("System is in maintenance mode")]
    MaintenanceMode,
}

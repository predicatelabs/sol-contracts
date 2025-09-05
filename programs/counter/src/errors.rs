//! # Error Module
//! 
//! This module contains all custom error types for the counter program.
//! Using custom errors provides better debugging information and user experience.

use anchor_lang::prelude::*;

/// Custom error codes for the counter program
#[error_code]
pub enum CounterError {
    /// Error when trying to increment beyond maximum value
    #[msg("Counter overflow: Cannot increment beyond maximum value")]
    CounterOverflow,
    
    /// Error when trying to decrement below minimum value
    #[msg("Counter underflow: Cannot decrement below zero")]
    CounterUnderflow,
    
    /// Error when unauthorized user tries to perform an action
    #[msg("Unauthorized: Only the authority can perform this action")]
    Unauthorized,
    
    /// Error when trying to initialize an already initialized counter
    #[msg("Already initialized: Counter has already been initialized")]
    AlreadyInitialized,
    
    /// Error when trying to perform operations on an uninitialized counter
    #[msg("Not initialized: Counter has not been initialized")]
    NotInitialized,
    
    /// Error when providing invalid parameters
    #[msg("Invalid parameter: The provided parameter is invalid")]
    InvalidParameter,
    
    /// Error when arithmetic operation fails
    #[msg("Arithmetic error: Mathematical operation failed")]
    ArithmeticError,
}

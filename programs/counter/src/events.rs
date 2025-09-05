//! # Events Module
//! 
//! This module contains all event definitions for the counter program.
//! Events provide a way to emit structured data that can be observed
//! by off-chain applications.

use anchor_lang::prelude::*;

/// Event emitted when a counter is initialized
#[event]
pub struct CounterInitialized {
    /// The public key of the counter account
    pub counter: Pubkey,
    /// The authority of the counter
    pub authority: Pubkey,
    /// The initial count value (should be 0)
    pub initial_count: u64,
    /// Timestamp when initialized
    pub timestamp: i64,
}

/// Event emitted when a counter is incremented
#[event]
pub struct CounterIncremented {
    /// The public key of the counter account
    pub counter: Pubkey,
    /// The authority who performed the increment
    pub authority: Pubkey,
    /// The previous count value
    pub previous_count: u64,
    /// The new count value
    pub new_count: u64,
    /// Timestamp when incremented
    pub timestamp: i64,
}

/// Event emitted when a counter is decremented
#[event]
pub struct CounterDecremented {
    /// The public key of the counter account
    pub counter: Pubkey,
    /// The authority who performed the decrement
    pub authority: Pubkey,
    /// The previous count value
    pub previous_count: u64,
    /// The new count value
    pub new_count: u64,
    /// Timestamp when decremented
    pub timestamp: i64,
}

/// Event emitted when a counter is reset
#[event]
pub struct CounterReset {
    /// The public key of the counter account
    pub counter: Pubkey,
    /// The authority who performed the reset
    pub authority: Pubkey,
    /// The previous count value
    pub previous_count: u64,
    /// Timestamp when reset
    pub timestamp: i64,
}

/// Event emitted when counter authority is transferred
#[event]
pub struct AuthorityTransferred {
    /// The public key of the counter account
    pub counter: Pubkey,
    /// The previous authority
    pub previous_authority: Pubkey,
    /// The new authority
    pub new_authority: Pubkey,
    /// Timestamp when transferred
    pub timestamp: i64,
}

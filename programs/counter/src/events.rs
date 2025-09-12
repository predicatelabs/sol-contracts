//! Events module for the Counter program
//! 
//! This module contains all event definitions that are emitted by the Counter program.
//! Events provide transparency and allow external systems to track program activity.

use anchor_lang::prelude::*;

/// Event emitted when a counter is successfully incremented
/// 
/// This event provides comprehensive information about the increment operation
/// including the counter account, owner, old and new values, and timestamp.
/// 
/// # Fields
/// * `counter` - The public key of the counter account
/// * `owner` - The public key of the counter owner  
/// * `old_value` - The counter value before increment
/// * `new_value` - The counter value after increment
/// * `timestamp` - Unix timestamp when the increment occurred
#[event]
pub struct CounterIncremented {
    /// The counter account that was incremented
    pub counter: Pubkey,
    /// The owner of the counter
    pub owner: Pubkey,
    /// The value before incrementing
    pub old_value: u64,
    /// The value after incrementing  
    pub new_value: u64,
    /// Timestamp when the increment occurred
    pub timestamp: i64,
}

/// Event emitted when a counter is initialized
/// 
/// This event is emitted when a new counter account is created and initialized.
/// 
/// # Fields
/// * `counter` - The public key of the newly created counter account
/// * `owner` - The public key of the counter owner
/// * `predicate_registry` - The predicate registry this counter is integrated with
/// * `initial_value` - The initial value of the counter (typically 0)
/// * `timestamp` - Unix timestamp when the counter was initialized
#[event]
pub struct CounterInitialized {
    /// The newly created counter account
    pub counter: Pubkey,
    /// The owner of the counter
    pub owner: Pubkey,
    /// The predicate registry this counter is integrated with
    pub predicate_registry: Pubkey,
    /// The initial value of the counter
    pub initial_value: u64,
    /// Timestamp when the counter was initialized
    pub timestamp: i64,
}
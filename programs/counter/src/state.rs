//! State module for the Counter program
//! 
//! This module contains all account structures and state definitions
//! for the Counter program.

use anchor_lang::prelude::*;

/// The main counter account that stores the counter state
/// 
/// This account maintains the counter value, ownership information,
/// and integration details with the predicate registry.
/// 
/// # Fields
/// * `owner` - The public key of the account that owns this counter
/// * `value` - The current counter value
/// * `predicate_registry` - The predicate registry this counter is integrated with
/// * `created_at` - Unix timestamp when the counter was created
/// * `updated_at` - Unix timestamp when the counter was last updated
#[account]
#[derive(InitSpace)]
pub struct CounterAccount {
    /// The owner of this counter
    pub owner: Pubkey,
    /// The current counter value
    pub value: u64,
    /// The predicate registry this counter is integrated with
    pub predicate_registry: Pubkey,
    /// Timestamp when created
    pub created_at: i64,
    /// Timestamp when last updated
    pub updated_at: i64,
}

impl CounterAccount {
    /// Initialize a new counter account
    /// 
    /// Sets up the counter with initial values and establishes the
    /// connection to the predicate registry.
    /// 
    /// # Arguments
    /// * `owner` - The public key of the counter owner
    /// * `predicate_registry` - The predicate registry to integrate with
    /// * `clock` - Current clock for timestamps
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn initialize(
        &mut self,
        owner: Pubkey,
        predicate_registry: Pubkey,
        clock: &Clock,
    ) -> Result<()> {
        self.owner = owner;
        self.value = 0;
        self.predicate_registry = predicate_registry;
        self.created_at = clock.unix_timestamp;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Increment the counter value
    /// 
    /// Safely increments the counter value by 1, checking for overflow.
    /// Updates the last modified timestamp.
    /// 
    /// # Arguments
    /// * `clock` - Current clock for timestamp updates
    /// 
    /// # Returns
    /// * `Result<u64>` - The new counter value after incrementing
    /// 
    /// # Errors
    /// * `ArithmeticError` - If incrementing would cause overflow
    pub fn increment(&mut self, clock: &Clock) -> Result<u64> {
        self.value = self.value
            .checked_add(1)
            .ok_or(crate::errors::CounterError::ArithmeticError)?;
        
        self.updated_at = clock.unix_timestamp;
        
        Ok(self.value)
    }
}

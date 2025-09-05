//! # State Module
//! 
//! This module contains all the account structures and state definitions
//! for the counter program.

use anchor_lang::prelude::*;

/// The main counter account that stores the counter state
#[account]
#[derive(InitSpace)]
pub struct Counter {
    /// The authority that can modify this counter
    pub authority: Pubkey,
    /// The current count value
    pub count: u64,
    /// Timestamp when the counter was created
    pub created_at: i64,
    /// Timestamp when the counter was last updated
    pub updated_at: i64,
    /// Total number of increments performed
    pub total_increments: u64,
    /// Total number of decrements performed
    pub total_decrements: u64,
}

impl Counter {
    /// Maximum value the counter can reach
    pub const MAX_COUNT: u64 = u64::MAX - 1;
    
    /// Minimum value the counter can reach
    pub const MIN_COUNT: u64 = 0;

    /// Initialize a new counter with default values
    pub fn initialize(&mut self, authority: Pubkey, clock: &Clock) -> Result<()> {
        self.authority = authority;
        self.count = 0;
        self.created_at = clock.unix_timestamp;
        self.updated_at = clock.unix_timestamp;
        self.total_increments = 0;
        self.total_decrements = 0;
        Ok(())
    }

    /// Increment the counter value
    pub fn increment(&mut self, clock: &Clock) -> Result<()> {
        require!(self.count < Self::MAX_COUNT, crate::CounterError::CounterOverflow);
        
        self.count = self.count.checked_add(1)
            .ok_or(crate::CounterError::CounterOverflow)?;
        self.total_increments = self.total_increments.checked_add(1)
            .ok_or(crate::CounterError::CounterOverflow)?;
        self.updated_at = clock.unix_timestamp;
        
        Ok(())
    }

    /// Decrement the counter value
    pub fn decrement(&mut self, clock: &Clock) -> Result<()> {
        require!(self.count > Self::MIN_COUNT, crate::CounterError::CounterUnderflow);
        
        self.count = self.count.checked_sub(1)
            .ok_or(crate::CounterError::CounterUnderflow)?;
        self.total_decrements = self.total_decrements.checked_add(1)
            .ok_or(crate::CounterError::CounterOverflow)?;
        self.updated_at = clock.unix_timestamp;
        
        Ok(())
    }

    /// Reset the counter to zero
    pub fn reset(&mut self, clock: &Clock) -> Result<()> {
        self.count = 0;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Transfer authority to a new account
    pub fn transfer_authority(&mut self, new_authority: Pubkey, clock: &Clock) -> Result<()> {
        self.authority = new_authority;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }
}

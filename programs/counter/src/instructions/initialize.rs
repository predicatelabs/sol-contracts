//! # Initialize Instruction
//! 
//! This module contains the logic for initializing a new counter account.

use anchor_lang::prelude::*;
use crate::events::CounterInitialized;
use super::Initialize;

/// Initialize a new counter account
/// 
/// This function creates a new counter account with the user as the authority.
/// The counter starts with a value of 0 and tracks creation/update timestamps.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing validated accounts
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * Emits `CounterInitialized` event with counter details
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let counter  = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    
    // Initialize the counter with the user as authority
    counter.initialize(ctx.accounts.user.key(), &clock)?;
    
    // Emit initialization event
    emit!(CounterInitialized {
        counter: counter.key(),
        authority: counter.authority,
        initial_count: counter.count,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Counter initialized! Authority: {}, Initial count: {}", 
        counter.authority, 
        counter.count
    );
    
    Ok(())
}

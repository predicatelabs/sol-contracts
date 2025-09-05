//! # Update Instructions
//! 
//! This module contains the logic for updating counter values:
//! increment, decrement, and reset operations.

use anchor_lang::prelude::*;
use crate::events::*;
use super::Update;

/// Increment the counter value by 1
/// 
/// # Arguments
/// * `ctx` - The instruction context containing validated accounts
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * Emits `CounterIncremented` event with before/after values
pub fn increment(ctx: Context<Update>) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    let previous_count = counter.count;
    
    // Increment the counter
    counter.increment(&clock)?;
    
    // Emit increment event
    emit!(CounterIncremented {
        counter: counter.key(),
        authority: ctx.accounts.authority.key(),
        previous_count,
        new_count: counter.count,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Counter incremented! Previous: {}, New: {}, Total increments: {}", 
        previous_count, 
        counter.count,
        counter.total_increments
    );
    
    Ok(())
}

/// Decrement the counter value by 1
/// 
/// # Arguments
/// * `ctx` - The instruction context containing validated accounts
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * Emits `CounterDecremented` event with before/after values
pub fn decrement(ctx: Context<Update>) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    let previous_count = counter.count;
    
    // Decrement the counter
    counter.decrement(&clock)?;
    
    // Emit decrement event
    emit!(CounterDecremented {
        counter: counter.key(),
        authority: ctx.accounts.authority.key(),
        previous_count,
        new_count: counter.count,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Counter decremented! Previous: {}, New: {}, Total decrements: {}", 
        previous_count, 
        counter.count,
        counter.total_decrements
    );
    
    Ok(())
}

/// Reset the counter value to 0
/// 
/// # Arguments
/// * `ctx` - The instruction context containing validated accounts
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * Emits `CounterReset` event with previous value
pub fn reset(ctx: Context<Update>) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    let previous_count = counter.count;
    
    // Reset the counter
    counter.reset(&clock)?;
    
    // Emit reset event
    emit!(CounterReset {
        counter: counter.key(),
        authority: ctx.accounts.authority.key(),
        previous_count,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Counter reset! Previous: {}, New: {}", 
        previous_count, 
        counter.count
    );
    
    Ok(())
}

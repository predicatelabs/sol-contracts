//! Get value instruction for the Counter program

use anchor_lang::prelude::*;
use crate::state::CounterAccount;

/// Get the current counter value
/// 
/// Public read-only function to retrieve the current counter value.
/// This function is not protected and can be called by anyone.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// 
/// # Returns
/// * `Result<u64>` - The current counter value
pub fn get_value(ctx: Context<GetValue>) -> Result<u64> {
    Ok(ctx.accounts.counter.get_value())
}

#[derive(Accounts)]
pub struct GetValue<'info> {
    pub counter: Account<'info, CounterAccount>,
}
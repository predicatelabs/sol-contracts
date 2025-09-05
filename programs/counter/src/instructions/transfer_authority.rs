//! # Transfer Authority Instruction
//! 
//! This module contains the logic for transferring counter authority
//! from one account to another.

use anchor_lang::prelude::*;
use crate::events::AuthorityTransferred;
use super::TransferAuthority;

/// Transfer authority of the counter to a new account
/// 
/// This function allows the current authority to transfer ownership
/// of the counter to another account. The new authority will have
/// full control over the counter operations.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing validated accounts
/// * `new_authority` - The public key of the new authority
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * Emits `AuthorityTransferred` event with old and new authorities
/// 
/// # Security
/// * Only the current authority can transfer ownership
/// * The new authority must be a valid public key
pub fn transfer_authority(
    ctx: Context<TransferAuthority>, 
    new_authority: Pubkey
) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    let previous_authority = counter.authority;
    
    // Validate that the new authority is different from current
    require!(
        new_authority != previous_authority,
        crate::CounterError::InvalidParameter
    );
    
    // Transfer authority
    counter.transfer_authority(new_authority, &clock)?;
    
    // Emit authority transfer event
    emit!(AuthorityTransferred {
        counter: counter.key(),
        previous_authority,
        new_authority,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Authority transferred! Previous: {}, New: {}", 
        previous_authority, 
        new_authority
    );
    
    Ok(())
}

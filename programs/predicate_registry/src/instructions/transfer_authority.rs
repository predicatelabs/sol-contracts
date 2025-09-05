//! Transfer authority instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::TransferAuthority;
use crate::events::AuthorityTransferred;

/// Transfer registry authority to a new account
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `new_authority` - The public key of the new authority
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let _current_authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    let previous_authority = registry.authority;

    // Transfer authority
    registry.transfer_authority(new_authority, &clock)?;

    // Emit authority transferred event
    emit!(AuthorityTransferred {
        registry: registry.key(),
        previous_authority,
        new_authority,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Registry authority transferred from {} to {}",
        previous_authority,
        new_authority
    );
    
    Ok(())
}

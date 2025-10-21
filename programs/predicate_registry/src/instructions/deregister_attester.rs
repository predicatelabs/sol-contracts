//! Deregister attester instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::DeregisterAttester;
use crate::events::AttesterDeregistered;

/// Deregister an existing attester
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `attester` - The public key of the attester to deregister
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn deregister_attester(ctx: Context<DeregisterAttester>, attester: Pubkey) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let attester_account = &mut ctx.accounts.attester_account;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Deregister the attester
    attester_account.deregister()?;

    // Update registry statistics
    registry.decrement_attester_count(&clock)?;

    // Emit attester deregistered event
    emit!(AttesterDeregistered {
        registry: registry.key(),
        attester,
        authority: authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Attester {} deregistered by authority {}", attester, authority.key());
    
    Ok(())
}


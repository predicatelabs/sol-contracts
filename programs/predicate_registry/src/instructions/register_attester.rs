//! Register attester instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::RegisterAttester;
use crate::events::AttesterRegistered;

/// Register a new attester
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `attester` - The public key of the attester to register
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn register_attester(ctx: Context<RegisterAttester>, attester: Pubkey) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let attester_account = &mut ctx.accounts.attester_account;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Initialize the attester account
    attester_account.initialize(attester, &clock)?;

    // Update registry statistics
    registry.increment_attester_count(&clock)?;

    // Emit attester registered event
    emit!(AttesterRegistered {
        registry: registry.key(),
        attester,
        authority: authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Attester {} registered by authority {}", attester, authority.key());
    
    Ok(())
}


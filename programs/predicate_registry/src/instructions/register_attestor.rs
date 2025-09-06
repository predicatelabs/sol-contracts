//! Register attestor instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::RegisterAttestor;
use crate::events::AttestorRegistered;

/// Register a new attestor
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `attestor` - The public key of the attestor to register
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn register_attestor(ctx: Context<RegisterAttestor>, attestor: Pubkey) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let attestor_account = &mut ctx.accounts.attestor_account;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Initialize the attestor account
    attestor_account.initialize(attestor, &clock)?;

    // Update registry statistics
    registry.increment_attestor_count(&clock)?;

    // Emit attestor registered event
    emit!(AttestorRegistered {
        registry: registry.key(),
        attestor,
        authority: authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Attestor {} registered by authority {}", attestor, authority.key());
    
    Ok(())
}
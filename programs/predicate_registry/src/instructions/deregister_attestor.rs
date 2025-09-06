//! Deregister attestor instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::DeregisterAttestor;
use crate::events::AttestorDeregistered;

/// Deregister an existing attestor
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `attestor` - The public key of the attestor to deregister
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn deregister_attestor(ctx: Context<DeregisterAttestor>, attestor: Pubkey) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let attestor_account = &mut ctx.accounts.attestor_account;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Deregister the attestor
    attestor_account.deregister()?;

    // Update registry statistics
    registry.decrement_attestor_count(&clock)?;

    // Emit attestor deregistered event
    emit!(AttestorDeregistered {
        registry: registry.key(),
        attestor,
        authority: authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Attestor {} deregistered by authority {}", attestor, authority.key());
    
    Ok(())
}
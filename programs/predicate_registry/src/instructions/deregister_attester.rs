//! Deregister attester instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::DeregisterAttester;
use crate::events::AttesterDeregistered;

/// Deregister an existing attester
/// 
/// This instruction closes the attester account, deleting it and returning
/// the rent to the authority who originally paid for it. This allows the
/// attester to be re-registered later if needed.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `attester` - The public key of the attester to deregister
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn deregister_attester(ctx: Context<DeregisterAttester>, attester: Pubkey) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let _attester_account = &ctx.accounts.attester_account;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Note: The account is automatically closed by the `close = authority` constraint
    // in the DeregisterAttester context, which deletes the account and returns rent.

    // Update registry statistics
    registry.decrement_attester_count(&clock)?;

    // Emit attester deregistered event
    emit!(AttesterDeregistered {
        registry: registry.key(),
        attester,
        authority: authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Attester {} deregistered by authority {} (account closed, rent returned)", 
         attester, authority.key());
    
    Ok(())
}


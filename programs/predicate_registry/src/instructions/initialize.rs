//! Initialize instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::Initialize;
use crate::events::RegistryInitialized;

/// Initialize a new predicate registry
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// 
/// # Returns
/// * `Result<()>` - Success or error
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let authority = &ctx.accounts.authority;
    let clock = Clock::get()?;

    // Initialize the registry
    registry.initialize(authority.key(), &clock)?;

    // Emit initialization event
    emit!(RegistryInitialized {
        registry: registry.key(),
        authority: authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Predicate registry initialized with authority: {}", authority.key());
    
    Ok(())
}

//! Initialize instruction for the Counter program

use anchor_lang::prelude::*;
use predicate_registry::{
    program::PredicateRegistry,
    PredicateRegistry as PredicateRegistryAccount,
    PolicyAccount,
};
use crate::state::CounterAccount;
use crate::events::CounterInitialized;

/// Initialize a new counter with predicate-registry integration
/// 
/// Creates a counter account and sets up integration with the predicate-registry.
/// The counter owner must have a policy set in the predicate-registry.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * `CounterInitialized` - Emitted when counter is successfully initialized
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    
    // Initialize the counter using the state method
    counter.initialize(
        ctx.accounts.owner.key(),
        ctx.accounts.predicate_registry.key(),
        &clock,
    )?;

    // Emit initialization event
    emit!(CounterInitialized {
        counter: counter.key(),
        owner: counter.owner,
        predicate_registry: counter.predicate_registry,
        initial_value: counter.value,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Counter initialized with value 0 for owner {}", counter.owner);
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + CounterAccount::INIT_SPACE,
        seeds = [b"counter", owner.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, CounterAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// The predicate registry account
    pub predicate_registry: Account<'info, PredicateRegistryAccount>,

    /// Policy account for the owner in the predicate registry
    #[account(
        seeds = [b"policy", owner.key().as_ref()],
        bump,
        seeds::program = predicate_registry_program.key()
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    pub predicate_registry_program: Program<'info, PredicateRegistry>,
    pub system_program: Program<'info, System>,
}
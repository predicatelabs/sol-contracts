//! # Instructions Module
//! 
//! This module contains all instruction handlers and account validation contexts
//! for the counter program.

use anchor_lang::prelude::*;
use crate::state::Counter;
use crate::events::*;
use crate::errors::CounterError;

// Import all instruction modules
pub mod initialize;
pub mod update;
pub mod transfer_authority;

// Re-export instruction functions
pub use initialize::*;
pub use update::*;
pub use transfer_authority::*;

/// Account validation context for initializing a new counter
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The counter account to be created
    #[account(
        init,
        payer = user,
        space = 8 + Counter::INIT_SPACE,
        seeds = [b"counter", user.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,
    
    /// The user who will be the authority and payer
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Account validation context for updating counter (increment/decrement/reset)
#[derive(Accounts)]
pub struct Update<'info> {
    /// The counter account to be updated
    #[account(
        mut,
        has_one = authority @ CounterError::Unauthorized,
        seeds = [b"counter", authority.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,
    
    /// The authority who can modify the counter
    pub authority: Signer<'info>,
}

/// Account validation context for transferring authority
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    /// The counter account whose authority will be transferred
    #[account(
        mut,
        has_one = authority @ CounterError::Unauthorized,
        seeds = [b"counter", authority.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,
    
    /// The current authority
    pub authority: Signer<'info>,
    
    /// The new authority (must be a valid account)
    /// CHECK: This is safe because we only store the pubkey
    pub new_authority: AccountInfo<'info>,
}

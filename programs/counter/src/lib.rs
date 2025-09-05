//! # Counter Program
//! 
//! A simple counter program demonstrating best practices for Solana program development
//! using the Anchor framework. This program allows users to create, increment, and 
//! decrement counter accounts with proper access control.

use anchor_lang::prelude::*;

// Import our modules
pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

// Re-export for easier access
pub use instructions::*;
pub use state::*;
pub use errors::*;
pub use events::*;

// Program ID - This should be updated when you deploy
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Main program module containing all instruction handlers
#[program]
pub mod counter {
    use super::*;

    /// Initialize a new counter account
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    /// Increment the counter value by 1
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn increment(ctx: Context<Update>) -> Result<()> {
        instructions::increment(ctx)
    }

    /// Decrement the counter value by 1
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn decrement(ctx: Context<Update>) -> Result<()> {
        instructions::decrement(ctx)
    }

    /// Reset the counter to zero (only authority can do this)
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn reset(ctx: Context<Update>) -> Result<()> {
        instructions::reset(ctx)
    }

    /// Transfer authority to a new account
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `new_authority` - The public key of the new authority
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        instructions::transfer_authority(ctx, new_authority)
    }
}
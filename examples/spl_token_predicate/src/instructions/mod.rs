//! # Instructions Module
//! 
//! This module contains all instruction handlers and account validation contexts
//! for the SPL Token Predicate example program.

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;
use crate::errors::SplTokenPredicateError;

// Import all instruction modules
pub mod initialize;
pub mod update_policy;
pub mod protected_transfer;
pub mod protected_transfer_from;

// Re-export instruction functions
pub use initialize::*;
pub use update_policy::*;
pub use protected_transfer::*;
pub use protected_transfer_from::*;

/// Account validation context for initializing a protected token account
#[derive(Accounts)]
#[instruction(policy: Vec<u8>)]
pub struct InitializeProtectedAccount<'info> {
    /// The protected token account to be created
    #[account(
        init,
        payer = owner,
        space = 8 + ProtectedTokenAccount::INIT_SPACE,
        seeds = [
            b"protected_token",
            token_account.key().as_ref(),
            owner.key().as_ref()
        ],
        bump
    )]
    pub protected_account: Account<'info, ProtectedTokenAccount>,
    
    /// The underlying SPL token account
    #[account(
        constraint = token_account.owner == owner.key() @ SplTokenPredicateError::InvalidTokenAccountOwner,
        constraint = token_account.mint == mint.key() @ SplTokenPredicateError::TokenMintMismatch
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    /// The token mint
    pub mint: Account<'info, Mint>,
    
    /// The owner of the token account
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// The predicate registry program
    /// CHECK: This is the predicate registry program ID
    pub predicate_registry: AccountInfo<'info>,
    
    /// The registry account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub registry: AccountInfo<'info>,
    
    /// The policy account in predicate registry (will be created if needed)
    /// CHECK: This will be validated by the predicate registry program
    pub policy_account: AccountInfo<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

/// Account validation context for updating a policy
#[derive(Accounts)]
#[instruction(new_policy: Vec<u8>)]
pub struct UpdatePolicy<'info> {
    /// The protected token account to update
    #[account(
        mut,
        seeds = [
            b"protected_token",
            protected_account.token_account.as_ref(),
            owner.key().as_ref()
        ],
        bump = protected_account.bump,
        constraint = protected_account.owner == owner.key() @ SplTokenPredicateError::Unauthorized
    )]
    pub protected_account: Account<'info, ProtectedTokenAccount>,
    
    /// The account owner
    pub owner: Signer<'info>,
    
    /// The predicate registry program
    /// CHECK: This is the predicate registry program ID
    pub predicate_registry: AccountInfo<'info>,
    
    /// The registry account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub registry: AccountInfo<'info>,
    
    /// The policy account in predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub policy_account: AccountInfo<'info>,
}

/// Account validation context for protected token transfer
#[derive(Accounts)]
#[instruction(
    task: predicate_registry::state::Task,
    attestation: predicate_registry::state::Attestation,
    amount: u64
)]
pub struct ProtectedTransfer<'info> {
    /// The protected token account
    #[account(
        mut,
        seeds = [
            b"protected_token",
            protected_account.token_account.as_ref(),
            owner.key().as_ref()
        ],
        bump = protected_account.bump,
        constraint = protected_account.owner == owner.key() @ SplTokenPredicateError::Unauthorized,
        constraint = protected_account.can_transfer() @ SplTokenPredicateError::AccountNotActive
    )]
    pub protected_account: Account<'info, ProtectedTokenAccount>,
    
    /// The source SPL token account
    #[account(
        mut,
        constraint = source_token_account.key() == protected_account.token_account @ SplTokenPredicateError::InvalidTokenAccount,
        constraint = source_token_account.owner == owner.key() @ SplTokenPredicateError::InvalidTokenAccountOwner,
        constraint = source_token_account.amount >= amount @ SplTokenPredicateError::InsufficientBalance
    )]
    pub source_token_account: Account<'info, TokenAccount>,
    
    /// The destination SPL token account
    #[account(
        mut,
        constraint = destination_token_account.mint == source_token_account.mint @ SplTokenPredicateError::TokenMintMismatch
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    
    /// The token account owner
    pub owner: Signer<'info>,
    
    /// The predicate registry program
    /// CHECK: This is the predicate registry program ID
    #[account(constraint = predicate_registry.key() == predicate_registry::ID @ SplTokenPredicateError::InvalidProgramId)]
    pub predicate_registry: AccountInfo<'info>,
    
    /// The registry account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub registry: AccountInfo<'info>,
    
    /// The attestor account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub attestor_account: AccountInfo<'info>,
    
    /// The policy account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub policy_account: AccountInfo<'info>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

/// Account validation context for protected token transfer from (delegated)
#[derive(Accounts)]
#[instruction(
    task: predicate_registry::state::Task,
    attestation: predicate_registry::state::Attestation,
    amount: u64
)]
pub struct ProtectedTransferFrom<'info> {
    /// The protected token account
    #[account(
        mut,
        seeds = [
            b"protected_token",
            protected_account.token_account.as_ref(),
            protected_account.owner.as_ref()
        ],
        bump = protected_account.bump,
        constraint = protected_account.can_transfer() @ SplTokenPredicateError::AccountNotActive
    )]
    pub protected_account: Account<'info, ProtectedTokenAccount>,
    
    /// The source SPL token account
    #[account(
        mut,
        constraint = source_token_account.key() == protected_account.token_account @ SplTokenPredicateError::InvalidTokenAccount,
        constraint = source_token_account.amount >= amount @ SplTokenPredicateError::InsufficientBalance
    )]
    pub source_token_account: Account<'info, TokenAccount>,
    
    /// The destination SPL token account
    #[account(
        mut,
        constraint = destination_token_account.mint == source_token_account.mint @ SplTokenPredicateError::TokenMintMismatch
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    
    /// The delegate who is performing the transfer
    pub delegate: Signer<'info>,
    
    /// The predicate registry program
    /// CHECK: This is the predicate registry program ID
    #[account(constraint = predicate_registry.key() == predicate_registry::ID @ SplTokenPredicateError::InvalidProgramId)]
    pub predicate_registry: AccountInfo<'info>,
    
    /// The registry account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub registry: AccountInfo<'info>,
    
    /// The attestor account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub attestor_account: AccountInfo<'info>,
    
    /// The policy account from predicate registry
    /// CHECK: This will be validated by the predicate registry program
    pub policy_account: AccountInfo<'info>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

/// Account validation context for getting policy (view function)
#[derive(Accounts)]
pub struct GetPolicy<'info> {
    /// The protected token account
    #[account(
        seeds = [
            b"protected_token",
            protected_account.token_account.as_ref(),
            protected_account.owner.as_ref()
        ],
        bump = protected_account.bump
    )]
    pub protected_account: Account<'info, ProtectedTokenAccount>,
}

/// Account validation context for getting transfer stats (view function)
#[derive(Accounts)]
pub struct GetTransferStats<'info> {
    /// The protected token account
    #[account(
        seeds = [
            b"protected_token",
            protected_account.token_account.as_ref(),
            protected_account.owner.as_ref()
        ],
        bump = protected_account.bump
    )]
    pub protected_account: Account<'info, ProtectedTokenAccount>,
}

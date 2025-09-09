//! # Instructions Module
//! 
//! This module contains all instruction handlers and account validation contexts
//! for the predicate registry program.

use anchor_lang::prelude::*;
use crate::state::*;
// Events are imported in individual instruction files as needed
use crate::errors::PredicateRegistryError;

// Import all instruction modules
pub mod initialize;
pub mod register_attestor;
pub mod deregister_attestor;
pub mod set_policy;
pub mod update_policy;
pub mod validate_attestation;
pub mod transfer_authority;

// Re-export instruction functions
pub use initialize::*;
pub use register_attestor::*;
pub use deregister_attestor::*;
pub use set_policy::*;
pub use update_policy::*;
pub use validate_attestation::*;
pub use transfer_authority::*;

/// Account validation context for initializing a new registry
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The registry account to be created
    #[account(
        init,
        payer = authority,
        space = 8 + PredicateRegistry::INIT_SPACE,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The authority who will own the registry
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Account validation context for registering an attestor
#[derive(Accounts)]
#[instruction(attestor: Pubkey)]
pub struct RegisterAttestor<'info> {
    /// The registry account
    #[account(
        mut,
        has_one = authority @ PredicateRegistryError::Unauthorized,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The attestor account to be created
    #[account(
        init,
        payer = authority,
        space = 8 + AttestorAccount::INIT_SPACE,
        seeds = [b"attestor", attestor.as_ref()],
        bump
    )]
    pub attestor_account: Account<'info, AttestorAccount>,
    
    /// The registry authority
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Account validation context for deregistering an attestor
#[derive(Accounts)]
#[instruction(attestor: Pubkey)]
pub struct DeregisterAttestor<'info> {
    /// The registry account
    #[account(
        mut,
        has_one = authority @ PredicateRegistryError::Unauthorized,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The attestor account to be deregistered
    #[account(
        mut,
        seeds = [b"attestor", attestor.as_ref()],
        bump,
        constraint = attestor_account.is_registered @ PredicateRegistryError::AttestorNotRegistered
    )]
    pub attestor_account: Account<'info, AttestorAccount>,
    
    /// The registry authority
    pub authority: Signer<'info>,
}

/// Account validation context for setting a policy
#[derive(Accounts)]
pub struct SetPolicy<'info> {
    /// The registry account (for event emission)
    #[account(
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The policy account to be created
    #[account(
        init,
        payer = client,
        space = 8 + PolicyAccount::INIT_SPACE,
        seeds = [b"policy", client.key().as_ref()],
        bump
    )]
    pub policy_account: Account<'info, PolicyAccount>,
    
    /// The client setting the policy
    #[account(mut)]
    pub client: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Account validation context for updating a policy
#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    /// The registry account (for event emission)
    #[account(
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The policy account to be updated
    #[account(
        mut,
        seeds = [b"policy", client.key().as_ref()],
        bump,
        constraint = policy_account.client == client.key() @ PredicateRegistryError::Unauthorized
    )]
    pub policy_account: Account<'info, PolicyAccount>,
    
    /// The client updating the policy
    pub client: Signer<'info>,
}

/// Account validation context for validating an attestation
#[derive(Accounts)]
#[instruction(task: Task, attestor_key: Pubkey)]
pub struct ValidateAttestation<'info> {    
    /// The registry account
    #[account(
        mut,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    /// The attestor account that made the attestation
    #[account(
        mut,
        seeds = [b"attestor", attestor_key.as_ref()],
        bump,
        constraint = attestor_account.is_registered @ PredicateRegistryError::AttestorNotRegisteredForValidation
    )]
    pub attestor_account: Account<'info, AttestorAccount>,
    
    /// The policy account for the client
    #[account(
        seeds = [b"policy", task.msg_sender.as_ref()],
        bump
    )]
    pub policy_account: Account<'info, PolicyAccount>,
    
    /// The validator calling this instruction
    pub validator: Signer<'info>,
}

/// Account validation context for transferring authority
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    /// The registry account whose authority will be transferred
    #[account(
        mut,
        has_one = authority @ PredicateRegistryError::Unauthorized,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The current authority
    pub authority: Signer<'info>,
    
    /// The new authority (must be a valid account)
    /// CHECK: This is safe because we only store the pubkey
    pub new_authority: AccountInfo<'info>,
}

/// Account validation context for getting registered attestors (view function)
#[derive(Accounts)]
pub struct GetRegisteredAttestors<'info> {
    /// The registry account
    #[account(
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
}

/// Account validation context for getting a policy (view function)
#[derive(Accounts)]
#[instruction(client: Pubkey)]
pub struct GetPolicy<'info> {
    /// The registry account
    #[account(
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The policy account for the client
    #[account(
        seeds = [b"policy", client.as_ref()],
        bump
    )]
    pub policy_account: Account<'info, PolicyAccount>,
}

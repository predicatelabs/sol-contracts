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
pub mod register_attester;
pub mod deregister_attester;
pub mod set_policy_id;
pub mod update_policy_id;
pub mod validate_attestation;
pub mod cleanup_expired_uuid;
pub mod transfer_authority;

// Re-export instruction functions
pub use initialize::*;
pub use register_attester::*;
pub use deregister_attester::*;
pub use set_policy_id::*;
pub use update_policy_id::*;
pub use validate_attestation::*;
pub use cleanup_expired_uuid::*;
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

/// Account validation context for registering an attester
#[derive(Accounts)]
#[instruction(attester: Pubkey)]
pub struct RegisterAttester<'info> {
    /// The registry account
    #[account(
        mut,
        has_one = authority @ PredicateRegistryError::Unauthorized,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The attester account to be created
    #[account(
        init,
        payer = authority,
        space = 8 + AttesterAccount::INIT_SPACE,
        seeds = [b"attester", attester.as_ref()],
        bump
    )]
    pub attester_account: Account<'info, AttesterAccount>,
    
    /// The registry authority
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Account validation context for deregistering an attester
#[derive(Accounts)]
#[instruction(attester: Pubkey)]
pub struct DeregisterAttester<'info> {
    /// The registry account
    #[account(
        mut,
        has_one = authority @ PredicateRegistryError::Unauthorized,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The attester account to be deregistered
    #[account(
        mut,
        seeds = [b"attester", attester.as_ref()],
        bump,
        constraint = attester_account.is_registered @ PredicateRegistryError::AttesterNotRegistered
    )]
    pub attester_account: Account<'info, AttesterAccount>,
    
    /// The registry authority
    pub authority: Signer<'info>,
}

/// Account validation context for setting a policy ID
#[derive(Accounts)]
pub struct SetPolicyId<'info> {
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

/// Account validation context for updating a policy ID
#[derive(Accounts)]
pub struct UpdatePolicyId<'info> {
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
#[instruction(statement: Statement, attester_key: Pubkey)]
pub struct ValidateAttestation<'info> {    
    /// The registry account
    #[account(
        mut,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    /// The attester account that made the attestation
    #[account(
        mut,
        seeds = [b"attester", attester_key.as_ref()],
        bump,
        constraint = attester_account.is_registered @ PredicateRegistryError::AttesterNotRegisteredForValidation
    )]
    pub attester_account: Account<'info, AttesterAccount>,
    
    /// The policy account for the client
    #[account(
        seeds = [b"policy", statement.msg_sender.as_ref()],
        bump
    )]
    pub policy_account: Account<'info, PolicyAccount>,
    
    /// The used UUID account (replay protection)
    /// Must be created for first use, will fail if already exists
    #[account(
        init,
        payer = validator,
        space = 8 + UsedUuidAccount::INIT_SPACE,
        seeds = [b"used_uuid", statement.uuid.as_ref()],
        bump
    )]
    pub used_uuid_account: Account<'info, UsedUuidAccount>,
    
    /// The validator calling this instruction (also payer for UUID account)
    #[account(mut)]
    pub validator: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
    
    /// Instructions sysvar for signature verification
    /// CHECK: This is the instructions sysvar account
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
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

/// Account validation context for cleaning up expired UUIDs
#[derive(Accounts)]
pub struct CleanupExpiredUuid<'info> {
    /// The used UUID account to be cleaned up (closed)
    #[account(
        mut,
        close = validator_recipient,
        seeds = [b"used_uuid", &used_uuid_account.uuid],
        bump
    )]
    pub used_uuid_account: Account<'info, UsedUuidAccount>,
    
    /// The original validator (payer) who will receive the rent refund
    /// CHECK: This is the account that originally paid for the UUID account
    #[account(mut)]
    pub validator_recipient: AccountInfo<'info>,
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

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

/// Clock drift buffer for attestation expiration validation
/// 
/// This constant defines the time window (in seconds) after an attestation's
/// expiration time during which the attestation is still considered valid.
/// This buffer accounts for clock drift between different systems.
/// 
/// This value must be consistent across:
/// - `validate_attestation`: Allows validation if `current_timestamp <= expiration + CLOCK_DRIFT_BUFFER`
/// - `cleanup_expired_uuid`: Prevents cleanup if `current_timestamp <= expiration + CLOCK_DRIFT_BUFFER`
pub const CLOCK_DRIFT_BUFFER: i64 = 30; // 30 seconds

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
/// 
/// Policies are owned by PROGRAMS, not users. This context:
/// - Creates a policy PDA derived from the client program's address
/// - Verifies the signer is the program's upgrade authority
/// - Stores both the program address and the authority
#[derive(Accounts)]
#[instruction(client_program: Pubkey)]
pub struct SetPolicyId<'info> {
    /// The registry account (for event emission and stats tracking)
    #[account(
        mut,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The policy account to be created (derived from client program, not user)
    #[account(
        init,
        payer = authority,
        space = 8 + PolicyAccount::INIT_SPACE,
        seeds = [b"policy", client_program.key().as_ref()],
        bump
    )]
    pub policy_account: Account<'info, PolicyAccount>,
    
    /// The client program that this policy applies to
    /// CHECK: Can be any program address; verified via program_data
    pub client_program: AccountInfo<'info>,
    
    /// The program data account for the client program
    /// This is used to verify the upgrade authority
    /// CHECK: Verified via seeds and deserialization in instruction logic
    #[account(
        seeds = [client_program.key().as_ref()],
        bump,
        seeds::program = anchor_lang::solana_program::bpf_loader_upgradeable::ID,
    )]
    pub program_data: AccountInfo<'info>,
    
    /// The upgrade authority of the client program
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Account validation context for updating a policy ID
/// 
/// Updates an existing policy for a PROGRAM. Only the program's upgrade
/// authority can call this instruction.
#[derive(Accounts)]
#[instruction(client_program: Pubkey)]
pub struct UpdatePolicyId<'info> {
    /// The registry account (for event emission)
    #[account(
        mut,
        seeds = [b"predicate_registry"],
        bump
    )]
    pub registry: Account<'info, PredicateRegistry>,
    
    /// The policy account to be updated (derived from client program)
    #[account(
        mut,
        seeds = [b"policy", client_program.key().as_ref()],
        bump,
        constraint = policy_account.client_program == client_program.key() @ PredicateRegistryError::InvalidClientProgram
    )]
    pub policy_account: Account<'info, PolicyAccount>,
    
    /// The client program (for PDA derivation)
    /// CHECK: Verified via policy_account constraint
    pub client_program: AccountInfo<'info>,
    
    /// The program data account for the client program
    /// CHECK: Verified via seeds and deserialization in instruction logic
    #[account(
        seeds = [client_program.key().as_ref()],
        bump,
        seeds::program = anchor_lang::solana_program::bpf_loader_upgradeable::ID,
    )]
    pub program_data: AccountInfo<'info>,
    
    /// The upgrade authority of the client program
    #[account(mut)]
    pub authority: Signer<'info>,
}

/// Account validation context for validating an attestation
/// 
/// The policy is derived from the target program being called, not from the
/// transaction signer. This ensures policies are tied to programs.
#[derive(Accounts)]
#[instruction(
    target: Pubkey,
    msg_value: u64,
    encoded_sig_and_args: Vec<u8>,
    attester_key: Pubkey,
    attestation: Attestation
)]
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
    
    /// The policy account for the TARGET PROGRAM (not the user)
    /// This is the key change: policy is tied to the program being called
    #[account(
        seeds = [b"policy", target.as_ref()],
        bump,
        constraint = policy_account.client_program == target @ PredicateRegistryError::InvalidClientProgram
    )]
    pub policy_account: Account<'info, PolicyAccount>,
    
    /// The used UUID account (replay protection)
    /// Must be created for first use, will fail if already exists
    #[account(
        init,
        payer = signer,
        space = 8 + UsedUuidAccount::INIT_SPACE,
        seeds = [b"used_uuid", attestation.uuid.as_ref()],
        bump
    )]
    pub used_uuid_account: Account<'info, UsedUuidAccount>,
    
    /// The user calling the program (validated against program's policy)
    #[account(mut)]
    pub signer: Signer<'info>,
    
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
}

/// Account validation context for cleaning up expired UUIDs
#[derive(Accounts)]
pub struct CleanupExpiredUuid<'info> {
    /// The used UUID account to be cleaned up (closed)
    #[account(
        mut,
        close = signer_recipient,
        seeds = [b"used_uuid", &used_uuid_account.uuid],
        bump,
        // Enforce rent refund goes to the original payer
        // This prevents unauthorized rent theft
        constraint = signer_recipient.key() == used_uuid_account.signer
            @ PredicateRegistryError::Unauthorized
    )]
    pub used_uuid_account: Account<'info, UsedUuidAccount>,
    
    /// The original signer (payer) who will receive the rent refund
    /// CHECK: Safe via constraint above; verified to match used_uuid_account.signer
    #[account(mut)]
    pub signer_recipient: AccountInfo<'info>,
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

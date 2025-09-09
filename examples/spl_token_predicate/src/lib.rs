//! # SPL Token Predicate Example Program
//! 
//! This example program demonstrates how to integrate SPL Token functionality
//! with the Predicate Registry for attestation-based token transfers.
//! 
//! ## Features
//! - Protected token accounts with policy enforcement
//! - Attestation-gated token transfers
//! - Policy management (set/update)
//! - Integration with Predicate Registry via CPI
//! 
//! ## Security
//! All token transfers require valid attestations from registered attestors
//! and must comply with the account's policy configuration.

use anchor_lang::prelude::*;

// Import modules
pub mod state;
pub mod instructions;
pub mod errors;
pub mod events;

// Re-export for easy access
pub use state::*;
pub use instructions::*;
pub use errors::*;
pub use events::*;

declare_id!("SptPRED1cateExamp1e111111111111111111111111");

#[program]
pub mod spl_token_predicate {
    use super::*;

    /// Initialize a new protected token account with policy enforcement
    /// 
    /// Creates a protected wrapper around an SPL token account that requires
    /// attestation validation for all transfers. The policy defines the rules
    /// and restrictions for token operations.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `policy` - The policy data (max 200 bytes)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `ProtectedAccountInitialized` - Emitted when account is successfully created
    /// 
    /// # Errors
    /// * `PolicyTooLong` - If policy data exceeds 200 bytes
    /// * `InvalidPolicy` - If policy data is empty
    /// * `InvalidTokenAccount` - If token account is invalid
    pub fn initialize_protected_account(
        ctx: Context<InitializeProtectedAccount>,
        policy: Vec<u8>
    ) -> Result<()> {
        instructions::initialize_protected_account(ctx, policy)
    }

    /// Update the policy for an existing protected token account
    /// 
    /// Allows the account owner to modify the policy rules for their
    /// protected token account. This also updates the corresponding
    /// policy in the Predicate Registry.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `new_policy` - The new policy data (max 200 bytes)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `PolicyUpdated` - Emitted when policy is successfully updated
    /// 
    /// # Errors
    /// * `PolicyTooLong` - If policy data exceeds 200 bytes
    /// * `InvalidPolicy` - If policy data is empty
    /// * `Unauthorized` - If caller is not the account owner
    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        new_policy: Vec<u8>
    ) -> Result<()> {
        instructions::update_policy(ctx, new_policy)
    }

    /// Execute a protected token transfer with attestation validation
    /// 
    /// Transfers tokens from the protected account to a destination account
    /// after validating the provided attestation through the Predicate Registry.
    /// The transfer must comply with the account's policy.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `task` - The task describing the transfer operation
    /// * `attestation` - The attestation from a registered attestor
    /// * `amount` - The amount of tokens to transfer
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `ProtectedTransfer` - Emitted when transfer is successfully executed
    /// 
    /// # Errors
    /// * `AttestationValidationFailed` - If attestation validation fails
    /// * `InsufficientBalance` - If account has insufficient tokens
    /// * `PolicyViolation` - If transfer violates account policy
    /// * `TransferFailed` - If SPL token transfer fails
    pub fn protected_transfer(
        ctx: Context<ProtectedTransfer>,
        task: predicate_registry::state::Task,
        attestation: predicate_registry::state::Attestation,
        amount: u64
    ) -> Result<()> {
        instructions::protected_transfer(ctx, task, attestation, amount)
    }

    /// Execute a protected token transfer from another account (delegated transfer)
    /// 
    /// Similar to protected_transfer but allows transferring tokens from an account
    /// that has granted allowance to the caller. Requires attestation validation.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// * `task` - The task describing the transfer operation
    /// * `attestation` - The attestation from a registered attestor
    /// * `amount` - The amount of tokens to transfer
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `ProtectedTransferFrom` - Emitted when transfer is successfully executed
    /// 
    /// # Errors
    /// * `AttestationValidationFailed` - If attestation validation fails
    /// * `InsufficientAllowance` - If insufficient allowance for transfer
    /// * `PolicyViolation` - If transfer violates account policy
    /// * `TransferFailed` - If SPL token transfer fails
    pub fn protected_transfer_from(
        ctx: Context<ProtectedTransferFrom>,
        task: predicate_registry::state::Task,
        attestation: predicate_registry::state::Attestation,
        amount: u64
    ) -> Result<()> {
        instructions::protected_transfer_from(ctx, task, attestation, amount)
    }

    /// Get the policy for a protected token account (view function)
    /// 
    /// Returns the current policy configuration for the specified
    /// protected token account.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<Vec<u8>>` - The policy data or error
    pub fn get_policy(ctx: Context<GetPolicy>) -> Result<Vec<u8>> {
        let protected_account = &ctx.accounts.protected_account;
        Ok(protected_account.get_policy().to_vec())
    }

    /// Get transfer statistics for a protected token account (view function)
    /// 
    /// Returns statistics about transfers for the specified protected
    /// token account, including total transfer count and timestamps.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<TransferStats>` - The transfer statistics or error
    pub fn get_transfer_stats(ctx: Context<GetTransferStats>) -> Result<TransferStats> {
        let protected_account = &ctx.accounts.protected_account;
        Ok(TransferStats {
            transfer_count: protected_account.transfer_count,
            created_at: protected_account.created_at,
            updated_at: protected_account.updated_at,
        })
    }
}

/// Transfer statistics structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransferStats {
    pub transfer_count: u64,
    pub created_at: i64,
    pub updated_at: i64,
}

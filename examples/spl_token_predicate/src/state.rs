//! # State Module
//! 
//! This module contains all the account structures and state definitions
//! for the SPL Token Predicate example program.

use anchor_lang::prelude::*;

/// Protected token account that enforces policy-based transfers
/// 
/// This account wraps an SPL token account and requires attestation
/// validation through the Predicate Registry for all transfer operations.
#[account]
#[derive(InitSpace)]
pub struct ProtectedTokenAccount {
    /// The underlying SPL token account
    pub token_account: Pubkey,
    /// The token mint
    pub mint: Pubkey,
    /// The owner of this protected account
    pub owner: Pubkey,
    /// Policy data (fixed 200 bytes for efficiency)
    pub policy: [u8; 200],
    /// The actual length of the policy data
    pub policy_len: u16,
    /// Creation timestamp
    pub created_at: i64,
    /// Last update timestamp
    pub updated_at: i64,
    /// Total number of successful transfers
    pub transfer_count: u64,
    /// Total amount transferred (in token base units)
    pub total_transferred: u64,
    /// Whether the account is currently active
    pub is_active: bool,
    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl ProtectedTokenAccount {
    /// Initialize a new protected token account
    pub fn initialize(
        &mut self,
        token_account: Pubkey,
        mint: Pubkey,
        owner: Pubkey,
        policy: &[u8],
        bump: u8,
        clock: &Clock
    ) -> Result<()> {
        require!(policy.len() <= 200, crate::SplTokenPredicateError::PolicyTooLong);
        require!(!policy.is_empty(), crate::SplTokenPredicateError::InvalidPolicy);
        
        self.token_account = token_account;
        self.mint = mint;
        self.owner = owner;
        self.policy = [0u8; 200];
        self.policy[..policy.len()].copy_from_slice(policy);
        self.policy_len = policy.len() as u16;
        self.created_at = clock.unix_timestamp;
        self.updated_at = clock.unix_timestamp;
        self.transfer_count = 0;
        self.total_transferred = 0;
        self.is_active = true;
        self.bump = bump;
        
        Ok(())
    }

    /// Update the policy for this protected account
    pub fn update_policy(&mut self, new_policy: &[u8], clock: &Clock) -> Result<()> {
        require!(new_policy.len() <= 200, crate::SplTokenPredicateError::PolicyTooLong);
        require!(!new_policy.is_empty(), crate::SplTokenPredicateError::InvalidPolicy);
        
        self.policy = [0u8; 200];
        self.policy[..new_policy.len()].copy_from_slice(new_policy);
        self.policy_len = new_policy.len() as u16;
        self.updated_at = clock.unix_timestamp;
        
        Ok(())
    }

    /// Record a successful transfer
    pub fn record_transfer(&mut self, amount: u64, clock: &Clock) -> Result<()> {
        self.transfer_count = self.transfer_count
            .checked_add(1)
            .ok_or(crate::SplTokenPredicateError::ArithmeticError)?;
        
        self.total_transferred = self.total_transferred
            .checked_add(amount)
            .ok_or(crate::SplTokenPredicateError::ArithmeticError)?;
        
        self.updated_at = clock.unix_timestamp;
        
        Ok(())
    }

    /// Get the active policy as a slice
    pub fn get_policy(&self) -> &[u8] {
        &self.policy[..self.policy_len as usize]
    }

    /// Check if the account is active and can perform transfers
    pub fn can_transfer(&self) -> bool {
        self.is_active
    }

    /// Deactivate the account (emergency stop)
    pub fn deactivate(&mut self, clock: &Clock) -> Result<()> {
        self.is_active = false;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Reactivate the account
    pub fn reactivate(&mut self, clock: &Clock) -> Result<()> {
        self.is_active = true;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Get the PDA seeds for this account
    pub fn get_seeds(&self) -> [&[u8]; 4] {
        [
            b"protected_token",
            self.token_account.as_ref(),
            self.owner.as_ref(),
            &[self.bump]
        ]
    }
}

/// Transfer request structure for validation
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransferRequest {
    /// Unique identifier for this transfer request
    pub request_id: [u8; 16],
    /// Source token account
    pub from: Pubkey,
    /// Destination token account
    pub to: Pubkey,
    /// Amount to transfer
    pub amount: u64,
    /// Transfer type (direct or delegated)
    pub transfer_type: TransferType,
    /// Timestamp when request was created
    pub created_at: i64,
    /// Expiration timestamp
    pub expires_at: i64,
}

/// Types of transfers supported
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TransferType {
    /// Direct transfer from owner
    Direct,
    /// Delegated transfer using allowance
    Delegated,
}

impl TransferRequest {
    /// Create a new transfer request
    pub fn new(
        request_id: [u8; 16],
        from: Pubkey,
        to: Pubkey,
        amount: u64,
        transfer_type: TransferType,
        clock: &Clock,
        expiry_duration: i64
    ) -> Self {
        Self {
            request_id,
            from,
            to,
            amount,
            transfer_type,
            created_at: clock.unix_timestamp,
            expires_at: clock.unix_timestamp + expiry_duration,
        }
    }

    /// Check if the transfer request has expired
    pub fn is_expired(&self, clock: &Clock) -> bool {
        clock.unix_timestamp > self.expires_at
    }

    /// Format request ID as UUID string
    pub fn format_request_id(&self) -> String {
        let hex = hex::encode(self.request_id);
        format!("{}-{}-{}-{}-{}", 
            &hex[0..8], 
            &hex[8..12], 
            &hex[12..16], 
            &hex[16..20], 
            &hex[20..32]
        )
    }
}

/// Policy validation result
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PolicyValidationResult {
    /// Whether the transfer is allowed
    pub allowed: bool,
    /// Reason for denial (if not allowed)
    pub denial_reason: Option<String>,
    /// Maximum allowed amount (if applicable)
    pub max_amount: Option<u64>,
    /// Required waiting period (if applicable)
    pub waiting_period: Option<i64>,
}

/// Account metadata for tracking
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AccountMetadata {
    /// Account creation timestamp
    pub created_at: i64,
    /// Last activity timestamp
    pub last_activity: i64,
    /// Total number of operations
    pub operation_count: u64,
    /// Account status flags
    pub status_flags: u32,
}

impl AccountMetadata {
    /// Create new metadata
    pub fn new(clock: &Clock) -> Self {
        Self {
            created_at: clock.unix_timestamp,
            last_activity: clock.unix_timestamp,
            operation_count: 0,
            status_flags: 0,
        }
    }

    /// Update activity timestamp
    pub fn update_activity(&mut self, clock: &Clock) -> Result<()> {
        self.last_activity = clock.unix_timestamp;
        self.operation_count = self.operation_count
            .checked_add(1)
            .ok_or(crate::SplTokenPredicateError::ArithmeticError)?;
        Ok(())
    }
}

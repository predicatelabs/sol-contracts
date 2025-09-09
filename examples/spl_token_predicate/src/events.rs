//! # Events Module
//! 
//! This module contains all event definitions for the SPL Token Predicate
//! example program. Events provide observability for all major operations.

use anchor_lang::prelude::*;

/// Event emitted when a protected token account is initialized
#[event]
pub struct ProtectedAccountInitialized {
    /// The protected account that was created
    pub protected_account: Pubkey,
    /// The underlying SPL token account
    pub token_account: Pubkey,
    /// The token mint
    pub mint: Pubkey,
    /// The account owner
    pub owner: Pubkey,
    /// The initial policy set for the account
    pub policy: String,
    /// Timestamp when the account was created
    pub timestamp: i64,
}

/// Event emitted when a policy is updated
#[event]
pub struct PolicyUpdated {
    /// The protected account whose policy was updated
    pub protected_account: Pubkey,
    /// The account owner who updated the policy
    pub owner: Pubkey,
    /// The old policy (for audit trail)
    pub old_policy: String,
    /// The new policy
    pub new_policy: String,
    /// Timestamp when the policy was updated
    pub timestamp: i64,
}

/// Event emitted when a protected transfer is executed
#[event]
pub struct ProtectedTransfer {
    /// The protected account from which tokens were transferred
    pub protected_account: Pubkey,
    /// The source token account
    pub from: Pubkey,
    /// The destination token account
    pub to: Pubkey,
    /// The account owner who initiated the transfer
    pub owner: Pubkey,
    /// The attestor who validated the transfer
    pub attestor: Pubkey,
    /// The amount transferred
    pub amount: u64,
    /// The task UUID that was validated
    pub task_uuid: String,
    /// The policy that was applied
    pub policy: String,
    /// Timestamp when the transfer was executed
    pub timestamp: i64,
}

/// Event emitted when a protected transfer from (delegated) is executed
#[event]
pub struct ProtectedTransferFrom {
    /// The protected account from which tokens were transferred
    pub protected_account: Pubkey,
    /// The source token account
    pub from: Pubkey,
    /// The destination token account
    pub to: Pubkey,
    /// The delegate who initiated the transfer
    pub delegate: Pubkey,
    /// The attestor who validated the transfer
    pub attestor: Pubkey,
    /// The amount transferred
    pub amount: u64,
    /// The task UUID that was validated
    pub task_uuid: String,
    /// The policy that was applied
    pub policy: String,
    /// Timestamp when the transfer was executed
    pub timestamp: i64,
}

/// Event emitted when attestation validation fails
#[event]
pub struct AttestationValidationFailed {
    /// The protected account for which validation failed
    pub protected_account: Pubkey,
    /// The account that attempted the operation
    pub caller: Pubkey,
    /// The task UUID that failed validation
    pub task_uuid: String,
    /// The attestor that was used
    pub attestor: Pubkey,
    /// The reason for validation failure
    pub failure_reason: String,
    /// Timestamp when the failure occurred
    pub timestamp: i64,
}

/// Event emitted when a policy violation occurs
#[event]
pub struct PolicyViolation {
    /// The protected account where the violation occurred
    pub protected_account: Pubkey,
    /// The account that attempted the operation
    pub caller: Pubkey,
    /// The operation that was attempted
    pub operation: String,
    /// The policy that was violated
    pub policy: String,
    /// The specific violation details
    pub violation_details: String,
    /// The amount that was attempted (if applicable)
    pub attempted_amount: Option<u64>,
    /// Timestamp when the violation occurred
    pub timestamp: i64,
}

/// Event emitted when an account is deactivated
#[event]
pub struct AccountDeactivated {
    /// The protected account that was deactivated
    pub protected_account: Pubkey,
    /// The account owner who deactivated it
    pub owner: Pubkey,
    /// The reason for deactivation
    pub reason: String,
    /// Timestamp when deactivation occurred
    pub timestamp: i64,
}

/// Event emitted when an account is reactivated
#[event]
pub struct AccountReactivated {
    /// The protected account that was reactivated
    pub protected_account: Pubkey,
    /// The account owner who reactivated it
    pub owner: Pubkey,
    /// The reason for reactivation
    pub reason: String,
    /// Timestamp when reactivation occurred
    pub timestamp: i64,
}

/// Event emitted when transfer statistics are updated
#[event]
pub struct TransferStatsUpdated {
    /// The protected account whose stats were updated
    pub protected_account: Pubkey,
    /// The new total transfer count
    pub transfer_count: u64,
    /// The new total amount transferred
    pub total_transferred: u64,
    /// The amount of the latest transfer
    pub latest_transfer_amount: u64,
    /// Timestamp when stats were updated
    pub timestamp: i64,
}

/// Event emitted when an emergency stop is triggered
#[event]
pub struct EmergencyStop {
    /// The protected account that was stopped
    pub protected_account: Pubkey,
    /// The account that triggered the stop
    pub triggered_by: Pubkey,
    /// The reason for the emergency stop
    pub reason: String,
    /// Timestamp when the stop was triggered
    pub timestamp: i64,
}

/// Event emitted when a rate limit is hit
#[event]
pub struct RateLimitHit {
    /// The protected account that hit the rate limit
    pub protected_account: Pubkey,
    /// The account that attempted the operation
    pub caller: Pubkey,
    /// The type of rate limit that was hit
    pub limit_type: String,
    /// The current count against the limit
    pub current_count: u64,
    /// The maximum allowed count
    pub max_count: u64,
    /// The time window for the rate limit
    pub time_window: i64,
    /// Timestamp when the limit was hit
    pub timestamp: i64,
}

/// Event emitted when a transfer request is created
#[event]
pub struct TransferRequestCreated {
    /// The protected account for the transfer request
    pub protected_account: Pubkey,
    /// The unique request ID
    pub request_id: String,
    /// The source account
    pub from: Pubkey,
    /// The destination account
    pub to: Pubkey,
    /// The requested amount
    pub amount: u64,
    /// The type of transfer requested
    pub transfer_type: String,
    /// When the request expires
    pub expires_at: i64,
    /// Timestamp when the request was created
    pub timestamp: i64,
}

/// Event emitted when a transfer request expires
#[event]
pub struct TransferRequestExpired {
    /// The protected account for the expired request
    pub protected_account: Pubkey,
    /// The expired request ID
    pub request_id: String,
    /// The account that created the request
    pub requester: Pubkey,
    /// Timestamp when the request expired
    pub timestamp: i64,
}

/// Event emitted for audit trail purposes
#[event]
pub struct AuditLog {
    /// The protected account involved in the operation
    pub protected_account: Pubkey,
    /// The account that performed the operation
    pub actor: Pubkey,
    /// The operation that was performed
    pub operation: String,
    /// Additional details about the operation
    pub details: String,
    /// Whether the operation was successful
    pub success: bool,
    /// Timestamp when the operation occurred
    pub timestamp: i64,
}

/// Event emitted when policy validation occurs
#[event]
pub struct PolicyValidation {
    /// The protected account being validated
    pub protected_account: Pubkey,
    /// The policy being validated against
    pub policy: String,
    /// The operation being validated
    pub operation: String,
    /// The validation result
    pub result: String,
    /// Additional validation details
    pub details: String,
    /// Timestamp when validation occurred
    pub timestamp: i64,
}

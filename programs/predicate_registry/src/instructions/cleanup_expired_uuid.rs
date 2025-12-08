//! Cleanup expired UUID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::CleanupExpiredUuid;
use crate::errors::PredicateRegistryError;

/// Cleanup an expired UUID account to reclaim rent
/// 
/// This function allows anyone to close a UsedUuidAccount after the statement
/// has expired AND the validation buffer window has passed, returning the rent
/// to the original signer (payer).
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// 
/// # Returns
/// * `Result<()>` - Ok if cleanup successful
/// 
/// # Security Considerations
/// - Only allows cleanup after statement expiration + validation buffer
/// - Prevents replay attacks by ensuring UUID accounts cannot be cleaned up
///   while attestations are still valid for validation
/// - Enforces rent return to the original payer
/// - Anyone can trigger cleanup
pub fn cleanup_expired_uuid(ctx: Context<CleanupExpiredUuid>) -> Result<()> {
    let used_uuid_account = &ctx.accounts.used_uuid_account;
    
    // Get current timestamp
    let clock = Clock::get().map_err(|_| PredicateRegistryError::ClockError)?;
    let current_timestamp = clock.unix_timestamp;
    
    // Check that the statement has expired AND the validation buffer window has passed
    // This matches the validation logic which allows attestations to be valid for
    // up to CLOCK_DRIFT_BUFFER seconds after expiration.
    // We must prevent cleanup during this window to maintain replay protection.
    require!(
        current_timestamp > used_uuid_account.expires_at + crate::instructions::CLOCK_DRIFT_BUFFER,
        PredicateRegistryError::StatementNotExpired
    );
    
    // The account will be closed by Anchor's `close` constraint
    // Rent will be returned to the original signer (enforced by constraint above)
    
    msg!(
        "Cleaned up expired UUID account, rent returned to {}",
        used_uuid_account.signer
    );
    
    Ok(())
}


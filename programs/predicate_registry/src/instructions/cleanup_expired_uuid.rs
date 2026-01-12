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
    
    require!(
        used_uuid_account.attestation.is_expired(current_timestamp),
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


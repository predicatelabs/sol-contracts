//! Cleanup expired UUID instruction for the predicate registry program

use anchor_lang::prelude::*;
use crate::instructions::CleanupExpiredUuid;
use crate::errors::PredicateRegistryError;

/// Cleanup an expired UUID account to reclaim rent
/// 
/// This function allows anyone to close a UsedUuidAccount after the statement
/// has expired, returning the rent to the original validator (payer).
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// 
/// # Returns
/// * `Result<()>` - Ok if cleanup successful
/// 
/// # Security Considerations
/// - Only allows cleanup after statement expiration
/// - Enforces rent return to the original payer (belt-and-suspenders with account constraint)
/// - Anyone can trigger cleanup (permissionless)
pub fn cleanup_expired_uuid(ctx: Context<CleanupExpiredUuid>) -> Result<()> {
    let used_uuid_account = &ctx.accounts.used_uuid_account;
    
    // Get current timestamp
    let clock = Clock::get().map_err(|_| PredicateRegistryError::ClockError)?;
    let current_timestamp = clock.unix_timestamp;
    
    // Check that the statement has expired
    require!(
        current_timestamp > used_uuid_account.expires_at,
        PredicateRegistryError::StatementNotExpired
    );
    
    // Belt-and-suspenders: verify recipient matches original payer
    // (This is already enforced by account constraint, but defensive programming)
    require!(
        ctx.accounts.validator_recipient.key() == used_uuid_account.validator,
        PredicateRegistryError::Unauthorized
    );
    
    // The account will be closed by Anchor's `close` constraint
    // Rent will be returned to the original validator (enforced by constraint above)
    
    msg!(
        "Cleaned up expired UUID account, rent returned to {}",
        used_uuid_account.validator
    );
    
    Ok(())
}


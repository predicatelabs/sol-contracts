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
/// # Security Considerations (enforced by constraints)
/// - Only allows cleanup after statement expiration
/// - Enforces rent return to the original payer
/// - Anyone can trigger cleanup
pub fn cleanup_expired_uuid(ctx: Context<CleanupExpiredUuid>) -> Result<()> {
    let used_uuid_account = &ctx.accounts.used_uuid_account;
    
    // The account will be closed by Anchor's `close` constraint
    // Rent will be returned to the original validator (enforced by constraint above)
    
    msg!(
        "Cleaned up expired UUID account, rent returned to {}",
        used_uuid_account.validator
    );
    
    Ok(())
}


//! Protected transfer instruction

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::instructions::ProtectedTransfer;
use crate::events::{ProtectedTransfer as ProtectedTransferEvent, AttestationValidationFailed};
use crate::errors::SplTokenPredicateError;

/// Execute a protected token transfer with attestation validation
/// 
/// This function transfers tokens from the protected account to a destination account
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
pub fn protected_transfer(
    ctx: Context<ProtectedTransfer>,
    task: predicate_registry::state::Task,
    attestation: predicate_registry::state::Attestation,
    amount: u64
) -> Result<()> {
    let protected_account = &mut ctx.accounts.protected_account;
    let source_token_account = &ctx.accounts.source_token_account;
    let destination_token_account = &ctx.accounts.destination_token_account;
    let owner = &ctx.accounts.owner;
    let clock = Clock::get()?;

    // Validate that the task corresponds to this transfer
    require!(
        task.msg_sender == owner.key(),
        SplTokenPredicateError::TaskIdMismatch
    );
    require!(
        task.target == destination_token_account.key(),
        SplTokenPredicateError::TaskIdMismatch
    );
    require!(
        task.msg_value == amount,
        SplTokenPredicateError::TaskIdMismatch
    );

    // Check if task has expired
    require!(
        clock.unix_timestamp <= task.expiration,
        SplTokenPredicateError::TaskExpired
    );

    // Validate attestation through Predicate Registry via CPI
    let attestor_key = attestation.attestor;
    let cpi_program = ctx.accounts.predicate_registry.to_account_info();
    
    let cpi_accounts = predicate_registry::cpi::accounts::ValidateAttestation {
        registry: ctx.accounts.registry.to_account_info(),
        attestor_account: ctx.accounts.attestor_account.to_account_info(),
        policy_account: ctx.accounts.policy_account.to_account_info(),
        validator: owner.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    // Call the predicate registry to validate the attestation
    match predicate_registry::cpi::validate_attestation(cpi_ctx, task.clone(), attestor_key, attestation.clone()) {
        Ok(_) => {
            msg!("Attestation validation successful");
        },
        Err(err) => {
            // Emit validation failure event
            emit!(AttestationValidationFailed {
                protected_account: protected_account.key(),
                caller: owner.key(),
                task_uuid: task.format_uuid(),
                attestor: attestor_key,
                failure_reason: format!("Attestation validation failed: {}", err),
                timestamp: clock.unix_timestamp,
            });
            
            return Err(SplTokenPredicateError::AttestationValidationFailed.into());
        }
    }

    // Execute the SPL token transfer
    let transfer_instruction = Transfer {
        from: source_token_account.to_account_info(),
        to: destination_token_account.to_account_info(),
        authority: owner.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_instruction,
    );
    
    token::transfer(cpi_ctx, amount)?;

    // Update transfer statistics
    protected_account.record_transfer(amount, &clock)?;

    // Emit successful transfer event
    emit!(ProtectedTransferEvent {
        protected_account: protected_account.key(),
        from: source_token_account.key(),
        to: destination_token_account.key(),
        owner: owner.key(),
        attestor: attestor_key,
        amount,
        task_uuid: task.format_uuid(),
        policy: String::from_utf8_lossy(protected_account.get_policy()).to_string(),
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Protected transfer completed: {} tokens from {} to {} for account {}",
        amount,
        source_token_account.key(),
        destination_token_account.key(),
        protected_account.key()
    );

    Ok(())
}

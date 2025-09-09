//! Protected transfer from instruction (delegated transfer)

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::instructions::ProtectedTransferFrom;
use crate::events::{ProtectedTransferFrom as ProtectedTransferFromEvent, AttestationValidationFailed};
use crate::errors::SplTokenPredicateError;

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
pub fn protected_transfer_from(
    ctx: Context<ProtectedTransferFrom>,
    task: predicate_registry::state::Task,
    attestation: predicate_registry::state::Attestation,
    amount: u64
) -> Result<()> {
    let protected_account = &mut ctx.accounts.protected_account;
    let source_token_account = &ctx.accounts.source_token_account;
    let destination_token_account = &ctx.accounts.destination_token_account;
    let delegate = &ctx.accounts.delegate;
    let clock = Clock::get()?;

    // Validate that the task corresponds to this transfer
    require!(
        task.msg_sender == delegate.key(),
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

    // Check if delegate has sufficient allowance
    // Note: This is a simplified check. In a real implementation, you might want to
    // track allowances in your program state or check the SPL token account's delegate
    require!(
        source_token_account.delegate.is_some() && 
        source_token_account.delegate.unwrap() == delegate.key(),
        SplTokenPredicateError::InsufficientAllowance
    );
    require!(
        source_token_account.delegated_amount >= amount,
        SplTokenPredicateError::InsufficientAllowance
    );

    // Validate attestation through Predicate Registry via CPI
    let attestor_key = attestation.attestor;
    let cpi_program = ctx.accounts.predicate_registry.to_account_info();
    
    let cpi_accounts = predicate_registry::cpi::accounts::ValidateAttestation {
        registry: ctx.accounts.registry.to_account_info(),
        attestor_account: ctx.accounts.attestor_account.to_account_info(),
        policy_account: ctx.accounts.policy_account.to_account_info(),
        validator: delegate.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    // Call the predicate registry to validate the attestation
    match predicate_registry::cpi::validate_attestation(cpi_ctx, task.clone(), attestor_key, attestation.clone()) {
        Ok(_) => {
            msg!("Attestation validation successful for delegated transfer");
        },
        Err(err) => {
            // Emit validation failure event
            emit!(AttestationValidationFailed {
                protected_account: protected_account.key(),
                caller: delegate.key(),
                task_uuid: task.format_uuid(),
                attestor: attestor_key,
                failure_reason: format!("Attestation validation failed: {}", err),
                timestamp: clock.unix_timestamp,
            });
            
            return Err(SplTokenPredicateError::AttestationValidationFailed.into());
        }
    }

    // Execute the SPL token transfer (delegated)
    let transfer_instruction = Transfer {
        from: source_token_account.to_account_info(),
        to: destination_token_account.to_account_info(),
        authority: delegate.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_instruction,
    );
    
    token::transfer(cpi_ctx, amount)?;

    // Update transfer statistics
    protected_account.record_transfer(amount, &clock)?;

    // Emit successful transfer event
    emit!(ProtectedTransferFromEvent {
        protected_account: protected_account.key(),
        from: source_token_account.key(),
        to: destination_token_account.key(),
        delegate: delegate.key(),
        attestor: attestor_key,
        amount,
        task_uuid: task.format_uuid(),
        policy: String::from_utf8_lossy(protected_account.get_policy()).to_string(),
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Protected delegated transfer completed: {} tokens from {} to {} by delegate {} for account {}",
        amount,
        source_token_account.key(),
        destination_token_account.key(),
        delegate.key(),
        protected_account.key()
    );

    Ok(())
}

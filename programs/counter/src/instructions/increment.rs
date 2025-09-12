//! Increment instruction for the Counter program

use anchor_lang::prelude::*;
use predicate_registry::{
    cpi::accounts::ValidateAttestation,
    program::PredicateRegistry,
    PredicateRegistry as PredicateRegistryAccount,
    AttestorAccount,
    PolicyAccount,
    Task,
    Attestation,
};
use crate::state::CounterAccount;
use crate::events::CounterIncremented;
use crate::errors::CounterError;

/// Increment the counter after validating attestation
/// 
/// This function demonstrates protected business logic that requires
/// predicate validation before execution. It:
/// 1. Constructs a Task for the increment operation
/// 2. Makes a CPI call to validate_attestation on predicate-registry
/// 3. Only increments the counter if validation succeeds
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `task` - The task describing this increment operation
/// * `attestor_key` - The public key of the attestor
/// * `attestation` - The attestation from the attestor
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * `CounterIncremented` - Emitted when counter is successfully incremented
pub fn increment(
    ctx: Context<Increment>,
    task: Task,
    attestor_key: Pubkey,
    attestation: Attestation,
) -> Result<()> {
    // Validate that the task is for this specific increment operation
    let expected_encoded_sig = encode_increment_signature();
    require!(
        task.encoded_sig_and_args == expected_encoded_sig,
        CounterError::InvalidTask
    );

    // Validate that the task sender matches the counter owner
    require!(
        task.msg_sender == ctx.accounts.counter.owner,
        CounterError::Unauthorized
    );

    // Validate that the task target matches this program
    require!(
        task.target == crate::ID,
        CounterError::InvalidTask
    );

    // Make CPI call to validate attestation
    validate_attestation_cpi(
        &ctx,
        task,
        attestor_key,
        attestation,
    )?;

    // If validation succeeds, increment the counter
    let counter = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    
    let old_value = counter.get_value();
    let new_value = counter.increment(&clock)?;

    emit!(CounterIncremented {
        counter: counter.key(),
        owner: counter.owner,
        old_value,
        new_value,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Counter incremented from {} to {} by owner {}",
        old_value,
        new_value,
        counter.owner
    );

    Ok(())
}

/// Make a CPI call to validate attestation
fn validate_attestation_cpi(
    ctx: &Context<Increment>,
    task: Task,
    attestor_key: Pubkey,
    attestation: Attestation,
) -> Result<()> {
    let cpi_accounts = ValidateAttestation {
        registry: ctx.accounts.predicate_registry.to_account_info(),
        attestor_account: ctx.accounts.attestor_account.to_account_info(),
        policy_account: ctx.accounts.policy_account.to_account_info(),
        validator: ctx.accounts.owner.to_account_info(),
        instructions_sysvar: ctx.accounts.instructions_sysvar.to_account_info(),
    };

    let cpi_program = ctx.accounts.predicate_registry_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    predicate_registry::cpi::validate_attestation(
        cpi_ctx,
        task,
        attestor_key,
        attestation,
    )?;

    Ok(())
}

/// Encode the increment function signature for task validation
fn encode_increment_signature() -> Vec<u8> {
    // This represents the signature of the increment function call
    // In a real implementation, this might include parameters
    b"increment()".to_vec()
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(
        mut,
        seeds = [b"counter", counter.owner.as_ref()],
        bump,
        has_one = predicate_registry,
        has_one = owner
    )]
    pub counter: Account<'info, CounterAccount>,

    /// The owner of the counter who is calling increment
    pub owner: Signer<'info>,

    /// The predicate registry account
    #[account(mut)]
    pub predicate_registry: Account<'info, PredicateRegistryAccount>,

    /// Attestor account in the predicate registry
    #[account(
        mut,
        seeds = [b"attestor", attestor_account.attestor.as_ref()],
        bump,
        seeds::program = predicate_registry_program.key()
    )]
    pub attestor_account: Account<'info, AttestorAccount>,

    /// Policy account for the counter owner
    #[account(
        seeds = [b"policy", counter.owner.as_ref()],
        bump,
        seeds::program = predicate_registry_program.key()
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    /// Instructions sysvar for signature verification
    /// CHECK: This is validated in the predicate registry program
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    pub predicate_registry_program: Program<'info, PredicateRegistry>,
}
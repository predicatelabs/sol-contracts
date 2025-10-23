//! Increment instruction for the Counter program

use anchor_lang::prelude::*;
use predicate_registry::{
    cpi::accounts::ValidateAttestation,
    program::PredicateRegistry,
    PredicateRegistry as PredicateRegistryAccount,
    AttesterAccount,
    PolicyAccount,
    Statement,
    Attestation,
};
use crate::state::CounterAccount;
use crate::events::CounterIncremented;
use crate::errors::CounterError;

/// Increment the counter after validating attestation
/// 
/// This function demonstrates protected business logic that requires
/// predicate validation before execution. It:
/// 1. Constructs a Statement for the increment operation
/// 2. Makes a CPI call to validate_attestation on predicate-registry
/// 3. Only increments the counter if validation succeeds
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `statement` - The statement describing this increment operation
/// * `attester_key` - The public key of the attester
/// * `attestation` - The attestation from the attester
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * `CounterIncremented` - Emitted when counter is successfully incremented
pub fn increment(
    ctx: Context<Increment>,
    statement: Statement,
    attester_key: Pubkey,
    attestation: Attestation,
) -> Result<()> {
    // Validate that the statement is for this specific increment operation
    let expected_encoded_sig = encode_increment_signature();
    require!(
        statement.encoded_sig_and_args == expected_encoded_sig,
        CounterError::InvalidStatement
    );

    // Validate that the statement sender matches the counter owner
    require!(
        statement.msg_sender == ctx.accounts.counter.owner,
        CounterError::Unauthorized
    );

    // Validate that the statement target matches this program
    require!(
        statement.target == crate::ID,
        CounterError::InvalidStatement
    );

    // Make CPI call to validate attestation
    validate_attestation_cpi(
        &ctx,
        statement,
        attester_key,
        attestation,
    )?;

    // If validation succeeds, increment the counter
    let counter = &mut ctx.accounts.counter;
    let clock = Clock::get()?;
    
    let old_value = counter.value;
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
    statement: Statement,
    attester_key: Pubkey,
    attestation: Attestation,
) -> Result<()> {
    let cpi_accounts = ValidateAttestation {
        registry: ctx.accounts.predicate_registry.to_account_info(),
        attester_account: ctx.accounts.attester_account.to_account_info(),
        policy_account: ctx.accounts.policy_account.to_account_info(),
        used_uuid_account: ctx.accounts.used_uuid_account.to_account_info(),
        validator: ctx.accounts.owner.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        instructions_sysvar: ctx.accounts.instructions_sysvar.to_account_info(),
    };

    let cpi_program = ctx.accounts.predicate_registry_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    predicate_registry::cpi::validate_attestation(
        cpi_ctx,
        statement,
        attester_key,
        attestation,
    )?;

    Ok(())
}

/// Encode the increment function signature for statement validation
fn encode_increment_signature() -> Vec<u8> {
    // This represents the signature of the increment function call
    // In a real implementation, this might include parameters
    b"increment()".to_vec()
}

#[derive(Accounts)]
#[instruction(statement: Statement)]
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
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The predicate registry account
    #[account(mut)]
    pub predicate_registry: Account<'info, PredicateRegistryAccount>,

    /// Attester account in the predicate registry
    #[account(
        mut,
        seeds = [b"attester", attester_account.attester.as_ref()],
        bump,
        seeds::program = predicate_registry_program.key()
    )]
    pub attester_account: Account<'info, AttesterAccount>,

    /// Policy account for the counter owner
    #[account(
        seeds = [b"policy", counter.owner.as_ref()],
        bump,
        seeds::program = predicate_registry_program.key()
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    /// The used UUID account (passed through to predicate registry for replay protection)
    /// CHECK: This will be validated and initialized in the predicate registry program
    #[account(mut)]
    pub used_uuid_account: AccountInfo<'info>,

    /// Instructions sysvar for signature verification
    /// CHECK: This is validated in the predicate registry program
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    pub predicate_registry_program: Program<'info, PredicateRegistry>,
    pub system_program: Program<'info, System>,
}

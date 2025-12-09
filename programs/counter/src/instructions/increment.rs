//! Increment instruction for the Counter program

use anchor_lang::prelude::*;
use predicate_registry::{
    cpi::accounts::ValidateAttestation,
    program::PredicateRegistry,
    PredicateRegistry as PredicateRegistryAccount,
    AttesterAccount,
    PolicyAccount,
    Attestation,
};
use crate::state::CounterAccount;
use crate::events::CounterIncremented;
use crate::errors::CounterError;

/// Increment the counter after validating attestation
/// 
/// This function demonstrates protected business logic that requires
/// predicate validation before execution. The Statement is constructed
/// internally by the predicate_registry, similar to how Solidity's
/// PredicateClient._authorizeTransaction works.
/// 
/// # Arguments
/// * `ctx` - The instruction context containing accounts
/// * `encoded_sig_and_args` - The encoded function signature (e.g., "increment()")
/// * `attestation` - The attestation from the attester (contains attester key)
/// 
/// # Returns
/// * `Result<()>` - Success or error
/// 
/// # Events
/// * `CounterIncremented` - Emitted when counter is successfully incremented
pub fn increment(
    ctx: Context<Increment>,
    encoded_sig_and_args: Vec<u8>,
    attestation: Attestation,
) -> Result<()> {
    // Validate that the encoded signature is for the increment operation
    let expected_encoded_sig = encode_increment_signature();
    require!(
        encoded_sig_and_args == expected_encoded_sig,
        CounterError::InvalidStatement
    );

    // Authorize the transaction via predicate registry
    // The registry will construct the Statement internally, ensuring
    // msg_sender and policy_id cannot be faked
    predicate_registry::cpi::validate_attestation(
        CpiContext::new(
            ctx.accounts.predicate_registry_program.to_account_info(),
            ValidateAttestation {
                registry: ctx.accounts.predicate_registry.to_account_info(),
                attester_account: ctx.accounts.attester_account.to_account_info(),
                policy_account: ctx.accounts.policy_account.to_account_info(),
                used_uuid_account: ctx.accounts.used_uuid_account.to_account_info(),
                signer: ctx.accounts.owner.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                instructions_sysvar: ctx.accounts.instructions_sysvar.to_account_info(),
            }
        ),
        crate::ID,              // target: this counter program
        0,                      // msg_value: 0 (Solana doesn't have msg.value)
        encoded_sig_and_args,   // function signature
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

/// Encode the increment function signature for statement validation
fn encode_increment_signature() -> Vec<u8> {
    // This represents the signature of the increment function call
    // In a real implementation, this might include parameters
    b"increment()".to_vec()
}

#[derive(Accounts)]
#[instruction(
    encoded_sig_and_args: Vec<u8>,
    attestation: Attestation
)]
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

    /// Policy account for this counter program
    /// The policy is tied to the program ID, not individual users
    #[account(
        seeds = [b"policy", crate::ID.as_ref()],
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

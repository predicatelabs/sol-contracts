//! # Counter Program
//! 
//! A simple counter program integrated with predicate-registry that demonstrates
//! how to protect program instructions with predicate validation.
//!
//! ## Features
//! - Counter initialization with predicate-registry integration
//! - Protected increment function requiring valid attestation
//! - Cross-program invocation (CPI) to predicate-registry for validation
//!
//! ## Integration Pattern
//! This program follows the inheritance pattern from Solidity examples,
//! where business logic is directly protected by predicate validation.
//!
//! ## Module Structure
//! - `instructions`: All instruction handlers (initialize, increment)
//! - `state`: Account structures and state management
//! - `events`: Event definitions for program transparency
//! - `errors`: Custom error codes for specific failure scenarios

// Suppress warnings from Anchor's internal behavior
// These are framework-level warnings, not from our code
#![allow(deprecated)]
#![allow(ambiguous_glob_reexports)]

use anchor_lang::prelude::*;

// Import our modules
pub mod instructions;
pub mod state;
pub mod events;
pub mod errors;

// Re-export for easier access
pub use instructions::*;
pub use state::*;
pub use events::*;
pub use errors::*;

// Program ID
declare_id!("8FZEdZxuRxeC4ENQrNF6fbeP1J1dNseSJStadHwaqpcJ");

/// Main program module containing all instruction handlers
#[program]
pub mod counter {
    use super::*;

    /// Initialize a new counter with predicate-registry integration
    /// 
    /// Creates a counter account and sets up integration with the predicate-registry.
    /// The counter owner must have a policy set in the predicate-registry.
    /// 
    /// # Arguments
    /// * `ctx` - The instruction context containing accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Events
    /// * `CounterInitialized` - Emitted when counter is successfully initialized
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

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
        statement: predicate_registry::Statement,
        attester_key: Pubkey,
        attestation: predicate_registry::Attestation,
    ) -> Result<()> {
        instructions::increment(ctx, statement, attester_key, attestation)
    }
}

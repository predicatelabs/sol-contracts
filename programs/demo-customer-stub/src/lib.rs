use anchor_lang::prelude::*;

declare_id!("5iejgxCq2vnpiwWpf4qwziVhbX2irmgMEghBrD9tmk5p");

/// Minimal stub program for demo-customer
/// 
/// This program serves as a policy anchor in the PredicateRegistry.
/// It can be extended with business logic as needs grow.
#[program]
pub mod demo_customer_stub {
    use super::*;

    /// Initialize the stub program (no-op)
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        msg!("demo-customer stub program initialized");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

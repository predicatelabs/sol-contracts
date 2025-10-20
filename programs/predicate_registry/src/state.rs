//! # State Module
//! 
//! This module contains all the account structures and state definitions
//! for the predicate registry program.

use anchor_lang::prelude::*;

/// The main registry account that stores the registry state
#[account]
#[derive(InitSpace)]
pub struct PredicateRegistry {
    /// The authority that can modify this registry (owner)
    pub authority: Pubkey,
    /// Timestamp when the registry was created
    pub created_at: i64,
    /// Timestamp when the registry was last updated
    pub updated_at: i64,
    /// Total number of registered attesters
    pub total_attesters: u64,
    /// Total number of policies set
    pub total_policies: u64,
}

/// Account for storing attester registration data
#[account]
#[derive(InitSpace)]
pub struct AttesterAccount {
    /// The attester's public key
    pub attester: Pubkey,
    /// Whether the attester is currently registered
    pub is_registered: bool,
    /// Timestamp when registered
    pub registered_at: i64,
}

/// Account for storing client policy ID
#[account]
#[derive(InitSpace)]
pub struct PolicyAccount {
    /// The client's public key
    pub client: Pubkey,
    /// The policy ID (string identifier, not content)
    #[max_len(64)]
    pub policy_id: String,
    /// Timestamp when policy was set
    pub set_at: i64,
    /// Timestamp when policy was last updated
    pub updated_at: i64,
}



/// Statement structure matching the Solidity version
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Statement {
    /// Unique identifier for the statement
    pub uuid: [u8; 16],
    /// The message sender
    pub msg_sender: Pubkey,
    /// The target address
    pub target: Pubkey,
    /// The message value (in lamports for Solana)
    pub msg_value: u64,
    /// Encoded signature and arguments
    pub encoded_sig_and_args: Vec<u8>,
    /// The policy ID (string identifier, not content)
    pub policy_id: String,
    /// Expiration timestamp
    pub expiration: i64,
}

/// Attestation structure matching the Solidity version
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Attestation {
    /// Unique identifier matching the statement (UUID as 16 bytes)
    pub uuid: [u8; 16],
    /// The attester's public key
    pub attester: Pubkey,
    /// The signature from the attester
    pub signature: [u8; 64], // Ed25519 signature
    /// Expiration timestamp
    pub expiration: i64,
}

impl PredicateRegistry {
    /// Initialize a new registry with default values
    pub fn initialize(&mut self, authority: Pubkey, clock: &Clock) -> Result<()> {
        self.authority = authority;
        self.created_at = clock.unix_timestamp;
        self.updated_at = clock.unix_timestamp;
        self.total_attesters = 0;
        self.total_policies = 0;
        Ok(())
    }

    /// Increment the attester count
    pub fn increment_attester_count(&mut self, clock: &Clock) -> Result<()> {
        self.total_attesters = self.total_attesters.checked_add(1)
            .ok_or(crate::PredicateRegistryError::ArithmeticError)?;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Decrement the attester count
    pub fn decrement_attester_count(&mut self, clock: &Clock) -> Result<()> {
        self.total_attesters = self.total_attesters.checked_sub(1)
            .ok_or(crate::PredicateRegistryError::ArithmeticError)?;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Increment the policy count
    pub fn increment_policy_count(&mut self, clock: &Clock) -> Result<()> {
        self.total_policies = self.total_policies.checked_add(1)
            .ok_or(crate::PredicateRegistryError::ArithmeticError)?;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Transfer authority to a new account
    pub fn transfer_authority(&mut self, new_authority: Pubkey, clock: &Clock) -> Result<()> {
        self.authority = new_authority;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }
}

impl AttesterAccount {
    /// Initialize a new attester account
    pub fn initialize(&mut self, attester: Pubkey, clock: &Clock) -> Result<()> {
        self.attester = attester;
        self.is_registered = true;
        self.registered_at = clock.unix_timestamp;
        Ok(())
    }

    /// Deregister the attester
    pub fn deregister(&mut self) -> Result<()> {
        self.is_registered = false;
        Ok(())
    }

    /// Re-register the attester
    pub fn register(&mut self, clock: &Clock) -> Result<()> {
        self.is_registered = true;
        self.registered_at = clock.unix_timestamp;
        Ok(())
    }
}

impl PolicyAccount {
    /// Initialize a new policy account
    pub fn initialize(&mut self, client: Pubkey, policy_id: String, clock: &Clock) -> Result<()> {
        require!(policy_id.len() <= 64, crate::PredicateRegistryError::PolicyIdTooLong);
        require!(!policy_id.is_empty(), crate::PredicateRegistryError::InvalidPolicyId);
        
        self.client = client;
        self.policy_id = policy_id;
        self.set_at = clock.unix_timestamp;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Update the policy ID
    pub fn update_policy_id(&mut self, policy_id: String, clock: &Clock) -> Result<()> {
        require!(policy_id.len() <= 64, crate::PredicateRegistryError::PolicyIdTooLong);
        require!(!policy_id.is_empty(), crate::PredicateRegistryError::InvalidPolicyId);
        
        self.policy_id = policy_id;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }
}



impl Statement {
    /// Format UUID with standard dashes (8-4-4-4-12 format)
    pub fn format_uuid(&self) -> String {
        let hex = hex::encode(self.uuid);
        format!("{}-{}-{}-{}-{}", 
            &hex[0..8], 
            &hex[8..12], 
            &hex[12..16], 
            &hex[16..20], 
            &hex[20..32]
        )
    }

    /// Hash the statement for signature verification (equivalent to hashStatementSafe in Solidity)
    pub fn hash_statement_safe(&self, validator: Pubkey) -> [u8; 32] {
        use anchor_lang::solana_program::hash::hash;
        
        let mut data = Vec::new();
        data.extend_from_slice(&self.uuid);
        data.extend_from_slice(&self.msg_sender.to_bytes());
        data.extend_from_slice(&validator.to_bytes()); // equivalent to msg.sender in Solidity
        data.extend_from_slice(&self.msg_value.to_le_bytes());
        data.extend_from_slice(&self.encoded_sig_and_args);
        data.extend_from_slice(self.policy_id.as_bytes());
        data.extend_from_slice(&self.expiration.to_le_bytes());
        
        hash(&data).to_bytes()
    }

    /// Hash the statement with expiry (equivalent to hashStatementWithExpiry in Solidity)
    pub fn hash_statement_with_expiry(&self) -> [u8; 32] {
        use anchor_lang::solana_program::hash::hash;
        
        let mut data = Vec::new();
        data.extend_from_slice(&self.uuid);
        data.extend_from_slice(&self.msg_sender.to_bytes());
        data.extend_from_slice(&self.target.to_bytes());
        data.extend_from_slice(&self.msg_value.to_le_bytes());
        data.extend_from_slice(&self.encoded_sig_and_args);
        data.extend_from_slice(self.policy_id.as_bytes());
        data.extend_from_slice(&self.expiration.to_le_bytes());
        
        hash(&data).to_bytes()
    }
}

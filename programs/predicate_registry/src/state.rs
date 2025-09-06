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
    /// Total number of registered attestors
    pub total_attestors: u64,
    /// Total number of policies set
    pub total_policies: u64,
}

/// Account for storing attestor registration data
#[account]
#[derive(InitSpace)]
pub struct AttestorAccount {
    /// The attestor's public key
    pub attestor: Pubkey,
    /// Whether the attestor is currently registered
    pub is_registered: bool,
    /// Timestamp when registered
    pub registered_at: i64,
}

/// Account for storing client policy data
#[account]
#[derive(InitSpace)]
pub struct PolicyAccount {
    /// The client's public key
    pub client: Pubkey,
    /// The policy data (fixed 200 bytes for efficiency)
    pub policy: [u8; 200],
    /// The actual length of the policy data
    pub policy_len: u16,
    /// Timestamp when policy was set
    pub set_at: i64,
    /// Timestamp when policy was last updated
    pub updated_at: i64,
}


/// Task structure matching the Solidity version
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Task {
    /// Unique identifier for the task
    pub uuid: [u8; 16],
    /// The message sender
    pub msg_sender: Pubkey,
    /// The target address
    pub target: Pubkey,
    /// The message value (in lamports for Solana)
    pub msg_value: u64,
    /// Encoded signature and arguments
    pub encoded_sig_and_args: Vec<u8>,
    /// The policy identifier (fixed 200 bytes)
    pub policy: [u8; 200],
    /// Expiration timestamp
    pub expiration: i64,
}

/// Attestation structure matching the Solidity version
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Attestation {
    /// Unique identifier matching the task (UUID as 16 bytes)
    pub uuid: [u8; 16],
    /// The attestor's public key
    pub attestor: Pubkey,
    /// The signature from the attestor
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
        self.total_attestors = 0;
        self.total_policies = 0;
        Ok(())
    }

    /// Increment the attestor count
    pub fn increment_attestor_count(&mut self, clock: &Clock) -> Result<()> {
        self.total_attestors = self.total_attestors.checked_add(1)
            .ok_or(crate::PredicateRegistryError::ArithmeticError)?;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Decrement the attestor count
    pub fn decrement_attestor_count(&mut self, clock: &Clock) -> Result<()> {
        self.total_attestors = self.total_attestors.checked_sub(1)
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

impl AttestorAccount {
    /// Initialize a new attestor account
    pub fn initialize(&mut self, attestor: Pubkey, clock: &Clock) -> Result<()> {
        self.attestor = attestor;
        self.is_registered = true;
        self.registered_at = clock.unix_timestamp;
        Ok(())
    }

    /// Deregister the attestor
    pub fn deregister(&mut self) -> Result<()> {
        self.is_registered = false;
        Ok(())
    }

    /// Re-register the attestor
    pub fn register(&mut self, clock: &Clock) -> Result<()> {
        self.is_registered = true;
        self.registered_at = clock.unix_timestamp;
        Ok(())
    }
}

impl PolicyAccount {
    /// Initialize a new policy account
    pub fn initialize(&mut self, client: Pubkey, policy: &[u8], clock: &Clock) -> Result<()> {
        require!(policy.len() <= 200, crate::PredicateRegistryError::PolicyTooLong);
        require!(!policy.is_empty(), crate::PredicateRegistryError::InvalidPolicy);
        
        self.client = client;
        self.policy = [0u8; 200];
        self.policy[..policy.len()].copy_from_slice(policy);
        self.policy_len = policy.len() as u16;
        self.set_at = clock.unix_timestamp;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Update the policy
    pub fn update_policy(&mut self, policy: &[u8], clock: &Clock) -> Result<()> {
        require!(policy.len() <= 200, crate::PredicateRegistryError::PolicyTooLong);
        require!(!policy.is_empty(), crate::PredicateRegistryError::InvalidPolicy);
        
        self.policy = [0u8; 200];
        self.policy[..policy.len()].copy_from_slice(policy);
        self.policy_len = policy.len() as u16;
        self.updated_at = clock.unix_timestamp;
        Ok(())
    }

    /// Get the active policy as a slice
    pub fn get_policy(&self) -> &[u8] {
        &self.policy[..self.policy_len as usize]
    }
}


impl Task {
    /// Get the active policy as a slice (trimming trailing zeros)
    pub fn get_policy(&self) -> &[u8] {
        // Find the first null byte or use full array
        let end = self.policy.iter().position(|&b| b == 0).unwrap_or(200);
        &self.policy[..end]
    }

    /// Hash the task for signature verification (equivalent to hashTaskSafe in Solidity)
    pub fn hash_task_safe(&self, validator: Pubkey) -> [u8; 32] {
        use anchor_lang::solana_program::hash::hash;
        
        let mut data = Vec::new();
        data.extend_from_slice(&self.uuid);
        data.extend_from_slice(&self.msg_sender.to_bytes());
        data.extend_from_slice(&validator.to_bytes()); // equivalent to msg.sender in Solidity
        data.extend_from_slice(&self.msg_value.to_le_bytes());
        data.extend_from_slice(&self.encoded_sig_and_args);
        data.extend_from_slice(self.get_policy());
        data.extend_from_slice(&self.expiration.to_le_bytes());
        
        hash(&data).to_bytes()
    }

    /// Hash the task with expiry (equivalent to hashTaskWithExpiry in Solidity)
    pub fn hash_task_with_expiry(&self) -> [u8; 32] {
        use anchor_lang::solana_program::hash::hash;
        
        let mut data = Vec::new();
        data.extend_from_slice(&self.uuid);
        data.extend_from_slice(&self.msg_sender.to_bytes());
        data.extend_from_slice(&self.target.to_bytes());
        data.extend_from_slice(&self.msg_value.to_le_bytes());
        data.extend_from_slice(&self.encoded_sig_and_args);
        data.extend_from_slice(self.get_policy());
        data.extend_from_slice(&self.expiration.to_le_bytes());
        
        hash(&data).to_bytes()
    }
}

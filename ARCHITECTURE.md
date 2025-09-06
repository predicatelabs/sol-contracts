# Predicate Registry Program Architecture

## Overview

This Solana program implements a comprehensive predicate registry system for managing attestors, policies, and task validation on the Solana blockchain. It provides a decentralized infrastructure for attestation-based validation with cryptographic security guarantees.

## Program Structure

### Core Components

```
programs/predicate_registry/src/
├── lib.rs              # Main program entry point and instruction definitions
├── state.rs            # Account structures and state management
├── errors.rs           # Custom error definitions
├── events.rs           # Event definitions for observability
└── instructions/       # Instruction handlers
    ├── mod.rs          # Module definitions and account contexts
    ├── initialize.rs   # Registry initialization logic
    ├── register_attestor.rs     # Attestor registration
    ├── deregister_attestor.rs   # Attestor deregistration
    ├── set_policy.rs           # Policy creation
    ├── update_policy.rs        # Policy updates
    ├── validate_attestation.rs # Task validation logic
    └── transfer_authority.rs   # Authority transfer
```

## Key Features

### 1. Program Derived Addresses (PDAs)

The program uses deterministic PDAs for all account types:

- **Registry**: `["predicate_registry"]`
- **Attestor Accounts**: `["attestor", attestor_pubkey]`
- **Policy Accounts**: `["policy", client_pubkey]`

This ensures:
- Deterministic account addresses
- No need for manual keypair generation
- Secure account ownership verification

### 2. Enhanced State Management

#### Registry Account (`PredicateRegistry`)
```rust
pub struct PredicateRegistry {
    pub authority: Pubkey,        // Registry owner
    pub created_at: i64,         // Creation timestamp
    pub updated_at: i64,         // Last update timestamp
    pub total_attestors: u64,    // Count of registered attestors
    pub total_policies: u64,     // Count of policies set
}
```

#### Attestor Account (`AttestorAccount`)
```rust
pub struct AttestorAccount {
    pub attestor: Pubkey,        // Attestor's public key
    pub is_registered: bool,     // Registration status
    pub registered_at: i64,      // Registration timestamp
}
```

#### Policy Account (`PolicyAccount`)
```rust
pub struct PolicyAccount {
    pub client: Pubkey,          // Client's public key
    pub policy: [u8; 200],       // Fixed-length policy data (200 bytes)
    pub policy_len: u16,         // Actual length of policy data
    pub set_at: i64,            // Creation timestamp
    pub updated_at: i64,        // Last update timestamp
}
```

### 3. Task and Attestation Structures

#### Task Structure
```rust
pub struct Task {
    pub uuid: [u8; 16],                    // Unique identifier
    pub msg_sender: Pubkey,                // Message sender
    pub target: Pubkey,                    // Target address
    pub msg_value: u64,                    // Message value (lamports)
    pub encoded_sig_and_args: Vec<u8>,     // Encoded signature and arguments
    pub policy: [u8; 200],                 // Fixed-length policy data
    pub expiration: i64,                   // Expiration timestamp
}
```

#### Attestation Structure
```rust
pub struct Attestation {
    pub uuid: [u8; 16],          // UUID matching the task
    pub attestor: Pubkey,        // Attestor's public key
    pub signature: [u8; 64],     // Ed25519 signature
    pub expiration: i64,         // Expiration timestamp
}
```

### 4. Comprehensive Error Handling

Custom error types provide clear feedback:

- **Registration Errors**: `AttestorAlreadyRegistered`, `AttestorNotRegistered`
- **Policy Errors**: `PolicyTooLong`, `InvalidPolicy`, `PolicyNotFound`
- **Validation Errors**: `TaskExpired`, `AttestationExpired`, `InvalidSignature`
- **Matching Errors**: `TaskIdMismatch`, `ExpirationMismatch`, `WrongAttestor`
- **Access Control**: `Unauthorized`
- **Arithmetic**: `ArithmeticError`

### 5. Event Emission

Events are emitted for all operations to enable off-chain monitoring:

- **Registry Events**: `RegistryInitialized`, `AuthorityTransferred`
- **Attestor Events**: `AttestorRegistered`, `AttestorDeregistered`
- **Policy Events**: `PolicySet`, `PolicyUpdated`
- **Validation Events**: `TaskValidated`

### 6. Security Features

- **Authority-based Access Control**: Registry operations require proper authorization
- **Signature Verification**: Ed25519 signature validation for attestations
- **Expiration Handling**: Time-based validation prevents stale data
- **Input Validation**: Parameter validation and sanitization
- **PDA-based Security**: Deterministic account derivation

## Instructions

### Initialize
Creates the main registry account with the specified authority.

```rust
pub fn initialize(ctx: Context<Initialize>) -> Result<()>
```

**Accounts:**
- `registry`: PDA account to be created
- `authority`: Signer and payer for account creation
- `system_program`: Required for account creation

### Register Attestor
Allows the registry authority to register a new attestor.

```rust
pub fn register_attestor(ctx: Context<RegisterAttestor>, attestor: Pubkey) -> Result<()>
```

**Accounts:**
- `registry`: Existing registry account
- `attestor_account`: PDA account to be created for the attestor
- `authority`: Registry authority (signer)
- `system_program`: Required for account creation

### Deregister Attestor
Allows the registry authority to deregister an existing attestor.

```rust
pub fn deregister_attestor(ctx: Context<DeregisterAttestor>, attestor: Pubkey) -> Result<()>
```

**Accounts:**
- `registry`: Existing registry account
- `attestor_account`: Existing attestor account to deregister
- `authority`: Registry authority (signer)

### Set Policy
Allows a client to set their validation policy.

```rust
pub fn set_policy(ctx: Context<SetPolicy>, policy: Vec<u8>) -> Result<()>
```

**Accounts:**
- `registry`: Existing registry account
- `policy_account`: PDA account to be created for the policy
- `client`: Client setting the policy (signer)
- `system_program`: Required for account creation

### Update Policy
Allows a client to update their existing policy.

```rust
pub fn update_policy(ctx: Context<UpdatePolicy>, policy: Vec<u8>) -> Result<()>
```

**Accounts:**
- `registry`: Existing registry account
- `policy_account`: Existing policy account to update
- `client`: Client updating the policy (signer)

### Validate Attestation
Validates an attestation for a given task.

```rust
pub fn validate_attestation(
    ctx: Context<ValidateAttestation>, 
    task: Task, 
    attestor_key: Pubkey,
    attestation: Attestation
) -> Result<()>
```

**Validation Steps:**
1. Check attestor is registered
2. Verify task hasn't expired
3. Verify attestation hasn't expired
4. Validate UUID matching between task and attestation
5. Verify expiration matching
6. Validate Ed25519 signature
7. Ensure signature matches provided attestor

**Accounts:**
- `registry`: Existing registry account
- `attestor_account`: Existing attestor account
- `policy_account`: Existing policy account for the client
- `validator`: Signer calling the validation

### Transfer Authority
Transfers registry ownership to a new account.

```rust
pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()>
```

**Accounts:**
- `registry`: Existing registry account
- `authority`: Current authority (signer)
- `new_authority`: Account info for new owner

## Account Validation

### PDA Derivation

All accounts use deterministic PDA derivation:

```rust
// Registry PDA
let (registry_pda, _) = Pubkey::find_program_address(
    &[b"predicate_registry"],
    &program_id
);

// Attestor PDA
let (attestor_pda, _) = Pubkey::find_program_address(
    &[b"attestor", attestor_key.as_ref()],
    &program_id
);

// Policy PDA
let (policy_pda, _) = Pubkey::find_program_address(
    &[b"policy", client_key.as_ref()],
    &program_id
);
```

### Access Control

- **Registry Authority**: Can register/deregister attestors and transfer authority
- **Clients**: Can set and update their own policies
- **Validators**: Can validate attestations (read-only operation)

## Cryptographic Validation

### Task Hashing

The program implements two hashing methods compatible with Solidity:

#### Hash Task Safe
```rust
pub fn hash_task_safe(&self, validator: Pubkey) -> [u8; 32] {
    // Hashes: uuid + msg_sender + validator + msg_value + encoded_sig_and_args + policy + expiration
}
```

#### Hash Task With Expiry
```rust
pub fn hash_task_with_expiry(&self) -> [u8; 32] {
    // Hashes: uuid + msg_sender + target + msg_value + encoded_sig_and_args + policy + expiration
}
```

### Signature Verification

Ed25519 signature verification ensures:
- Attestation authenticity
- Non-repudiation
- Integrity of task data

## Testing Strategy

The test suite should cover:

1. **Initialization**: Registry creation and authority setup
2. **Attestor Management**: Registration, deregistration, and access control
3. **Policy Management**: Setting, updating, and validation
4. **Task Validation**: Complete attestation validation flow
5. **Error Handling**: All error conditions and edge cases
6. **Authority Management**: Transfer and access control
7. **Event Emission**: Verification of emitted events
8. **Cryptographic Validation**: Signature verification and hashing

## Deployment

### Local Development
```bash
anchor build
anchor test
```

### Devnet Deployment
```bash
anchor build
anchor deploy --provider.cluster devnet
anchor test --provider.cluster devnet
```

### Mainnet Deployment
```bash
anchor build
anchor deploy --provider.cluster mainnet
```

## Best Practices Implemented

1. **Modular Architecture**: Clear separation of concerns
2. **Comprehensive Documentation**: Inline docs and architecture guide
3. **Error Handling**: Custom error types with descriptive messages
4. **Event Emission**: Observable program state changes
5. **Security**: Access control, signature verification, and input validation
6. **PDA Usage**: Deterministic account addresses
7. **Type Safety**: Strong typing throughout the codebase
8. **Gas Optimization**: Efficient account structures and operations
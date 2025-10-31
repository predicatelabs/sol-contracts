# Predicate Registry - Solana Programs

A decentralized attestation validation system for Solana programs. The Predicate Registry enables programs to validate off-chain attestations before executing protected operations.

## Architecture Overview

### Core Components

**1. Predicate Registry Program**
- Central registry for managing attesters and program policies
- Validates attestations via Ed25519 signature verification
- Prevents replay attacks through UUID tracking
- Provides CPI interface for client programs

**2. Client Programs (Counter, Demo Stub)**
- Business logic programs that integrate with the registry
- Make CPI calls to validate attestations before executing protected operations
- Each program has its own policy managed by its upgrade authority

## Design Principles

### Program-Based Policies

Policies are tied to **programs**, not users:

```
Policy PDA = ["policy", client_program_id]
```

- The `client_program` is the business logic program (e.g., Counter)
- Only the program's **upgrade authority** can set/update its policy
- Users are validated against the program's policy when calling it
- Policy contains a `policy_id` string (e.g., `"x-abc123"`) that identifies validation rules stored off-chain

**Why program-based?**
- Programs like DEXs, DAOs, or games need consistent validation rules for all users
- Upgrade authorities control program logic and security policies together
- Simplifies validation: one policy per program instead of per user

### Statement Structure

When a client program requests validation, the registry constructs a `Statement`:

```rust
Statement {
    uuid: [u8; 16],              // Unique identifier
    msg_sender: Pubkey,           // Transaction signer (user)
    target: Pubkey,               // Client program being called
    msg_value: u64,               // Lamports transferred
    encoded_sig_and_args: Vec<u8>, // Function signature (e.g., "increment()")
    policy_id: String,            // From the client program's policy
    expiration: i64,              // Timestamp
}
```

The registry automatically populates `msg_sender` and retrieves `policy_id` from the client program's policy account. This prevents clients from forging these critical fields.

### Cross-Program Invocation (CPI)

Client programs call the registry's `validate_attestation` instruction via CPI:

```rust
predicate_registry::cpi::validate_attestation(
    CpiContext::new(
        predicate_registry_program.to_account_info(),
        ValidateAttestation {
            registry,
            attester_account,
            policy_account,
            used_uuid_account,
            signer,
            instructions_sysvar,
            system_program,
        },
    ),
    target,                  // Client program ID
    msg_value,              // Lamports being transferred
    encoded_sig_and_args,   // Function signature
    attester_key,           // Expected attester
    attestation,            // Signed attestation
)?;
```

The registry:
1. Constructs the `Statement` (ensuring `msg_sender` and `policy_id` integrity)
2. Verifies the attester is registered
3. Checks expiration timestamps
4. Validates the Ed25519 signature
5. Prevents UUID replay attacks

### Ed25519 Signature Verification

The registry validates attestations using Solana's native Ed25519 program:

1. **Statement Hashing**: The `Statement` is serialized and hashed using Solana's `hash()` function (SHA-256)

2. **Ed25519 Instruction**: The transaction must include an `Ed25519Program.createInstructionWithPublicKey()` instruction **before** the validation instruction, containing:
   - The statement hash (message)
   - The attester's public key
   - The 64-byte Ed25519 signature

3. **Verification**: The registry reads the Ed25519 instruction from the instructions sysvar and verifies:
   - The signature matches the expected attester
   - The message matches the statement hash
   - The instruction index is correct (prevents instruction confusion attacks)

This approach leverages Solana's native Ed25519 signature verification, which is more efficient than implementing verification in program code.

## Example Programs

This repository includes two example client programs that demonstrate different integration patterns:

### Counter Program

A simple counter with protected increment operations. Demonstrates the **inheritance pattern** where business logic directly integrates validation.

**Purpose**: Educational reference for integrating predicate validation into program instructions

**Key Features**:
- Protected `increment()` instruction requiring valid attestation
- CPI call to registry's `validate_attestation` 
- Demonstrates statement construction and Ed25519 verification flow
- Shows how to validate function signatures (`encoded_sig_and_args`)

**Use Case**: Programs with specific protected operations (e.g., token transfers, DEX swaps, DAO votes)

### Demo Customer Stub

A minimal stub program serving as a policy anchor in the registry.

**Purpose**: Placeholder for customers who need a policy ID but haven't deployed custom logic yet

**Key Features**:
- Minimal program footprint (one no-op instruction)
- Has a program ID that can have policies set
- Can be extended with business logic as customer needs grow

**Use Case**: Rapid onboarding - customers can set policies immediately and add functionality later

## Program Instructions

### Predicate Registry

**Management**
- `initialize()` - Create the registry (one-time setup)
- `register_attester(attester_key)` - Add a trusted attester
- `deregister_attester(attester_key)` - Remove an attester
- `transfer_authority(new_authority)` - Change registry owner

**Policy Management**
- `set_policy_id(client_program, policy_id)` - Set a program's policy (requires program upgrade authority)
- `update_policy_id(client_program, policy_id)` - Update existing policy (requires program upgrade authority)

**Validation**
- `validate_attestation(...)` - Validate an attestation (called via CPI by client programs)
- `cleanup_expired_uuid(uuid)` - Remove expired UUID accounts to reclaim rent

## Account Structure

```
PredicateRegistry (PDA: ["predicate_registry"])
├── authority: Pubkey
├── total_attesters: u64
└── total_policies: u64

AttesterAccount (PDA: ["attester", attester_pubkey])
├── attester: Pubkey
├── is_registered: bool
└── registered_at: i64

PolicyAccount (PDA: ["policy", client_program_id])
├── client_program: Pubkey
├── authority: Pubkey (upgrade authority)
├── policy_id: String (max 64 chars)
├── set_at: i64
└── updated_at: i64

UsedUuidAccount (PDA: ["used_uuid", uuid_bytes])
├── uuid: [u8; 16]
├── used_at: i64
├── expires_at: i64
└── signer: Pubkey
```

## Technology Stack

- **Anchor Framework** (v0.31.1): Rust framework for Solana program development
  - Provides IDL generation for TypeScript clients
  - Account validation and serialization
  - CPI helpers and error handling

- **Agave** (Solana SDK v2.3.0): Solana runtime and core primitives
  - Ed25519 signature verification
  - BPF Loader Upgradeable for program deployment
  - Sysvar access (Clock, Instructions)

- **solana-verify**: Deterministic build toolchain for program verification
  - Enables on-chain verification of program source code
  - Used by block explorers (Solscan, Osec) for verified badges

## Security Features

- **Replay Protection**: UUIDs are tracked in on-chain accounts; reuse is prevented
- **Upgrade Authority Verification**: Policy management requires proof of program ownership via BPF Loader Upgradeable's program data account
- **Expiration Enforcement**: Both statements and attestations have expiration timestamps
- **Signature Verification**: Ed25519 signatures validated via Solana's native program
- **Attester Registry**: Only pre-registered attesters can sign valid attestations

## Development

### Prerequisites
- Rust 1.70+
- Solana CLI 1.18+
- Anchor CLI 0.31+
- Node.js 18+

### Build
```bash
anchor build
```

### Test
```bash
anchor test
```

Tests cover:
- Registry initialization and management
- Attester registration/deregistration
- Policy setting and updating (program-based)
- Attestation validation with Ed25519 signatures
- UUID replay attack prevention
- Authority transfer
- Integration between Counter and Registry

See `tests/` for comprehensive test suite documentation.

### Deploy

**Devnet:**
```bash
anchor deploy --provider.cluster devnet
```

**Mainnet:**
```bash
anchor deploy --provider.cluster mainnet
```

**Verifiable Build:**
```bash
solana-verify build --library-name predicate_registry
solana program deploy target/deploy/predicate_registry.so
```



## Integration Guide

To integrate a program with the Predicate Registry:

1. Add `predicate_registry` as a dependency in your `Cargo.toml`
2. Import CPI types: `use predicate_registry::{cpi::accounts::ValidateAttestation, ...}`
3. Add registry accounts to your instruction context
4. Call `validate_attestation` via CPI before executing protected logic
5. Ensure transactions include the Ed25519 signature verification instruction

See `programs/counter/src/instructions/increment.rs` for a complete example.

## License

MIT

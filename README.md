# Predicate Registry Program

A comprehensive predicate registry program for managing attestors, policies, and task validation on Solana. This program provides a decentralized way to register attestors, set client policies, and validate tasks with cryptographic attestations.

## 🚀 Features

### Core Functionality
- **Registry Management**: Initialize and manage a decentralized predicate registry
- **Attestor Registration**: Register and deregister trusted attestors
- **Policy Management**: Set and update client validation policies
- **Task Validation**: Validate tasks with cryptographic attestations
- **Authority Management**: Secure ownership transfer capabilities

### Advanced Features
- **Program Derived Addresses (PDAs)**: Deterministic account creation for all entities
- **Event Emission**: Observable state changes for off-chain applications
- **Comprehensive Error Handling**: Custom error types with descriptive messages
- **Authority Management**: Secure access control with ownership transfer
- **Signature Verification**: Ed25519 signature validation for attestations
- **Expiration Handling**: Time-based validation for tasks and attestations

## 📋 Prerequisites

- [Rust](https://rustup.rs/) 1.70.0 or later
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) 1.18.18 or later
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.30.1 or later
- [Node.js](https://nodejs.org/) 18.0 or later
- [Yarn](https://yarnpkg.com/) (recommended) or npm

## 🛠️ Installation

1. **Clone the repository**:
   ```bash
   git clone git@github.com:predicatelabs/sol-contracts.git
   cd sol-contracts
   ```

2. **Install dependencies**:
   ```bash
   yarn install
   ```

3. **Build the program**:
   ```bash
   anchor build
   ```

## ⚙️ Configuration

### Local Development

For local testing with `solana-test-validator`:

```bash
# Set cluster to localhost
solana config set --url localhost

# Start local validator (in separate terminal)
solana-test-validator
```

### Devnet Deployment

For devnet deployment:

1. **Set Solana config to devnet**:
   ```bash
   solana config set --url devnet
   ```

2. **Create/fund your wallet** (if needed):
   ```bash
   solana-keygen new --outfile ~/.config/solana/id.json
   solana airdrop 2
   ```

3. **Deploy to devnet**:
   ```bash
   ./scripts/deploy-devnet.sh
   ```

## 🎯 Usage

### Running Tests

```bash
# Run all tests on localnet
anchor test

# Run tests with specific cluster
anchor test --provider.cluster devnet

# Run tests with verbose output
anchor test -- --nocapture
```

### Program Instructions

The program uses Program Derived Addresses (PDAs) for deterministic account creation:

#### Initialize Registry
```typescript
const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("predicate_registry")],
  program.programId
);

await program.methods
  .initialize()
  .accounts({
    registry: registryPda,
    authority: authority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

#### Register Attestor
```typescript
const [attestorPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("attestor"), attestorKey.toBuffer()],
  program.programId
);

await program.methods
  .registerAttestor(attestorKey)
  .accounts({
    registry: registryPda,
    attestorAccount: attestorPda,
    authority: authority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

#### Set Policy
```typescript
const [policyPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("policy"), client.publicKey.toBuffer()],
  program.programId
);

// Policy as byte array (max 200 bytes)
const policyData = Buffer.from("your-policy-data", "utf8");

await program.methods
  .setPolicy(Array.from(policyData))
  .accounts({
    registry: registryPda,
    policyAccount: policyPda,
    client: client.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

#### Validate Attestation
```typescript
await program.methods
  .validateAttestation(task, attestorKey, attestation)
  .accounts({
    registry: registryPda,
    attestorAccount: attestorPda,
    policyAccount: policyPda,
    validator: validator.publicKey,
  })
  .rpc();
```

## 📁 Project Structure

```
sol-contracts/
├── programs/predicate_registry/  # Rust program source
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs               # Main program entry point
│       ├── state.rs             # Account structures and state management
│       ├── errors.rs            # Custom error definitions
│       ├── events.rs            # Event definitions
│       └── instructions/        # Instruction handlers
│           ├── mod.rs           # Module definitions and contexts
│           ├── initialize.rs    # Registry initialization
│           ├── register_attestor.rs
│           ├── deregister_attestor.rs
│           ├── set_policy.rs
│           ├── update_policy.rs
│           ├── validate_attestation.rs
│           └── transfer_authority.rs
├── migrations/                  # Deployment scripts
│   └── deploy.ts
├── scripts/                     # Utility scripts
│   └── deploy-devnet.sh
├── Anchor.toml                  # Anchor configuration
├── Cargo.toml                   # Workspace configuration
├── package.json                 # Node.js dependencies
├── tsconfig.json                # TypeScript configuration
├── ARCHITECTURE.md              # Detailed architecture guide
└── README.md                    # This file
```

## 🏗️ Program Architecture

### Registry Account Structure
```rust
pub struct PredicateRegistry {
    pub authority: Pubkey,        // 32 bytes - Owner of the registry
    pub created_at: i64,         // 8 bytes - Creation timestamp
    pub updated_at: i64,         // 8 bytes - Last update timestamp
    pub total_attestors: u64,    // 8 bytes - Total registered attestors
    pub total_policies: u64,     // 8 bytes - Total policies set
}
```

### Attestor Account Structure
```rust
pub struct AttestorAccount {
    pub attestor: Pubkey,        // 32 bytes - Attestor's public key
    pub is_registered: bool,     // 1 byte - Registration status
    pub registered_at: i64,      // 8 bytes - Registration timestamp
}
```

### Policy Account Structure
```rust
pub struct PolicyAccount {
    pub client: Pubkey,          // 32 bytes - Client's public key
    pub policy: [u8; 200],       // 200 bytes - Fixed-length policy data
    pub policy_len: u16,         // 2 bytes - Actual length of policy data
    pub set_at: i64,            // 8 bytes - Policy creation timestamp
    pub updated_at: i64,        // 8 bytes - Last update timestamp
}
```

### Task Structure
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

### Attestation Structure
```rust
pub struct Attestation {
    pub uuid: [u8; 16],          // UUID matching the task
    pub attestor: Pubkey,        // Attestor's public key
    pub signature: [u8; 64],     // Ed25519 signature
    pub expiration: i64,         // Expiration timestamp
}
```

### Event Types
- `RegistryInitialized`: Emitted when registry is created
- `AttestorRegistered`: Emitted when attestor is registered
- `AttestorDeregistered`: Emitted when attestor is deregistered
- `PolicySet`: Emitted when policy is set
- `PolicyUpdated`: Emitted when policy is updated
- `TaskValidated`: Emitted when task validation succeeds
- `AuthorityTransferred`: Emitted when ownership is transferred

### Error Types
- `AttestorAlreadyRegistered`: Attestor is already registered
- `AttestorNotRegistered`: Attestor is not registered
- `AttestorNotRegisteredForValidation`: Attestor not registered for validation
- `PolicyTooLong`: Policy string exceeds 200 characters
- `InvalidPolicy`: Policy string is empty
- `PolicyNotFound`: No existing policy found for client
- `TaskExpired`: Task has expired
- `AttestationExpired`: Attestation has expired
- `InvalidSignature`: Attestation signature is invalid
- `TaskIdMismatch`: Task and attestation UUIDs don't match
- `ExpirationMismatch`: Task and attestation expirations don't match
- `WrongAttestor`: Signature doesn't match provided attestor
- `Unauthorized`: Access control violations
- `ArithmeticError`: Arithmetic operation overflow/underflow

## 🛡️ Security Features

- **Authority-based Access Control**: Registry operations require proper authorization
- **Signature Verification**: Ed25519 signature validation for attestations
- **Expiration Handling**: Time-based validation prevents stale data
- **PDA-based Addressing**: Deterministic and secure account creation
- **Input Validation**: Parameter validation and sanitization
- **Event Auditing**: Complete operation history through events

## 📜 Available Scripts

```bash
# Development
yarn build              # Build the program
yarn test               # Run tests
yarn test:devnet        # Run tests on devnet
yarn lint               # Check code formatting
yarn lint:fix           # Fix formatting issues

# Deployment
yarn deploy             # Deploy to configured cluster
yarn deploy:devnet      # Deploy to devnet
```

## 🚀 Deployment

### Local Deployment
```bash
# Start local validator (in separate terminal)
solana-test-validator

# Build and deploy
anchor build
anchor deploy
anchor test
```

### Devnet Deployment
```bash
# Set cluster to devnet
solana config set --url devnet

# Deploy using script
./scripts/deploy-devnet.sh

# Or deploy manually
anchor deploy --provider.cluster devnet
anchor test --provider.cluster devnet
```

### Mainnet Deployment
```bash
# Set cluster to mainnet
solana config set --url mainnet

# Deploy (ensure you have sufficient SOL)
anchor deploy --provider.cluster mainnet
```

## 🆔 Program ID

The program ID is declared in `lib.rs`:
```rust
declare_id!("PredicateRegistry11111111111111111111111111");
```

**Important**: After deployment, update this with your actual program ID and update `Anchor.toml` accordingly.

## 📚 Documentation

- **[Architecture Guide](ARCHITECTURE.md)**: Detailed technical documentation
- **[Anchor Documentation](https://www.anchor-lang.com/)**: Framework documentation
- **[Solana Documentation](https://docs.solana.com/)**: Platform documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`anchor test`)
6. Run linting (`yarn lint:fix`)
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to the branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

### Development Guidelines

- Follow Rust and TypeScript best practices
- Add comprehensive tests for new features
- Update documentation for API changes
- Ensure security considerations are addressed
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anchor Framework](https://www.anchor-lang.com/) for the excellent Solana development framework
- [Solana Labs](https://solana.com/) for the high-performance blockchain platform
- The Solana developer community for continuous support and resources
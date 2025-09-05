# Solana Counter Program

A production-ready counter program built with the Anchor framework for Solana. This program demonstrates advanced Solana development practices including modular architecture, comprehensive error handling, event emission, and robust security features.

## 🚀 Features

### Core Functionality
- **Initialize**: Create a new counter account with PDA-based addressing
- **Increment**: Increase the counter value by 1 with overflow protection
- **Decrement**: Decrease the counter value by 1 with underflow protection
- **Reset**: Reset counter to zero (authority only)
- **Transfer Authority**: Transfer ownership to another account

### Advanced Features
- **Program Derived Addresses (PDAs)**: Deterministic account creation
- **Event Emission**: Observable state changes for off-chain applications
- **Comprehensive Error Handling**: Custom error types with descriptive messages
- **Authority Management**: Secure access control with ownership transfer
- **Audit Trail**: Track creation time, updates, and operation counts
- **Overflow/Underflow Protection**: Safe arithmetic operations
- **Modular Architecture**: Clean separation of concerns

## 📋 Prerequisites

- [Rust](https://rustup.rs/) 1.70.0 or later
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) 1.18.18 or later
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.30.1 or later
- [Node.js](https://nodejs.org/) 18.0 or later
- [Yarn](https://yarnpkg.com/) (recommended) or npm

## 🛠️ Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
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

#### Initialize Counter
```typescript
const [counterPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("counter"), user.publicKey.toBuffer()],
  program.programId
);

await program.methods
  .initialize()
  .accounts({
    counter: counterPda,
    user: user.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

#### Increment Counter
```typescript
await program.methods
  .increment()
  .accounts({
    counter: counterPda,
    authority: user.publicKey,
  })
  .rpc();
```

#### Decrement Counter
```typescript
await program.methods
  .decrement()
  .accounts({
    counter: counterPda,
    authority: user.publicKey,
  })
  .rpc();
```

#### Reset Counter
```typescript
await program.methods
  .reset()
  .accounts({
    counter: counterPda,
    authority: user.publicKey,
  })
  .rpc();
```

#### Transfer Authority
```typescript
await program.methods
  .transferAuthority(newAuthority.publicKey)
  .accounts({
    counter: counterPda,
    authority: currentAuthority.publicKey,
    newAuthority: newAuthority.publicKey,
  })
  .rpc();
```

## 📁 Project Structure

```
sol-contracts/
├── .github/workflows/       # CI/CD pipeline
│   └── ci.yml
├── programs/counter/        # Rust program source
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs          # Main program entry point
│       ├── state.rs        # Account structures
│       ├── errors.rs       # Custom error definitions
│       ├── events.rs       # Event definitions
│       └── instructions/   # Instruction handlers
│           ├── mod.rs      # Module definitions
│           ├── initialize.rs
│           ├── update.rs
│           └── transfer_authority.rs
├── tests/                   # TypeScript tests
│   └── counter.ts          # Comprehensive test suite
├── migrations/              # Deployment scripts
│   └── deploy.ts
├── scripts/                 # Utility scripts
│   └── deploy-devnet.sh
├── Anchor.toml             # Anchor configuration
├── Cargo.toml              # Workspace configuration
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript configuration
├── ARCHITECTURE.md         # Detailed architecture guide
└── README.md               # This file
```

## 🏗️ Program Architecture

### Counter Account Structure
```rust
pub struct Counter {
    pub authority: Pubkey,        // 32 bytes - Owner of the counter
    pub count: u64,              // 8 bytes - Current count value
    pub created_at: i64,         // 8 bytes - Creation timestamp
    pub updated_at: i64,         // 8 bytes - Last update timestamp
    pub total_increments: u64,   // 8 bytes - Total increment operations
    pub total_decrements: u64,   // 8 bytes - Total decrement operations
}
```

### Event Types
- `CounterInitialized`: Emitted when a counter is created
- `CounterIncremented`: Emitted when counter is incremented
- `CounterDecremented`: Emitted when counter is decremented
- `CounterReset`: Emitted when counter is reset
- `AuthorityTransferred`: Emitted when ownership is transferred

### Error Types
- `CounterOverflow`: Prevents arithmetic overflow
- `CounterUnderflow`: Prevents decrementing below zero
- `Unauthorized`: Access control violations
- `InvalidParameter`: Invalid input validation
- `AlreadyInitialized`: Duplicate initialization prevention

## 🛡️ Security Features

- **Authority-based Access Control**: Only counter owner can modify
- **Overflow/Underflow Protection**: Safe arithmetic operations
- **Input Validation**: Parameter validation and sanitization
- **PDA-based Addressing**: Deterministic and secure account creation
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
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
```

**Important**: After deployment, update this with your actual program ID and update `Anchor.toml` accordingly.

## 🔄 CI/CD Pipeline

This project includes a comprehensive GitHub Actions pipeline:

- **Lint & Format**: Code quality checks
- **Build**: Program compilation
- **Test**: Comprehensive test suite
- **Security Audit**: Dependency vulnerability scanning
- **Deploy**: Automated deployment to devnet/mainnet

See `.github/workflows/ci.yml` for complete pipeline configuration.

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

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anchor Framework](https://www.anchor-lang.com/) for the excellent Solana development framework
- [Solana Labs](https://solana.com/) for the high-performance blockchain platform
- The Solana developer community for continuous support and resources
ISC License
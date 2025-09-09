# SPL Token Predicate Example

This example program demonstrates how to integrate SPL Token functionality with the Predicate Registry for attestation-based token transfers. It provides a comprehensive implementation of protected token accounts that require attestation validation for all transfer operations.

## Overview

The SPL Token Predicate example creates a secure wrapper around SPL token accounts that enforces policy-based transfers through the Predicate Registry. All token transfers must be validated by registered attestors before execution, providing an additional layer of security and compliance.

## Features

- **Protected Token Accounts**: Wrapper accounts that enforce policy-based transfers
- **Attestation-Gated Transfers**: All transfers require valid attestations from registered attestors
- **Policy Management**: Set and update transfer policies for fine-grained control
- **Delegated Transfers**: Support for allowance-based transfers with attestation validation
- **Comprehensive Events**: Full observability for all operations
- **Transfer Statistics**: Track transfer counts and amounts

## Architecture

### Core Components

1. **ProtectedTokenAccount**: Main state account that wraps an SPL token account
2. **Policy Integration**: Seamless integration with Predicate Registry policies
3. **Attestation Validation**: Cross-program invocation (CPI) to validate attestations
4. **Transfer Execution**: Secure token transfers after successful validation

### Program Structure

```
src/
├── lib.rs                    # Program entry point and instruction definitions
├── state.rs                  # Account structures and state management
├── errors.rs                 # Custom error definitions
├── events.rs                 # Event definitions for observability
└── instructions/
    ├── mod.rs               # Instruction contexts and account validation
    ├── initialize.rs        # Initialize protected token account
    ├── update_policy.rs     # Update policy for existing account
    ├── protected_transfer.rs # Execute protected token transfer
    └── protected_transfer_from.rs # Execute delegated protected transfer
```

## Usage

### 1. Initialize a Protected Token Account

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SplTokenPredicate } from "./target/types/spl_token_predicate";

const program = anchor.workspace.SplTokenPredicate as Program<SplTokenPredicate>;

// Define policy
const policy = "max_amount:1000,daily_limit:5000,require_2fa:true";
const policyBytes = Buffer.from(policy, "utf8");

// Get PDA for protected account
const [protectedAccountPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("protected_token"),
    tokenAccount.toBuffer(),
    owner.publicKey.toBuffer()
  ],
  program.programId
);

// Initialize protected token account
await program.methods
  .initializeProtectedAccount(Array.from(policyBytes))
  .accounts({
    protectedAccount: protectedAccountPda,
    tokenAccount: tokenAccount,
    mint: mint,
    owner: owner.publicKey,
    predicateRegistry: predicateRegistryProgram.programId,
    registry: registryPda,
    policyAccount: policyPda,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([owner])
  .rpc();
```

### 2. Update Policy

```typescript
const newPolicy = "max_amount:2000,daily_limit:10000,whitelist_only:true";
const newPolicyBytes = Buffer.from(newPolicy, "utf8");

await program.methods
  .updatePolicy(Array.from(newPolicyBytes))
  .accounts({
    protectedAccount: protectedAccountPda,
    owner: owner.publicKey,
    predicateRegistry: predicateRegistryProgram.programId,
    registry: registryPda,
    policyAccount: policyPda,
  })
  .signers([owner])
  .rpc();
```

### 3. Execute Protected Transfer

```typescript
// Create task for the transfer
const task = {
  uuid: Array.from(crypto.randomBytes(16)),
  msgSender: owner.publicKey,
  target: destinationTokenAccount,
  msgValue: new anchor.BN(transferAmount),
  encodedSigAndArgs: Buffer.from("transfer_args", "utf8"),
  policy: policyArray, // Policy from protected account
  expiration: new anchor.BN(futureTimestamp),
};

// Get attestation from registered attestor (implementation specific)
const attestation = await getAttestationFromAttestor(task);

// Execute protected transfer
await program.methods
  .protectedTransfer(task, attestation, new anchor.BN(transferAmount))
  .accounts({
    protectedAccount: protectedAccountPda,
    sourceTokenAccount: sourceTokenAccount,
    destinationTokenAccount: destinationTokenAccount,
    owner: owner.publicKey,
    predicateRegistry: predicateRegistryProgram.programId,
    registry: registryPda,
    attestorAccount: attestorPda,
    policyAccount: policyPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([owner])
  .rpc();
```

### 4. Execute Delegated Transfer

```typescript
// First approve delegate
const approveTx = new Transaction().add(
  createApproveInstruction(
    tokenAccount,
    delegate.publicKey,
    owner.publicKey,
    transferAmount
  )
);
await provider.sendAndConfirm(approveTx, [owner]);

// Create task with delegate as msg_sender
const delegatedTask = {
  ...task,
  msgSender: delegate.publicKey,
};

// Execute delegated transfer
await program.methods
  .protectedTransferFrom(delegatedTask, attestation, new anchor.BN(transferAmount))
  .accounts({
    protectedAccount: protectedAccountPda,
    sourceTokenAccount: sourceTokenAccount,
    destinationTokenAccount: destinationTokenAccount,
    delegate: delegate.publicKey,
    predicateRegistry: predicateRegistryProgram.programId,
    registry: registryPda,
    attestorAccount: attestorPda,
    policyAccount: policyPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([delegate])
  .rpc();
```

## Policy Configuration

Policies are flexible string-based configurations that define transfer rules. Example policy formats:

```
# Basic amount limits
"max_amount:1000,daily_limit:5000"

# Time-based restrictions
"max_amount:1000,time_window:3600,max_per_window:5"

# Advanced features
"max_amount:1000,require_2fa:true,whitelist_only:true,min_confirmations:2"

# Multi-signature requirements
"max_amount:10000,require_multisig:true,min_signers:3"
```

## Events

The program emits comprehensive events for observability:

- `ProtectedAccountInitialized`: When a new protected account is created
- `PolicyUpdated`: When a policy is modified
- `ProtectedTransfer`: When a direct transfer is executed
- `ProtectedTransferFrom`: When a delegated transfer is executed
- `AttestationValidationFailed`: When attestation validation fails
- `PolicyViolation`: When a transfer violates policy rules

## Testing

Run the comprehensive test suite:

```bash
# Build the programs
anchor build

# Run tests
anchor test

# Run tests with verbose output
anchor test -- --nocapture
```

### Test Coverage

The test suite covers:

- Protected account initialization
- Policy management (set/update)
- Direct protected transfers
- Delegated protected transfers
- Error conditions (expired tasks, insufficient balance, etc.)
- Policy violations
- Attestation validation failures

## Security Considerations

1. **Attestation Validation**: All transfers require valid attestations from registered attestors
2. **Policy Enforcement**: Policies are enforced at both program and registry levels
3. **Owner Authorization**: Only account owners can update policies
4. **Replay Protection**: Task UUIDs prevent replay attacks
5. **Expiration Checks**: All tasks and attestations have expiration times
6. **Balance Validation**: Transfers are validated against available balances
7. **Allowance Checks**: Delegated transfers validate allowances

## Integration with Predicate Registry

This example demonstrates several integration patterns:

### Cross-Program Invocation (CPI)

```rust
// Validate attestation via CPI
let cpi_accounts = predicate_registry::cpi::accounts::ValidateAttestation {
    registry: ctx.accounts.registry.to_account_info(),
    attestor_account: ctx.accounts.attestor_account.to_account_info(),
    policy_account: ctx.accounts.policy_account.to_account_info(),
    validator: owner.to_account_info(),
};

let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
predicate_registry::cpi::validate_attestation(cpi_ctx, task, attestor_key, attestation)?;
```

### Policy Synchronization

```rust
// Set policy in both local account and registry
protected_account.update_policy(&new_policy, &clock)?;
predicate_registry::cpi::update_policy(cpi_ctx, policy_data)?;
```

## Error Handling

The program includes comprehensive error handling:

- `PolicyTooLong`: Policy exceeds 200 bytes
- `InvalidPolicy`: Empty or malformed policy
- `AttestationValidationFailed`: Attestation validation failed
- `TaskExpired`: Task has expired
- `InsufficientBalance`: Insufficient token balance
- `PolicyViolation`: Transfer violates policy rules

## Development

### Prerequisites

- Rust 1.70+
- Solana CLI 1.18+
- Anchor Framework 0.30+
- Node.js 18+

### Building

```bash
# Install dependencies
npm install

# Build the program
anchor build

# Generate TypeScript types
anchor build --idl target/idl
```

### Deployment

```bash
# Deploy to localnet
anchor deploy

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## License

This example is provided under the same license as the main Predicate Registry project.

## Contributing

This is an example program for demonstration purposes. For production use, consider:

1. Enhanced policy parsing and validation
2. More sophisticated rate limiting
3. Additional security checks
4. Comprehensive audit trail
5. Integration with external attestation services

## Support

For questions or issues related to this example, please refer to the main Predicate Registry documentation or create an issue in the project repository.

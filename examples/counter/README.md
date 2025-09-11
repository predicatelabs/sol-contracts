# Counter Program Example

This example demonstrates how to integrate a Solana program with the predicate-registry for transaction validation. The counter program implements a simple counter that can only be incremented after successful attestation validation through the predicate-registry.

## Overview

The counter program follows the **inheritance pattern** from the Solidity examples, where business logic is directly protected by predicate validation. This pattern provides:

- **Direct Integration**: Counter program makes Cross-Program Invocation (CPI) calls to predicate-registry
- **Protected Operations**: Only validated transactions can increment the counter
- **Task-Based Validation**: Each increment operation requires a valid task and attestation

## Architecture

```
┌─────────────────┐    ┌────────────────────┐    ┌─────────────────┐
│   Client App    │───►│  Counter Program   │───►│ Predicate       │
│                 │    │                    │    │ Registry        │
│ - Creates tasks │    │ - Stores counter   │    │ - Validates     │
│ - Gets attests  │    │ - Validates via    │    │   attestations  │
│ - Sends txns    │    │   CPI calls        │    │ - Manages       │
└─────────────────┘    └────────────────────┘    │   policies      │
                                                  └─────────────────┘
```

## Files Structure

```
examples/counter/
├── README.md              # This documentation
├── client.ts              # TypeScript client example
├── deploy.md              # Deployment instructions
└── package.json           # Dependencies (optional)

programs/counter/
├── Cargo.toml             # Counter program dependencies
└── src/
    ├── lib.rs             # Main program entry point
    ├── instructions/      # Instruction handlers
    │   ├── mod.rs         # Instructions module exports
    │   ├── initialize.rs  # Initialize counter instruction
    │   ├── increment.rs   # Protected increment instruction
    │   └── get_value.rs   # Read-only get value instruction
    ├── state.rs           # Account structures and state management
    ├── events.rs          # Event definitions
    └── errors.rs          # Custom error definitions
```

## Program Features

### Counter Program (Modular Structure)

**Instructions (`src/instructions/`):**
- `initialize()` - Create counter with predicate-registry integration
- `increment()` - Protected increment requiring valid attestation  
- `get_value()` - Public read-only function to get current value

**State Management (`src/state.rs`):**
- **CounterAccount**: Stores counter value, owner, and registry config
- **State Methods**: Safe increment, initialization, and access methods
- **Validation Helpers**: Owner checks and registry configuration

**Events (`src/events.rs`):**
- **CounterInitialized**: Emitted when counter is created
- **CounterIncremented**: Emitted when counter is incremented

**Errors (`src/errors.rs`):**
- **Comprehensive Error Handling**: Specific error codes for different failure scenarios
- **User-Friendly Messages**: Clear descriptions for debugging and user feedback

**Security Features:**
- Owner verification (only counter owner can increment)
- Task parameter validation (function signature, target verification)
- Predicate registry integration for attestation validation
- Arithmetic safety (overflow protection)

### Client Script (`examples/counter/client.ts`)

**Functionality:**
- Sets up program clients and test accounts
- Initializes predicate-registry if needed
- Registers attestor and sets policies
- Creates and signs increment tasks
- Performs protected counter increments with attestation validation

**Key Functions:**
- `createIncrementTask()` - Creates task for increment operation
- `createSignature()` - Signs task with attestor's private key
- `incrementCounter()` - Performs protected increment with validation

## Integration Pattern Details

### Task Creation

Each counter increment requires a Task struct with:

```typescript
{
  uuid: [u8; 16],           // Unique identifier
  msgSender: Pubkey,        // Counter owner
  target: Pubkey,           // Counter program ID
  msgValue: u64,            // SOL value (0 for increment)
  encodedSigAndArgs: Vec<u8>, // "increment()" signature
  policy: [u8; 200],        // Policy identifier
  expiration: i64,          // Task expiration timestamp
}
```

### Attestation Process

1. **Task Creation**: Client creates increment task with parameters
2. **Signing**: Attestor signs task hash with Ed25519
3. **Attestation**: Package signature into attestation struct
4. **Validation**: Counter program calls predicate-registry via CPI
5. **Execution**: If validation succeeds, counter is incremented

### Transaction Structure

Each increment transaction contains two instructions:
1. **Ed25519 Verification**: Solana's native signature verification
2. **Counter Increment**: Protected business logic execution

```typescript
const transaction = new Transaction();
transaction.add(ed25519Instruction);      // Signature verification
transaction.add(incrementInstruction);    // Protected increment
```

## Running the Example

### Prerequisites

1. **Solana CLI** installed and configured
2. **Anchor Framework** v0.31.1 or later  
3. **Node.js** and **TypeScript** for client
4. **Local test validator** running

### Setup

1. **Start local validator:**
   ```bash
   solana-test-validator
   ```

2. **Build programs:**
   ```bash
   anchor build
   ```

3. **Deploy programs:**
   ```bash
   anchor deploy
   ```

### Running the Client

1. **From the project root:**
   ```bash
   cd examples/counter
   npx ts-node client.ts
   ```

2. **Expected output:**
   ```
   🚀 Counter Program Client Example Starting...
   ✅ Programs loaded:
      Predicate Registry: GNhUnSDSxfpFqHV73TPNGFCmfgrxuLLL6jcE1zXe9xx
      Counter: Counter111111111111111111111111111111111111
   ✅ Test accounts created and funded
   ✅ PDAs calculated
   ✅ Registry initialized
   ✅ Attestor registered  
   ✅ Policy set
   ✅ Counter initialized
   📊 Initial counter value: 0
   🚀 Sending increment transaction...
   ✅ Counter incremented successfully
   📊 Final counter value: 1
   ✅ Counter Program Client Example completed successfully!
   ```

### Testing

Run the existing test suite to ensure everything works:

```bash
# Run all tests
anchor test

# Run specific test pattern
anchor test --grep "counter"
```

## Integration Guide

### Adding to Your Program

To integrate predicate validation into your own program:

1. **Add dependency** in your `Cargo.toml`:
   ```toml
   [dependencies]
   predicate_registry = { path = "../predicate_registry", features = ["cpi"] }
   ```

2. **Import required types:**
   ```rust
   use predicate_registry::{
       cpi::accounts::ValidateAttestation,
       program::PredicateRegistry,
       PredicateRegistry as PredicateRegistryAccount,
       Task, Attestation,
   };
   ```

3. **Add validation to your instruction:**
   ```rust
   pub fn protected_function(
       ctx: Context<YourInstruction>,
       task: Task,
       attestor_key: Pubkey,
       attestation: Attestation,
   ) -> Result<()> {
       // Validate task parameters
       require!(task.msg_sender == expected_sender, ErrorCode::Unauthorized);
       require!(task.target == crate::ID, ErrorCode::InvalidTask);
       
       // Make CPI call to validate attestation
       validate_attestation_cpi(&ctx, task, attestor_key, attestation)?;
       
       // Execute your business logic here
       // ...
       
       Ok(())
   }
   ```

4. **Implement CPI helper:**
   ```rust
   fn validate_attestation_cpi(
       ctx: &Context<YourInstruction>,
       task: Task,
       attestor_key: Pubkey,
       attestation: Attestation,
   ) -> Result<()> {
       let cpi_accounts = ValidateAttestation {
           registry: ctx.accounts.predicate_registry.to_account_info(),
           attestor_account: ctx.accounts.attestor_account.to_account_info(),
           policy_account: ctx.accounts.policy_account.to_account_info(),
           validator: ctx.accounts.your_program_account.to_account_info(),
           instructions_sysvar: ctx.accounts.instructions_sysvar.to_account_info(),
       };

       let cpi_program = ctx.accounts.predicate_registry_program.to_account_info();
       let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

       predicate_registry::cpi::validate_attestation(
           cpi_ctx, task, attestor_key, attestation
       )
   }
   ```

### Client Integration

For client-side integration:

1. **Create tasks** matching your function signature
2. **Get attestations** from registered attestors
3. **Include Ed25519 verification** instruction before your instruction
4. **Handle validation errors** appropriately

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `Unauthorized` | Wrong msg_sender in task | Ensure task.msg_sender matches expected caller |
| `InvalidTask` | Wrong target or signature | Verify task.target and encoded_sig_and_args |
| `AttestationExpired` | Old attestation | Get fresh attestation with future expiration |
| `AttestorNotRegistered` | Unregistered attestor | Register attestor with registry authority |
| `InvalidSignature` | Wrong signature | Ensure Ed25519 instruction precedes your instruction |

## Security Considerations

1. **Task Validation**: Always validate task parameters before accepting attestations
2. **Expiration Handling**: Set appropriate expiration times for tasks and attestations  
3. **Policy Management**: Use meaningful policy identifiers and manage them securely
4. **Attestor Trust**: Only register trusted attestors in your predicate registry
5. **Signature Verification**: Always include Ed25519 verification instruction

## Comparison with Solidity Patterns

| Aspect | Solidity (Inheritance) | Solana (This Example) |
|--------|------------------------|----------------------|
| **Integration** | Direct inheritance | CPI calls |
| **Validation** | Internal function calls | Cross-program invocations |
| **State** | Contract storage | Account-based storage |
| **Permissions** | msg.sender checks | Signer verification |
| **Flexibility** | Modifier-based | Instruction-based |

## Next Steps

1. **Extend Functionality**: Add more counter operations (decrement, reset)
2. **Multiple Counters**: Support multiple counters per owner
3. **Advanced Policies**: Implement more complex policy logic
4. **UI Integration**: Build a frontend for the counter
5. **Production Deployment**: Deploy to devnet/mainnet

## Resources

- [Anchor Documentation](https://anchor-lang.com/)
- [Solana Program Library](https://spl.solana.com/)
- [Predicate Protocol Documentation](https://docs.predicate.co/)
- [Ed25519 Program Reference](https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program)
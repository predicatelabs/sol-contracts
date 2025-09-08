# Predicate Registry Tests

This directory contains comprehensive tests for the Predicate Registry Solana program. The tests are organized modularly following best practices for Solana smart contract development with the Anchor framework.

## Test Architecture

The test suite follows a **focused unit tests + comprehensive integration tests** pattern:

- **Focused Test Files**: Each core instruction has its own dedicated test file with thorough unit testing
- **Integration Test File**: Complex workflows, cross-operation scenarios, edge cases, and end-to-end testing
- **Shared Context**: All tests use a shared test context for consistency and performance
- **No Redundancy**: Eliminated duplicate test cases through strategic consolidation

## Test Structure

### Core Test Files

- **`initialization.test.ts`** - Focused tests for registry initialization
- **`attestor-management.test.ts`** - Tests for attestor registration and deregistration  
- **`policy-management.test.ts`** - Tests for policy setting and updating
- **`authority-transfer.test.ts`** - Tests for authority transfer functionality
- **`integration.test.ts`** - Integration tests covering complex workflows, edge cases, and cross-operation scenarios

### Helper Files

- **`helpers/shared-setup.ts`** - Shared test context and registry setup
- **`helpers/test-utils.ts`** - Utility functions and test helpers
- **`helpers/test-authority-keypair.json`** - Persistent authority keypair for consistent test state

## Test Coverage

The test suite covers all program instructions except signature validation:

### ✅ Covered Instructions
- `initialize` - Registry initialization
- `register_attestor` - Attestor registration
- `deregister_attestor` - Attestor deregistration  
- `set_policy` - Policy setting
- `update_policy` - Policy updates
- `transfer_authority` - Authority transfer

### ❌ Not Covered (As Requested)
- `validate_attestation` - Signature validation functionality

## Test Categories

### 1. Positive Tests
- Successful execution of all instructions
- Proper state updates
- Event emission verification
- Account creation and management

### 2. Negative Tests
- Unauthorized access attempts
- Invalid parameter handling
- Constraint violations
- Error condition testing

### 3. Edge Cases
- Maximum/minimum values
- Boundary conditions
- State transitions
- Recovery scenarios

### 4. Integration Tests
- Multi-operation workflows
- Cross-instruction interactions
- State consistency across operations
- Complex end-to-end scenarios
- Edge cases and boundary conditions
- Recovery from failure scenarios
- Concurrent operation handling

## Key Features

### Modular Design
- Each instruction has dedicated focused test files
- Shared test context and utilities for consistency
- Integration tests for complex cross-operation scenarios
- Clear separation between unit and integration tests

### Comprehensive Coverage
- All success paths tested
- All error conditions covered
- Edge cases and boundary conditions
- State consistency verification

### Best Practices
- Shared test context for consistency and performance
- Proper account management with persistent authority
- PDA derivation testing
- Event listener verification
- Clean test isolation with authority restoration
- Efficient resource usage (minimal SOL airdrops)

### Anchor Framework Integration
- Uses Anchor testing utilities
- Proper account context setup
- Type-safe interactions
- Event handling

## Running Tests

```bash
# Run all tests
anchor test

# Run specific test file (focused tests)
anchor test --skip-deploy tests/initialization.test.ts
anchor test --skip-deploy tests/attestor-management.test.ts
anchor test --skip-deploy tests/policy-management.test.ts
anchor test --skip-deploy tests/authority-transfer.test.ts

# Run integration tests only
anchor test --skip-deploy tests/integration.test.ts

# Run tests on devnet
anchor test --provider.cluster devnet
```

## Test Data

Tests use realistic data patterns:
- Various policy lengths (1-200 bytes)
- Multiple attestor scenarios
- Authority transfer chains
- Mixed operation sequences

## Error Testing

Comprehensive error testing includes:
- `Unauthorized` - Wrong authority attempts
- `PolicyTooLong` - Policy size violations
- `InvalidPolicy` - Empty policy attempts
- `AttestorNotRegistered` - Invalid attestor operations
- Account initialization errors
- Constraint violations

## State Verification

All tests verify:
- Account state changes
- Registry statistics updates
- Timestamp accuracy
- Data integrity
- Cross-account consistency

## Event Testing

Event emission is verified for:
- `RegistryInitialized`
- `AttestorRegistered`
- `AttestorDeregistered`
- `PolicySet`
- `PolicyUpdated`
- `AuthorityTransferred`

## Performance Considerations

Tests are designed to:
- Minimize transaction costs
- Use efficient account patterns
- Batch operations where possible
- Clean up test state properly

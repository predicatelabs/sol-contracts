# Predicate Registry Tests

This directory contains comprehensive tests for the Predicate Registry Solana program. The tests are organized modularly following best practices for Solana smart contract development with the Anchor framework.

## Test Structure

### Core Test Files

- **`predicate-registry.ts`** - Main comprehensive test suite covering all functionality
- **`initialization.test.ts`** - Focused tests for registry initialization
- **`attestor-management.test.ts`** - Tests for attestor registration and deregistration
- **`policy-management.test.ts`** - Tests for policy setting and updating
- **`authority-transfer.test.ts`** - Tests for authority transfer functionality
- **`integration.test.ts`** - Integration tests covering multiple operations

### Helper Files

- **`helpers/test-utils.ts`** - Utility functions and test helpers

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
- State consistency
- Complex scenarios

## Key Features

### Modular Design
- Each instruction has dedicated test files
- Shared utilities in helper functions
- Clear separation of concerns

### Comprehensive Coverage
- All success paths tested
- All error conditions covered
- Edge cases and boundary conditions
- State consistency verification

### Best Practices
- Proper account management
- PDA derivation testing
- Event listener verification
- Clean test isolation

### Anchor Framework Integration
- Uses Anchor testing utilities
- Proper account context setup
- Type-safe interactions
- Event handling

## Running Tests

```bash
# Run all tests
anchor test

# Run specific test file
anchor test --skip-deploy tests/initialization.test.ts

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

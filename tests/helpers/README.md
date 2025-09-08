# Test Helpers

This directory contains shared utilities and setup functions for the Predicate Registry test suite.

## Shared Test Setup

The `shared-setup.ts` module provides a centralized way to manage test accounts and registry initialization across all test files.

### Usage

```typescript
import { setupSharedTestContext, SharedTestContext } from "./helpers/shared-setup";

describe("Your Test Suite", () => {
  let context: SharedTestContext;

  before(async () => {
    context = await setupSharedTestContext();
  });

  it("should use shared accounts", async () => {
    // Access shared accounts
    const authority = context.accounts.authority;
    const client1 = context.accounts.client1;
    
    // Access shared program and provider
    const program = context.program;
    const provider = context.provider;
    
    // Access shared PDAs
    const registryPda = context.pdas.registryPda;
  });
});
```

### Benefits

1. **Consistent State**: All tests use the same initialized registry and funded accounts
2. **Faster Execution**: No need to create new accounts and initialize registry for each test file
3. **Reduced Complexity**: Eliminates duplicate setup code across test files
4. **Better Resource Management**: Shared accounts reduce the number of SOL airdrops needed

### Available Accounts

The shared context provides the following pre-funded accounts:

- `authority`: Main registry authority account
- `newAuthority`: Alternative authority for transfer tests
- `client1`, `client2`: Client accounts for policy tests
- `attestor1`, `attestor2`: Attestor accounts for registration tests
- `validator`: Validator account for general use

### Registry State

The shared setup automatically:

1. Creates and funds all test accounts
2. Initializes the predicate registry with the authority account
3. Provides access to the registry PDA and bump seed

### Resetting Context

If you need to reset the shared context (rare), you can call:

```typescript
import { resetSharedTestContext } from "./helpers/shared-setup";

// This will force the next call to setupSharedTestContext to create fresh state
resetSharedTestContext();
```

## Test Utils

The `test-utils.ts` module provides utility functions for common test operations:

- Account creation and funding
- PDA finding functions
- Registry initialization helpers
- Common test data generators
- Error assertion helpers

See the individual function documentation in `test-utils.ts` for detailed usage information.

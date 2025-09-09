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

  it("should use shared context", async () => {
    // Access shared authority
    const authority = context.authority.keypair;
    
    // Access shared program and provider
    const program = context.program;
    const provider = context.provider;
    
    // Access shared registry PDA
    const registryPda = context.registry.registryPda;
    const registryBump = context.registry.registryBump;
  });
});
```

### Benefits

1. **Consistent State**: All tests use the same initialized registry and funded accounts
2. **Faster Execution**: No need to create new accounts and initialize registry for each test file
3. **Reduced Complexity**: Eliminates duplicate setup code across test files
4. **Better Resource Management**: Shared accounts reduce the number of SOL airdrops needed

### Available Context

The shared context provides:

- `context.authority`: Main registry authority account (persistent keypair)
- `context.program`: Anchor program instance
- `context.provider`: Anchor provider instance  
- `context.registry`: Registry PDA and bump seed

Additional test accounts can be created using helper functions:

```typescript
import { createTestAccount } from "./test-utils";

// Create additional accounts as needed
const client1Account = await createTestAccount(context.provider);
const attestorKeypair = Keypair.generate();
```

### Registry State

The shared setup automatically:

1. Creates and funds the persistent authority account
2. Initializes the predicate registry with the authority account (if not already initialized)
3. Provides access to the registry PDA and bump seed
4. Ensures consistent state across all test files

### Persistent Authority

The shared context uses a persistent authority keypair stored in `test-authority-keypair.json`. This ensures:

- Consistent registry ownership across test runs
- Faster test execution (no need to re-initialize registry)
- Reliable test isolation while sharing infrastructure

## Test Utils

The `test-utils.ts` module provides utility functions for common test operations:

- Account creation and funding
- PDA finding functions
- Registry initialization helpers
- Common test data generators
- Error assertion helpers

See the individual function documentation in `test-utils.ts` for detailed usage information.

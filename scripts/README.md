# Initialization Scripts

This directory contains scripts to initialize the predicate registry and counter programs using deployment keys.

## Prerequisites

1. **Deployed Programs**: Both `predicate_registry` and `counter` programs must be deployed
2. **Test Keys**: Run `npx ts-node --transpile-only scripts/generate-test-keys.ts` to create test keys
3. **Wallet Configuration**: Your Solana wallet should be configured and funded
4. **Environment Variables** (optional):
   - `ANCHOR_PROVIDER_URL`: Solana cluster URL (defaults to `http://127.0.0.1:8899`)
   - `ANCHOR_WALLET`: Path to wallet keypair (defaults to `scripts/test-keys/authority.json`)
   - `ATTESTER_WALLET`: Path to attester keypair for increment script (defaults to `scripts/test-keys/attester-1.json`)
   - `USE_TEST_KEYS`: Enable/disable test key features (defaults to `true`)

## Scripts

### 1. Initialize Predicate Registry

```bash
npx ts-node scripts/initialize-predicate-registry.ts
```

This script will:
- Load the authority keypair from your configured wallet (defaults to test-keys/authority.json)
- Automatically request airdrop if balance is low (localnet/devnet only)
- Initialize the predicate registry if it doesn't exist
- Register all test attesters automatically (when using test keys)
- Display registry information including PDA, authority, and statistics

**Output**: Registry PDA address, initialization status, and attester registration summary

### 2. Initialize Counter Program

```bash
npx ts-node scripts/initialize-counter.ts
```

This script will:
- Load the owner keypair from your configured wallet (defaults to test-keys/authority.json)
- Automatically request airdrop if balance is low (localnet/devnet only)
- Verify that the predicate registry is initialized
- Set a default policy for the counter owner if none exists
- Initialize a new counter instance if it doesn't exist
- Display counter information including PDA, owner, and current value

**Output**: Counter PDA address and initialization status

### 3. Register Attester

```bash
export ATTESTER_PUBKEY=<attester-public-key>
npx ts-node scripts/register-attester.ts
```

This script will:
- Load the authority keypair from your configured wallet
- Accept the attester public key from the `ATTESTER_PUBKEY` environment variable
- Verify that the predicate registry is initialized
- Register the attester if not already registered
- Display attester information and updated registry statistics

**Required Environment Variable**: `ATTESTER_PUBKEY` - The public key of the attester to register

**Output**: Attester PDA address, registration status, and registry statistics

### 4. Increment Counter

```bash
npx ts-node scripts/increment-counter.ts
```

This script will:
- Load the counter owner keypair (defaults to test-keys/authority.json)
- Load an attester keypair (defaults to test-keys/attester-1.json)
- Automatically request airdrop if balance is low (localnet/devnet only)
- Verify all prerequisites (registry, counter, attester, policy)
- Create and sign a statement for the increment operation
- Execute the increment with full predicate validation
- Display the counter value change and transaction details

**Output**: Counter increment result with before/after values and transaction signature

### 5. Generate Test Attester (Utility)

```bash
npx ts-node --transpile-only scripts/generate-test-attester.ts [--save]
```

This utility script will:
- Generate a new keypair for testing purposes
- Display the public key that can be used for registration
- Optionally save the keypair to a file (with `--save` flag)
- Provide usage instructions for the register-attester script

**Output**: Attester public key and usage instructions

### 6. Generate Test Keys

```bash
npx ts-node --transpile-only scripts/generate-test-keys.ts
```

This script will:
- Create a `test-keys/` directory in the scripts folder
- Generate 1 authority keypair (`authority`) for registry initialization
- Generate 3 attester keypairs (`attester-1`, `attester-2`, `attester-3`) for registration
- Save each keypair as a JSON file
- Create a README.md with all public keys and usage commands
- Provide quick copy-paste commands for setup and registration

**Output**: 1 authority key + 3 attester keys with comprehensive documentation

## Automatic Features

When using test keys (default behavior), the scripts provide enhanced automation:

### 🔄 **Auto-Configuration**
- Scripts automatically use `test-keys/authority.json` as the default wallet
- No need to manually set `ANCHOR_WALLET` environment variable
- Automatic airdrop requests on localnet/devnet when balance is low
- Clear warnings when using test keys for development

### 🤖 **Auto-Registration**
- `initialize-predicate-registry.ts` automatically registers all 3 test attesters
- Skips registration if attesters are already registered (idempotent)
- Provides detailed registration summary

### 🛡️ **Safety Features**
- Set `USE_TEST_KEYS=false` to disable automatic test key features
- Clear warnings about test-only usage
- Graceful fallback to manual configuration

## Complete Workflow

The scripts are designed to work together in a specific sequence for a complete predicate validation setup:

```bash
# 1. Generate test keys (one-time setup)
npx ts-node --transpile-only scripts/generate-test-keys.ts

# 2. Initialize predicate registry + register attesters
npx ts-node scripts/initialize-predicate-registry.ts

# 3. Initialize counter with policy
npx ts-node scripts/initialize-counter.ts

# 4. Test predicate validation by incrementing counter
npx ts-node scripts/increment-counter.ts
```

This workflow demonstrates the complete predicate validation flow:
- **Registry Setup**: Authority initializes registry and registers attesters
- **Client Setup**: Counter owner sets policy and initializes counter
- **Validation Flow**: Attester signs statements, counter validates with predicate registry

## Usage Examples

### Local Development (Localnet)

```bash
# Start local validator (if not running)
solana-test-validator

# Initialize predicate registry
npx ts-node scripts/initialize-predicate-registry.ts

# Initialize counter
npx ts-node scripts/initialize-counter.ts

# Generate test keys (creates 1 authority + 3 attesters)
npx ts-node --transpile-only scripts/generate-test-keys.ts

# Initialize predicate registry (automatically uses test authority and registers attesters)
npx ts-node scripts/initialize-predicate-registry.ts

# Initialize counter (automatically uses test authority)
npx ts-node scripts/initialize-counter.ts

# Increment counter with predicate validation
npx ts-node scripts/increment-counter.ts
```

### Devnet Deployment

```bash
# Set cluster to devnet
solana config set --url devnet

# Set environment variables
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="~/.config/solana/id.json"

# Initialize predicate registry
npx ts-node scripts/initialize-predicate-registry.ts

# Initialize counter
npx ts-node scripts/initialize-counter.ts

# Generate test keys (creates 1 authority + 3 attesters)
npx ts-node --transpile-only scripts/generate-test-keys.ts

# Initialize predicate registry (automatically uses test authority and registers attesters)
npx ts-node scripts/initialize-predicate-registry.ts

# Initialize counter (automatically uses test authority)
npx ts-node scripts/initialize-counter.ts

# Increment counter with predicate validation
npx ts-node scripts/increment-counter.ts
```

### Mainnet Deployment

```bash
# Set cluster to mainnet
solana config set --url mainnet-beta

# Set environment variables
export ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com"
export ANCHOR_WALLET="~/.config/solana/id.json"

# Initialize predicate registry
npx ts-node scripts/initialize-predicate-registry.ts

# Initialize counter
npx ts-node scripts/initialize-counter.ts

# Generate test keys (creates 1 authority + 3 attesters)
npx ts-node --transpile-only scripts/generate-test-keys.ts

# Initialize predicate registry (automatically uses test authority and registers attesters)
npx ts-node scripts/initialize-predicate-registry.ts

# Initialize counter (automatically uses test authority)
npx ts-node scripts/initialize-counter.ts

# Increment counter with predicate validation
npx ts-node scripts/increment-counter.ts
```

## Script Features

### Error Handling
- Both scripts check for existing accounts to avoid duplicate initialization
- Comprehensive error messages for common issues
- Balance checks with warnings for low SOL amounts

### Safety Features
- Scripts are idempotent (safe to run multiple times)
- Verification of prerequisites before initialization
- Clear status messages and transaction signatures

### Output Information
- PDA addresses for all created accounts
- Transaction signatures for verification
- Account details and statistics
- Next steps guidance

## Troubleshooting

### Common Issues

1. **"Authority balance is low"** or **"Airdrop failed"**
   - Scripts automatically request airdrops on localnet/devnet
   - On mainnet, fund your wallet manually with SOL for transaction fees
   - If airdrop fails, use `solana airdrop 2` on devnet/testnet

2. **"Failed to load authority keypair"**
   - Check that `ANCHOR_WALLET` path is correct
   - Ensure the wallet file exists and is readable

3. **"Predicate registry is not initialized"**
   - Run `initialize-predicate-registry.ts` first
   - Verify the registry was deployed correctly

4. **"ATTESTER_PUBKEY environment variable is required"**
   - Set the attester public key: `export ATTESTER_PUBKEY=<public-key>`
   - Ensure the public key is valid base58 encoded format

5. **Connection errors**
   - Check `ANCHOR_PROVIDER_URL` is correct
   - Verify network connectivity to the Solana cluster

### Getting Help

- Check the transaction signature on a Solana explorer
- Review the program logs for detailed error information
- Ensure all programs are deployed to the correct cluster

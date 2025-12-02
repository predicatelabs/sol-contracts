# Deployment Guide

This guide explains how to deploy the programs and run scripts. All information needed for deployment is documented here.

## Prerequisites

1. **Solana CLI (Agave)** - Install using the Agave installer:
   ```bash
   sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
   ```
   Verify installation: `solana --version`
   For more details, see [Agave documentation](https://docs.anza.xyz/cli/install/)
2. **Rust** - Install from [rustup.rs](https://rustup.rs/)
   - This installs both Rust and Cargo (Rust's package manager)
   - Verify installation: `rustc --version` and `cargo --version`
3. **Anchor Framework** - Install with `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force && avm install latest && avm use latest`
4. **Node.js** - Version 18+ with npm/yarn

## Secrets & Keys (NOT in Source Control)

These files are required but **must not be committed** to git. They are excluded via `.gitignore`.

### 1. Program Keypairs (Required for Deployment)

**Location**: `target/deploy/`

- `predicate_registry-keypair.json` - Program keypair for predicate registry
- `counter-keypair.json` - Program keypair for counter program
- `demo_customer_stub-keypair.json` - Program keypair for demo customer stub program

**How Program IDs Work**:
- **Program IDs are hardcoded in the source code** via `declare_id!` macro in each program's `lib.rs`
- This makes builds deterministic - the same source code always produces the same program ID
- The program IDs in `Anchor.toml` must match the `declare_id!` values in the source code

**How Anchor Handles Keypairs**:
- Anchor needs a keypair file whose **public key matches** the program ID in `declare_id!`
- If the keypair file doesn't exist, Anchor will generate a new one, but **it won't match** the program ID in your code
- This causes a build error: program ID mismatch between `declare_id!` and the keypair


### 2. Deployment Wallet (Required for Deployment)

**Location**: `~/.config/solana/deployment-wallet.json` (default) or custom path

**How to Check Current Wallet**:
```bash
solana config get                    # Shows full config
solana address                       # Shows wallet address
```

**How to Set/Change Wallet**:
```bash
solana config set --keypair ~/path/to/wallet.json
```

**Requirements**:
- Must be funded with SOL (minimum 0.5 SOL for deployment, 1 SOL recommended)
- Must be the upgrade authority for programs you're deploying/upgrading
- For mainnet: Use a secure, backed-up wallet

### 3. Production Attester Keys (Optional - for Production)

**Location**: `scripts/secrets/mainnet/` (not committed)

Generate production attester keypairs for mainnet registration:
```bash
solana-keygen new -o scripts/secrets/mainnet/attester-1.json
# Repeat for additional attesters
```

## Environment Variables

All scripts support environment variables with basic defaults. These will likely need to be overridden to match your local setup.
### `ANCHOR_PROVIDER_URL` (Optional)

**Purpose**: Solana RPC endpoint (cluster URL)

**Defaults by Script**:
- `initialize-predicate-registry.ts`: `http://127.0.0.1:8899` (localnet)
- `initialize-counter.ts`: `http://127.0.0.1:8899` (localnet)
- `increment-counter.ts`: `http://127.0.0.1:8899` (localnet)
- `register-attester.ts`: `http://127.0.0.1:8899` (localnet)
- `set-customer-policy.ts`: `https://api.mainnet-beta.solana.com` (mainnet)
- `get-policy.ts`: `https://api.mainnet-beta.solana.com` (mainnet)

**Usage**:
```bash
export ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com"
# or inline:
ANCHOR_PROVIDER_URL="https://api.devnet.solana.com" npx ts-node scripts/set-customer-policy.ts ...
```

### `ANCHOR_WALLET` (Optional)

**Purpose**: Path to wallet keypair file for signing transactions

**Defaults**:
- Most scripts: `~/.config/solana/deployment-wallet.json`
- Test scripts (when `USE_TEST_KEYS=true`): `scripts/test-keys/authority.json`

**Usage**:
```bash
export ANCHOR_WALLET="~/path/to/wallet.json"
# or inline:
ANCHOR_WALLET="~/my-wallet.json" npx ts-node scripts/set-customer-policy.ts ...
```

**Important**: The wallet must be:
- The upgrade authority of the program (for `set-customer-policy.ts`)
- The registry authority (for `initialize-predicate-registry.ts`, `register-attester.ts`)
- Funded with sufficient SOL for transaction fees

### `ATTESTER_PUBKEY` (Required for `register-attester.ts`)

**Purpose**: Public key of attester to register

**Usage**:
```bash
export ATTESTER_PUBKEY="<attester-public-key>"
npx ts-node scripts/register-attester.ts
```

### `ATTESTER_WALLET` (Optional - for `increment-counter.ts`)

**Purpose**: Path to attester keypair file

**Default**: `scripts/test-keys/attester-1.json`

**Usage**:
```bash
export ATTESTER_WALLET="~/path/to/attester-keypair.json"
npx ts-node scripts/increment-counter.ts
```

### `USE_TEST_KEYS` (Optional)

**Purpose**: Enable/disable automatic test key features

**Default**: `true`

**Usage**:
```bash
export USE_TEST_KEYS=false  # Disable test key auto-features
```

## Deployment Workflows

### Devnet Deployment

```bash
# 1. Set Solana CLI to devnet
solana config set --url devnet

# 2. Ensure wallet is funded (request airdrop if needed)
solana airdrop 2

# 3. Build and deploy
anchor build
./scripts/deploy-devnet.sh

# 4. Initialize registry (set ANCHOR_PROVIDER_URL if needed)
ANCHOR_PROVIDER_URL="https://api.devnet.solana.com" \
npx ts-node scripts/initialize-predicate-registry.ts
```

### Mainnet Deployment

```bash
# 1. Set Solana CLI to mainnet (use QuickNode URL or default)
# Option A: Use QuickNode RPC URL
solana config set --url https://your-quicknode-url.solana-mainnet.quiknode.pro/your-api-key/

# Option B: Use default public RPC (slower, rate-limited)
solana config set --url mainnet-beta

# 2. Verify wallet balance (minimum 0.5 SOL, recommended 1 SOL)
solana balance

# 3. Ensure program keypairs exist (CRITICAL - don't generate new ones!)
ls target/deploy/predicate_registry-keypair.json
ls target/deploy/counter-keypair.json
ls target/deploy/demo_customer_stub-keypair.json

# 4. Build with verification
anchor build --verifiable

# 5. Deploy (includes safety checks)
./scripts/deploy-mainnet.sh

# 6. Initialize registry (use same RPC URL as Solana CLI config, or set explicitly)
# If using QuickNode, set ANCHOR_PROVIDER_URL to match your QuickNode URL
ANCHOR_PROVIDER_URL="https://your-quicknode-url.solana-mainnet.quiknode.pro/your-api-key/" \
npx ts-node scripts/initialize-predicate-registry.ts

# 7. Register production attesters
ATTESTER_PUBKEY="<production-attester-pubkey>" \
ANCHOR_PROVIDER_URL="https://your-quicknode-url.solana-mainnet.quiknode.pro/your-api-key/" \
npx ts-node scripts/register-attester.ts
```

## Script Usage

### Setting Customer Policy

**Purpose**: Set or update a policy ID for a customer program

**Authorization**: Wallet must be the **upgrade authority** of the customer program

**Usage**:
```bash
npx ts-node scripts/set-customer-policy.ts <customer-program-id> <policy-id>
```

**Example**:
```bash
ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com" \
npx ts-node scripts/set-customer-policy.ts \
  DNqiXmRMXgcGaqFJAegJT4EZd7e6b3S7mTpT3EsXMDdn \
  x-85a3419ef376840a
```

**Check Current Wallet**:
```bash
solana config get | grep "Keypair Path"
solana address
```

**Use Different Wallet**:
```bash
ANCHOR_WALLET="~/path/to/upgrade-authority-wallet.json" \
ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com" \
npx ts-node scripts/set-customer-policy.ts <program-id> <policy-id>
```

### Getting Policy Information

**Purpose**: Read-only query of policy for a program

**Usage**:
```bash
npx ts-node scripts/get-policy.ts <program-id>
```

**Example**:
```bash
ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com" \
npx ts-node scripts/get-policy.ts DNqiXmRMXgcGaqFJAegJT4EZd7e6b3S7mTpT3EsXMDdn
```

**Note**: No wallet needed (read-only operation)

### Other Scripts

See `scripts/README.md` for detailed documentation on:
- `initialize-predicate-registry.ts` - Initialize registry and register attesters
- `initialize-counter.ts` - Initialize counter program
- `register-attester.ts` - Register a single attester
- `increment-counter.ts` - Test predicate validation flow
- `generate-test-keys.ts` - Generate test keypairs

## Authorization Requirements

### Setting Policies (`set-customer-policy.ts`)
- **Requirement**: Wallet must be the **upgrade authority** of the customer program
- **Check**: `solana program show <program-id>` shows the upgrade authority
- **Note**: Upgrade authority can be a multisig account

### Registry Operations (`initialize-predicate-registry.ts`, `register-attester.ts`)
- **Requirement**: Wallet must be the registry authority
- **Note**: First initialization sets the authority to the signer

### Program Deployment
- **Requirement**: Wallet must have sufficient SOL and be configured as deployer
- **Check**: `solana config get` shows current wallet

## Troubleshooting

### "ANCHOR_PROVIDER_URL is not defined"
- Set the environment variable or use inline: `ANCHOR_PROVIDER_URL="..." command`
- Check script defaults - some default to localnet, others to mainnet

### "Failed to load authority keypair"
- Verify wallet file exists: `ls ~/.config/solana/deployment-wallet.json`
- Check path is correct (supports `~` expansion)
- Ensure file is readable and contains valid JSON keypair

### "Unauthorized" when setting policy
- Verify wallet is the upgrade authority: `solana program show <program-id>`
- If upgrade authority is a multisig, use multisig signing tools
- Ensure you're using the correct wallet: `solana address`

### "Insufficient balance"
- Check balance: `solana balance`
- Fund wallet: Send SOL or use `solana airdrop 2` (devnet/localnet only)
- Minimum 0.5 SOL for deployment, 1 SOL recommended

### Program keypairs not found
- For mainnet: Use existing keypairs (don't generate new ones)
- For devnet/localnet: Generate with `solana-keygen new -o target/deploy/<program>-keypair.json`
- Ensure keypairs match program IDs in `Anchor.toml`

## Security Notes

1. **Never commit secrets**: All keypairs and wallets are excluded via `.gitignore`
2. **Backup program keypairs**: Losing them means losing upgrade authority
3. **Use multisig for production**: Consider using a multisig account as upgrade authority
4. **Verify program IDs**: Ensure `Anchor.toml` program IDs match your keypair public keys
5. **Test on devnet first**: Always test deployments on devnet before mainnet

## Quick Reference

```bash
# Check current Solana config
solana config get
solana address

# Check program upgrade authority
solana program show <program-id>

# Set environment variables
export ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com"
export ANCHOR_WALLET="~/.config/solana/deployment-wallet.json"

# Deploy to mainnet
./scripts/deploy-mainnet.sh

# Set customer policy
npx ts-node scripts/set-customer-policy.ts <program-id> <policy-id>
```


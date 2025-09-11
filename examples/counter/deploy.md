# Counter Program Deployment Guide

This guide covers deploying the Counter program integrated with predicate-registry to different Solana networks.

## Prerequisites

Before deploying, ensure you have:

1. **Solana CLI** (v1.18+)
   ```bash
   solana --version
   ```

2. **Anchor CLI** (v0.31.1+)
   ```bash
   anchor --version
   ```

3. **Rust** and **Cargo**
   ```bash
   rustc --version
   cargo --version
   ```

4. **Sufficient SOL** for deployment fees
   - Local: Use `solana airdrop`
   - Devnet: Use faucet or `solana airdrop`
   - Mainnet: Purchase SOL

## Network Configuration

### Local Test Validator

**Start validator:**
```bash
solana-test-validator
```

**Configure CLI:**
```bash
solana config set --url localhost
solana config set --keypair ~/.config/solana/id.json
```

**Verify configuration:**
```bash
solana config get
# Should show localhost and your keypair path
```

### Devnet

**Configure CLI:**
```bash
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json
```

**Get test SOL:**
```bash
solana airdrop 2
```

### Mainnet (Production)

⚠️ **Warning**: Mainnet deployment costs real SOL and should only be done for production-ready code.

**Configure CLI:**
```bash
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/id.json
```

**Verify balance:**
```bash
solana balance
# Ensure sufficient SOL for deployment
```

## Deployment Steps

### Step 1: Build Programs

From the project root:

```bash
# Clean previous builds
anchor clean

# Build all programs  
anchor build

# Verify programs built successfully
ls -la target/deploy/
# Should show predicate_registry.so and counter.so
```

### Step 2: Update Program IDs (If Needed)

If this is your first deployment, you may need to update program IDs:

**Generate new program IDs:**
```bash
# For predicate registry (if not already deployed)
solana-keygen new -o target/deploy/predicate_registry-keypair.json
solana-keygen pubkey target/deploy/predicate_registry-keypair.json

# For counter program
solana-keygen new -o target/deploy/counter-keypair.json  
solana-keygen pubkey target/deploy/counter-keypair.json
```

**Update Anchor.toml:**
Update the program IDs in `Anchor.toml` with the generated public keys:

```toml
[programs.localnet]
predicate_registry = "YOUR_PREDICATE_REGISTRY_PROGRAM_ID"
counter = "YOUR_COUNTER_PROGRAM_ID"

[programs.devnet] 
predicate_registry = "YOUR_PREDICATE_REGISTRY_PROGRAM_ID"
counter = "YOUR_COUNTER_PROGRAM_ID"
```

**Update lib.rs files:**
Update the `declare_id!` macros in both programs:

```rust
// In programs/predicate_registry/src/lib.rs
declare_id!("YOUR_PREDICATE_REGISTRY_PROGRAM_ID");

// In programs/counter/src/lib.rs  
declare_id!("YOUR_COUNTER_PROGRAM_ID");
```

**Rebuild after ID changes:**
```bash
anchor build
```

### Step 3: Deploy Programs

**Deploy both programs:**
```bash
anchor deploy
```

**Or deploy individually:**
```bash
# Deploy predicate registry first (counter depends on it)
solana program deploy target/deploy/predicate_registry.so

# Deploy counter program
solana program deploy target/deploy/counter.so
```

**Verify deployment:**
```bash
solana program show YOUR_PREDICATE_REGISTRY_PROGRAM_ID
solana program show YOUR_COUNTER_PROGRAM_ID
```

### Step 4: Initialize Registry

After deployment, initialize the predicate registry:

```bash
# Using the client script
cd examples/counter
npx ts-node client.ts
```

Or create a simple initialization script:

```typescript
// initialize-registry.ts
import * as anchor from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";

async function initialize() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.PredicateRegistry;
  const authority = provider.wallet.publicKey;
  
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    program.programId
  );
  
  const tx = await program.methods
    .initialize()
    .accounts({
      registry: registryPda,
      authority: authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
    
  console.log("Registry initialized:", tx);
}

initialize().catch(console.error);
```

## Verification

### Test Deployment

After deployment, verify everything works:

1. **Run client example:**
   ```bash
   cd examples/counter
   npx ts-node client.ts
   ```

2. **Expected output:**
   ```
   ✅ Programs loaded
   ✅ Test accounts created
   ✅ Registry initialized  
   ✅ Counter incremented successfully
   ```

3. **Check transaction logs:**
   ```bash
   solana logs YOUR_TRANSACTION_SIGNATURE
   ```

### Program Account Verification

**Check program accounts:**
```bash
# Verify program data
solana account YOUR_PROGRAM_ID

# Check program metadata
solana program show YOUR_PROGRAM_ID --lamports
```

## Upgrading Programs

Solana programs are upgradeable if deployed correctly:

### Upgrade Process

1. **Make code changes**
2. **Rebuild program:**
   ```bash
   anchor build
   ```

3. **Upgrade deployment:**
   ```bash
   solana program deploy target/deploy/counter.so --upgrade-authority ~/.config/solana/id.json
   ```

4. **Verify upgrade:**
   ```bash
   solana program show YOUR_PROGRAM_ID
   # Check "Last Deploy Slot" has updated
   ```

### Upgrade Authority Management

**Set upgrade authority:**
```bash
solana program set-upgrade-authority YOUR_PROGRAM_ID NEW_AUTHORITY_PUBKEY
```

**Make program immutable (permanent):**
```bash
solana program set-upgrade-authority YOUR_PROGRAM_ID --final
```

⚠️ **Warning**: Making a program immutable is irreversible!

## Network-Specific Considerations

### Local Development

- **Fast iteration**: Programs deploy quickly
- **Free testing**: No real SOL cost
- **Isolated environment**: No external dependencies

**Recommended for:**
- Development and testing
- Integration testing
- CI/CD pipelines

### Devnet

- **Realistic environment**: Similar to mainnet
- **Free SOL**: Available through faucets
- **Public access**: Others can interact with your programs

**Recommended for:**
- Pre-production testing
- Public betas
- Demonstration deployments

### Mainnet

- **Production environment**: Real users and real SOL
- **Deployment costs**: ~0.5-2 SOL per program
- **Permanent storage**: High availability and reliability

**Recommended for:**
- Production releases
- Live applications
- Revenue-generating programs

## Security Checklist

Before mainnet deployment:

- [ ] **Code audited** by security professionals
- [ ] **Comprehensive testing** completed
- [ ] **Access controls** properly implemented
- [ ] **Upgrade authority** secured or removed
- [ ] **Emergency procedures** established
- [ ] **Monitoring** systems in place

## Troubleshooting

### Common Deployment Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Insufficient funds" | Not enough SOL | Add more SOL to deployer account |
| "Program already exists" | Program ID conflict | Generate new program ID |
| "Invalid program data" | Build issue | Clean and rebuild programs |
| "Account not found" | Wrong network | Check solana config get |

### Debug Commands

**Check account balance:**
```bash
solana balance
```

**View recent transactions:**
```bash
solana transaction-history --limit 5
```

**Check program logs:**
```bash
solana logs YOUR_PROGRAM_ID
```

**Validate program binary:**
```bash
solana program dump YOUR_PROGRAM_ID program.so
```

## Cost Estimation

### Deployment Costs (approximate)

| Network | Per Program | Registry Init | Total |
|---------|-------------|---------------|-------|
| **Local** | Free | Free | Free |
| **Devnet** | Free | Free | Free |
| **Mainnet** | ~0.5-2 SOL | ~0.01 SOL | ~1-4 SOL |

### Ongoing Costs

- **Account rent**: Programs pay rent unless rent-exempt
- **Transaction fees**: ~0.000005 SOL per transaction
- **CPI calls**: Additional compute units

## Monitoring

After deployment, monitor your programs:

1. **Transaction volume**: Track usage patterns
2. **Error rates**: Monitor failed transactions  
3. **Account growth**: Watch account storage usage
4. **Network health**: Monitor Solana network status

**Useful tools:**
- [Solana Explorer](https://explorer.solana.com/)
- [Solscan](https://solscan.io/)
- [Step Finance](https://step.finance/)

## Support

For deployment issues:

1. **Check logs** first using `solana logs`
2. **Search documentation** and GitHub issues
3. **Ask on Discord**: Solana/Anchor community channels
4. **File issues**: On relevant GitHub repositories

## Next Steps

After successful deployment:

1. **Document your deployment** (program IDs, network, etc.)
2. **Set up monitoring** and alerting
3. **Plan upgrade strategy** if needed
4. **Share with users** and gather feedback
5. **Consider security audit** for mainnet deployments
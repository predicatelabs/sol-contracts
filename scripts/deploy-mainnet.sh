#!/bin/bash

echo "🚀 Deploying Predicate Registry to MAINNET"
echo "==========================================="
echo ""
echo "⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️"
echo "This will deploy to MAINNET-BETA using REAL SOL!"
echo "Ensure you have thoroughly tested on devnet first."
echo ""

# Exit on error
set -e

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI is not installed. Please install it first."
    exit 1
fi

# Check if Anchor CLI is installed
if ! command -v anchor &> /dev/null; then
    echo "❌ Anchor CLI is not installed. Please install it first."
    exit 1
fi

# Set cluster to mainnet
echo "🔧 Setting Solana cluster to mainnet-beta..."
solana config set --url mainnet-beta

# Display current configuration
echo ""
echo "📋 Current Configuration:"
WALLET=$(solana config get | grep "Keypair Path" | awk '{print $3}')
echo "   Wallet: $WALLET"
WALLET_PUBKEY=$(solana address)
echo "   Address: $WALLET_PUBKEY"
echo "   Cluster: mainnet-beta"
echo ""

# Check wallet balance
echo "💰 Checking wallet balance..."
BALANCE=$(solana balance --lamports)
MIN_BALANCE=500000000  # 0.5 SOL in lamports (deployment costs ~0.2-0.3 SOL)
RECOMMENDED_BALANCE=1000000000  # 1 SOL recommended for safety

echo "   Current balance: $(echo "scale=4; $BALANCE / 1000000000" | bc) SOL"
echo "   Minimum required: 0.5 SOL"
echo "   Recommended: 1.0 SOL"

if [ "$BALANCE" -lt "$MIN_BALANCE" ]; then
    echo ""
    echo "❌ Insufficient balance for deployment!"
    echo "   Please fund your wallet with at least 0.5 SOL (1.0 SOL recommended)"
    echo "   Send SOL to: $WALLET_PUBKEY"
    exit 1
fi

if [ "$BALANCE" -lt "$RECOMMENDED_BALANCE" ]; then
    echo ""
    echo "⚠️  Balance is below recommended amount (1.0 SOL)"
    echo "   Deployment may fail if balance is insufficient."
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled."
        exit 0
    fi
fi

# Check for program keypairs
echo ""
echo "🔑 Checking program keypairs..."
if [ ! -f "target/deploy/predicate_registry-keypair.json" ]; then
    echo "   ❌ predicate_registry-keypair.json not found!"
    echo "   You must have existing program keypairs for mainnet deployment."
    echo "   Generate them with: solana-keygen new -o target/deploy/predicate_registry-keypair.json"
    exit 1
fi

if [ ! -f "target/deploy/counter-keypair.json" ]; then
    echo "   ❌ counter-keypair.json not found!"
    echo "   You must have existing program keypairs for mainnet deployment."
    echo "   Generate them with: solana-keygen new -o target/deploy/counter-keypair.json"
    exit 1
fi

echo "   ✅ Program keypairs found"

# Build the program
echo ""
echo "🔨 Building programs (release mode)..."
anchor build --verifiable

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Display program IDs
echo ""
echo "📝 Program IDs to be deployed:"
PREDICATE_ID=$(solana-keygen pubkey target/deploy/predicate_registry-keypair.json)
COUNTER_ID=$(solana-keygen pubkey target/deploy/counter-keypair.json)
echo "   Predicate Registry: $PREDICATE_ID"
echo "   Counter: $COUNTER_ID"

# Check if programs already exist on mainnet
echo ""
echo "🔍 Checking if programs already exist on mainnet..."
PREDICATE_EXISTS=$(solana account $PREDICATE_ID --output json 2>/dev/null | jq -r '.lamports // 0')
COUNTER_EXISTS=$(solana account $COUNTER_ID --output json 2>/dev/null | jq -r '.lamports // 0')

if [ "$PREDICATE_EXISTS" != "0" ]; then
    echo "   ⚠️  Predicate Registry program already exists on mainnet!"
    echo "   This will be an UPGRADE, not a fresh deployment."
    
    # Check upgrade authority
    UPGRADE_AUTH=$(solana program show $PREDICATE_ID --output json 2>/dev/null | jq -r '.authority')
    echo "   Current upgrade authority: $UPGRADE_AUTH"
    
    if [ "$UPGRADE_AUTH" != "$WALLET_PUBKEY" ]; then
        echo "   ❌ ERROR: You are not the upgrade authority for this program!"
        echo "   Your address: $WALLET_PUBKEY"
        exit 1
    fi
fi

if [ "$COUNTER_EXISTS" != "0" ]; then
    echo "   ⚠️  Counter program already exists on mainnet!"
    echo "   This will be an UPGRADE, not a fresh deployment."
    
    # Check upgrade authority
    UPGRADE_AUTH=$(solana program show $COUNTER_ID --output json 2>/dev/null | jq -r '.authority')
    echo "   Current upgrade authority: $UPGRADE_AUTH"
    
    if [ "$UPGRADE_AUTH" != "$WALLET_PUBKEY" ]; then
        echo "   ❌ ERROR: You are not the upgrade authority for this program!"
        echo "   Your address: $WALLET_PUBKEY"
        exit 1
    fi
fi

# Estimate deployment cost
echo ""
echo "💸 Estimating deployment cost..."
PREDICATE_SIZE=$(wc -c < target/deploy/predicate_registry.so)
COUNTER_SIZE=$(wc -c < target/deploy/counter.so)
PREDICATE_COST=$(echo "scale=4; ($PREDICATE_SIZE * 2) / 1000000000" | bc)
COUNTER_COST=$(echo "scale=4; ($COUNTER_SIZE * 2) / 1000000000" | bc)
TOTAL_COST=$(echo "scale=4; $PREDICATE_COST + $COUNTER_COST + 0.1" | bc)

echo "   Predicate Registry size: $(numfmt --to=iec-i --suffix=B $PREDICATE_SIZE)"
echo "   Counter size: $(numfmt --to=iec-i --suffix=B $COUNTER_SIZE)"
echo "   Estimated cost: ~$TOTAL_COST SOL"

# Security checklist
echo ""
echo "🔒 Security Checklist:"
echo "   [ ] Programs have been audited"
echo "   [ ] Programs have been tested on devnet"
echo "   [ ] Program IDs are correct and match Anchor.toml"
echo "   [ ] Upgrade authority is set correctly"
echo "   [ ] You have a plan to initialize the registry"
echo "   [ ] You have backed up all keypairs"
echo ""

# Final confirmation
echo "⚠️  FINAL CONFIRMATION ⚠️"
echo ""
echo "You are about to deploy to MAINNET-BETA with the following:"
echo "   Cluster: mainnet-beta"
echo "   Deploy wallet: $WALLET_PUBKEY"
echo "   Predicate Registry: $PREDICATE_ID"
echo "   Counter: $COUNTER_ID"
echo "   Estimated cost: ~$TOTAL_COST SOL"
echo ""
read -p "Type 'DEPLOY' (all caps) to proceed: " CONFIRM

if [ "$CONFIRM" != "DEPLOY" ]; then
    echo "❌ Deployment cancelled."
    exit 0
fi

# Double confirmation
echo ""
read -p "Are you absolutely sure? This uses REAL SOL. (yes/no): " DOUBLE_CONFIRM

if [ "$DOUBLE_CONFIRM" != "yes" ]; then
    echo "❌ Deployment cancelled."
    exit 0
fi

# Deploy the programs
echo ""
echo "🚀 Deploying to mainnet-beta..."
echo "   This may take several minutes..."
echo ""

anchor deploy --provider.cluster mainnet-beta

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "   Cluster: mainnet-beta"
    echo "   Predicate Registry: $PREDICATE_ID"
    echo "   Counter: $COUNTER_ID"
    echo "   Deploy Authority: $WALLET_PUBKEY"
    echo ""
    echo "🔗 Explorer Links:"
    echo "   Predicate Registry: https://explorer.solana.com/address/$PREDICATE_ID"
    echo "   Counter: https://explorer.solana.com/address/$COUNTER_ID"
    echo ""
    echo "🔒 Security Recommendations:"
    echo "   1. Verify the deployment: solana program show $PREDICATE_ID"
    echo "   2. Consider using a multisig for upgrade authority"
    echo "   3. Set upgrade authority to immutable when ready: solana program set-upgrade-authority $PREDICATE_ID --final"
    echo ""
    echo "🧪 Next Steps:"
    echo "   1. Initialize the registry with production authority"
    echo "   2. Register production attesters"
    echo "   3. Monitor the programs closely for the first few hours"
    echo ""
    echo "⚠️  IMPORTANT: Back up your program keypairs and upgrade authority!"
else
    echo "❌ Deployment failed!"
    echo ""
    echo "Common issues:"
    echo "   - Insufficient balance"
    echo "   - Network connectivity issues"
    echo "   - Program account already exists without upgrade authority"
    echo ""
    echo "Check logs above for specific error details."
    exit 1
fi


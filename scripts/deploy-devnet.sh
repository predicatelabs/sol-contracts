#!/bin/bash

echo "🚀 Deploying Predicate Registry Program to Devnet"
echo "================================================="

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

# Set cluster to devnet
echo "🔧 Setting Solana cluster to devnet..."
solana config set --url devnet

# Check wallet balance
echo "💰 Checking wallet balance..."
BALANCE=$(solana balance --lamports)
MIN_BALANCE=100000000  # 0.1 SOL in lamports

if [ "$BALANCE" -lt "$MIN_BALANCE" ]; then
    echo "⚠️  Low balance detected. Requesting airdrop..."
    solana airdrop 2
    echo "⏱️  Waiting for airdrop to confirm..."
    sleep 10
fi

# Build the program
echo "🔨 Building the program..."
anchor build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Deploy the program
echo "🚀 Deploying to devnet..."
anchor deploy --provider.cluster devnet

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "Program deployed to devnet!"
    echo "You can now run tests with: anchor test --provider.cluster devnet"
else
    echo "❌ Deployment failed!"
    exit 1
fi

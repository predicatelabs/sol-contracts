// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../target/types/predicate_registry";

module.exports = async function (provider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  console.log("Deploying Predicate Registry program...");
  
  const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  
  // Get the program ID
  const programId = program.programId;
  console.log(`Program ID: ${programId.toString()}`);
  
  // Get current cluster
  const cluster = provider.connection.rpcEndpoint;
  console.log(`Deploying to cluster: ${cluster}`);
  
  // Check if we have enough SOL for deployment
  const balance = await provider.connection.getBalance(provider.wallet.publicKey);
  console.log(`Wallet balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  
  if (balance < 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
    console.warn("⚠️  Low wallet balance. You may need more SOL for deployment.");
    
    // If on devnet, suggest airdrop
    if (cluster.includes("devnet")) {
      console.log("💡 For devnet, you can request an airdrop:");
      console.log("   solana airdrop 2");
    }
  }
  
  console.log("✅ Predicate Registry program deployment configuration complete!");
  console.log("\nNext steps:");
  console.log("1. Run 'anchor build' to compile the program");
  console.log("2. Run 'anchor deploy' to deploy to the configured cluster");
  console.log("3. Run 'anchor test' to run the test suite");
};
#!/usr/bin/env ts-node

/**
 * Increment Counter Script
 * 
 * This script demonstrates the predicate validation flow by incrementing a counter
 * with attestation validation. It will:
 * 
 * 1. Load the counter owner keypair (defaults to test authority)
 * 2. Load an attestor keypair (defaults to attestor-1)
 * 3. Create a task for the increment operation
 * 4. Sign the task with the attestor
 * 5. Execute the increment with predicate validation
 * 6. Display the updated counter value
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  Keypair, 
  PublicKey, 
  SystemProgram,
  TransactionInstruction,
  Transaction,
  Ed25519Program,
  Connection
} from "@solana/web3.js";
import { PredicateRegistry } from "../target/types/predicate_registry";
import { Counter } from "../target/types/counter";
import * as crypto from "crypto";
import * as nacl from "tweetnacl";
import * as fs from "fs";
import * as path from "path";

// Configuration
const CLUSTER_URL = process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899";
const OWNER_WALLET_PATH = process.env.ANCHOR_WALLET || path.join(__dirname, "test-keys", "authority.json");
const ATTESTOR_WALLET_PATH = process.env.ATTESTOR_WALLET || path.join(__dirname, "test-keys", "attestor-1.json");
const USE_TEST_KEYS = process.env.USE_TEST_KEYS !== "false"; // Default to true
const DEFAULT_POLICY = "counter-increment-policy-v1";

interface IncrementResult {
  counterPda: PublicKey;
  owner: PublicKey;
  attestor: PublicKey;
  oldValue: number;
  newValue: number;
  transactionSignature: string;
}

/**
 * Load a keypair from file with airdrop support
 */
async function loadKeypair(walletPath: string, connection: Connection, keyType: string): Promise<Keypair> {
  // Handle tilde expansion
  if (walletPath.startsWith("~/")) {
    walletPath = path.join(process.env.HOME || "", walletPath.slice(2));
  }
  
  // Check if using test keys
  const isUsingTestKeys = walletPath.includes("test-keys");
  
  let keypair: Keypair;
  try {
    const keypairData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    if (isUsingTestKeys) {
      console.log(`🔑 Using test ${keyType} key from ${path.basename(walletPath)}`);
      console.log("⚠️  This is for development/testing only!");
    }
  } catch (error) {
    if (isUsingTestKeys) {
      throw new Error(
        `Failed to load test ${keyType} keypair from ${walletPath}. ` +
        `Please run 'npx ts-node --transpile-only scripts/generate-test-keys.ts' first.`
      );
    }
    throw new Error(`Failed to load ${keyType} keypair from ${walletPath}: ${error}`);
  }
  
  // Check balance and request airdrop if needed (for owner only)
  if (keyType === "owner") {
    const balance = await connection.getBalance(keypair.publicKey);
    const minBalance = 0.1 * anchor.web3.LAMPORTS_PER_SOL; // 0.1 SOL minimum
    
    console.log(`💰 ${keyType} balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    
    if (balance < minBalance) {
      console.log("💸 Balance is low, requesting airdrop...");
      
      try {
        // Check if we're on a network that supports airdrops
        const isLocalOrDevnet = CLUSTER_URL.includes("127.0.0.1") || 
                               CLUSTER_URL.includes("localhost") || 
                               CLUSTER_URL.includes("devnet");
        
        if (isLocalOrDevnet) {
          const signature = await connection.requestAirdrop(
            keypair.publicKey,
            2 * anchor.web3.LAMPORTS_PER_SOL // Request 2 SOL
          );
          
          console.log(`   Airdrop requested: ${signature}`);
          console.log("   Waiting for confirmation...");
          
          await connection.confirmTransaction(signature);
          
          const newBalance = await connection.getBalance(keypair.publicKey);
          console.log(`✅ Airdrop successful! New balance: ${newBalance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
        } else {
          console.log("⚠️  Cannot request airdrop on this network. Please fund the account manually.");
          console.log(`   Account: ${keypair.publicKey.toString()}`);
          console.log(`   Required: At least ${minBalance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
        }
      } catch (error) {
        console.log(`⚠️  Airdrop failed: ${error}`);
        console.log("   Continuing with current balance...");
      }
    }
  }
  
  return keypair;
}

/**
 * Setup program clients and provider
 */
async function setupClients(): Promise<{
  predicateProgram: Program<PredicateRegistry>;
  counterProgram: Program<Counter>;
  provider: anchor.AnchorProvider;
  owner: Keypair;
  attestor: Keypair;
}> {
  // Setup connection first
  const connection = new Connection(CLUSTER_URL, "confirmed");
  
  // Load keypairs
  const owner = await loadKeypair(OWNER_WALLET_PATH, connection, "owner");
  const attestor = await loadKeypair(ATTESTOR_WALLET_PATH, connection, "attestor");
  
  // Setup provider
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load programs
  const predicateProgram = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  const counterProgram = anchor.workspace.Counter as Program<Counter>;

  console.log("✅ Clients setup complete:");
  console.log(`   Cluster: ${CLUSTER_URL}`);
  console.log(`   Predicate Registry: ${predicateProgram.programId.toString()}`);
  console.log(`   Counter Program: ${counterProgram.programId.toString()}`);
  console.log(`   Owner: ${owner.publicKey.toString()}`);
  console.log(`   Attestor: ${attestor.publicKey.toString()}`);

  return { predicateProgram, counterProgram, provider, owner, attestor };
}

/**
 * Find all required PDAs
 */
function findPDAs(
  predicateProgram: Program<PredicateRegistry>,
  counterProgram: Program<Counter>,
  owner: PublicKey,
  attestor: PublicKey
): {
  registryPda: PublicKey;
  counterPda: PublicKey;
  attestorPda: PublicKey;
  policyPda: PublicKey;
} {
  // Registry PDA
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    predicateProgram.programId
  );

  // Counter PDA
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), owner.toBuffer()],
    counterProgram.programId
  );

  // Attestor PDA
  const [attestorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("attestor"), attestor.toBuffer()],
    predicateProgram.programId
  );

  // Policy PDA
  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), owner.toBuffer()],
    predicateProgram.programId
  );

  console.log("📍 PDAs calculated:");
  console.log(`   Registry: ${registryPda.toString()}`);
  console.log(`   Counter: ${counterPda.toString()}`);
  console.log(`   Attestor: ${attestorPda.toString()}`);
  console.log(`   Policy: ${policyPda.toString()}`);

  return { registryPda, counterPda, attestorPda, policyPda };
}

/**
 * Get current counter value
 */
async function getCounterValue(
  counterProgram: Program<Counter>,
  counterPda: PublicKey
): Promise<number> {
  try {
    const counterAccount = await counterProgram.account.counterAccount.fetch(counterPda);
    return counterAccount.value.toNumber();
  } catch (error) {
    throw new Error(`Counter not found. Please run initialize-counter.ts first.`);
  }
}

/**
 * Create a task for counter increment operation
 */
function createIncrementTask(owner: PublicKey, counterProgram: Program<Counter>): any {
  const uuid = crypto.randomBytes(16);
  const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  
  // Create policy buffer with exact length needed (200 bytes)
  const policyBuffer = Buffer.alloc(200);
  Buffer.from(DEFAULT_POLICY, "utf8").copy(policyBuffer);
  
  // Encode increment function signature
  const encodedSigAndArgs = Buffer.from("increment()");
  
  return {
    uuid: Array.from(uuid),
    msgSender: owner,
    target: counterProgram.programId,
    msgValue: new anchor.BN(0), // No SOL value for increment
    encodedSigAndArgs: Array.from(encodedSigAndArgs),
    policy: Array.from(policyBuffer),
    expiration: new anchor.BN(expiration),
  };
}

/**
 * Create message hash for task (matching Rust implementation)
 */
function createMessageHash(task: any, validatorPubkey: PublicKey): Buffer {
  // Get policy data - trim null bytes like get_policy() in Rust
  const policyData = Buffer.from(task.policy);
  const policyEnd = policyData.indexOf(0);
  const trimmedPolicy = policyEnd === -1 ? policyData : policyData.subarray(0, policyEnd);
  
  const data = Buffer.concat([
    Buffer.from(task.uuid),
    task.msgSender.toBuffer(),
    validatorPubkey.toBuffer(), // validator key (counter program as validator)
    Buffer.from(task.msgValue.toBuffer("le", 8)),
    Buffer.from(task.encodedSigAndArgs),
    trimmedPolicy,
    Buffer.from(task.expiration.toBuffer("le", 8)),
  ]);

  // Hash the data using SHA-256 (Solana's hash function)
  return crypto.createHash("sha256").update(data).digest();
}

/**
 * Create Ed25519 signature for attestation
 */
function createSignature(task: any, attestorKeypair: Keypair, validatorPubkey: PublicKey): Uint8Array {
  const messageHash = createMessageHash(task, validatorPubkey);
  
  // Sign with Ed25519 using NaCl/TweetNaCl
  const signature = nacl.sign.detached(messageHash, attestorKeypair.secretKey);
  return signature;
}

/**
 * Create attestation for the task
 */
function createAttestation(uuid: Uint8Array, attestorKeypair: Keypair, expiration: number, signature: Uint8Array): any {
  return {
    uuid: Array.from(uuid),
    attestor: attestorKeypair.publicKey,
    signature: Array.from(signature),
    expiration: new anchor.BN(expiration),
  };
}

/**
 * Increment counter with predicate validation
 */
async function incrementCounter(
  provider: anchor.AnchorProvider,
  counterProgram: Program<Counter>,
  predicateProgram: Program<PredicateRegistry>,
  owner: Keypair,
  attestor: Keypair,
  pdas: {
    registryPda: PublicKey;
    counterPda: PublicKey;
    attestorPda: PublicKey;
    policyPda: PublicKey;
  }
): Promise<IncrementResult> {
  console.log("📝 Preparing counter increment with attestation validation...");

  // Get current counter value
  const oldValue = await getCounterValue(counterProgram, pdas.counterPda);
  console.log(`   Current counter value: ${oldValue}`);

  // Create task for increment operation
  const task = createIncrementTask(owner.publicKey, counterProgram);
  
  // Create signature - use counter PDA as validator (acts as the validator in this context)
  const signature = createSignature(task, attestor, pdas.counterPda);
  
  // Create attestation
  const attestation = createAttestation(
    Buffer.from(task.uuid), 
    attestor, 
    task.expiration.toNumber(), 
    signature
  );

  // Create message hash for Ed25519 verification instruction
  const messageHash = createMessageHash(task, pdas.counterPda);

  // Create Ed25519 verification instruction
  const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
    publicKey: attestor.publicKey.toBytes(),
    message: messageHash,
    signature: signature,
  });

  // Create the increment instruction
  const incrementInstruction = await counterProgram.methods
    .increment(task, attestor.publicKey, attestation)
    .accounts({
      counter: pdas.counterPda,
      predicateRegistry: pdas.registryPda,
      attestorAccount: pdas.attestorPda,
      policyAccount: pdas.policyPda,
      instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      predicateRegistryProgram: predicateProgram.programId,
    } as any)
    .instruction();

  // Create transaction with both instructions
  const transaction = new Transaction();
  transaction.add(ed25519Instruction);
  transaction.add(incrementInstruction);

  console.log("🚀 Sending increment transaction...");

  // Send transaction (owner signs as they're the one calling increment)
  const tx = await provider.sendAndConfirm(transaction, [owner]);

  // Get new counter value
  const newValue = await getCounterValue(counterProgram, pdas.counterPda);
  console.log(`✅ Counter incremented successfully!`);
  console.log(`   Transaction: ${tx}`);
  console.log(`   Value changed: ${oldValue} → ${newValue}`);

  return {
    counterPda: pdas.counterPda,
    owner: owner.publicKey,
    attestor: attestor.publicKey,
    oldValue,
    newValue,
    transactionSignature: tx,
  };
}

/**
 * Verify prerequisites
 */
async function verifyPrerequisites(
  predicateProgram: Program<PredicateRegistry>,
  counterProgram: Program<Counter>,
  pdas: {
    registryPda: PublicKey;
    counterPda: PublicKey;
    attestorPda: PublicKey;
    policyPda: PublicKey;
  }
): Promise<void> {
  console.log("🔍 Verifying prerequisites...");

  // Check if predicate registry exists
  try {
    await predicateProgram.account.predicateRegistry.fetch(pdas.registryPda);
    console.log("✅ Predicate registry is initialized");
  } catch (error) {
    throw new Error("Predicate registry not found. Please run initialize-predicate-registry.ts first.");
  }

  // Check if counter exists
  try {
    await counterProgram.account.counterAccount.fetch(pdas.counterPda);
    console.log("✅ Counter is initialized");
  } catch (error) {
    throw new Error("Counter not found. Please run initialize-counter.ts first.");
  }

  // Check if attestor is registered
  try {
    const attestorAccount = await predicateProgram.account.attestorAccount.fetch(pdas.attestorPda);
    if (attestorAccount.isRegistered) {
      console.log("✅ Attestor is registered");
    } else {
      throw new Error("Attestor is not registered");
    }
  } catch (error) {
    throw new Error("Attestor not registered. Please run initialize-predicate-registry.ts first.");
  }

  // Check if policy exists
  try {
    await predicateProgram.account.policyAccount.fetch(pdas.policyPda);
    console.log("✅ Policy is set");
  } catch (error) {
    throw new Error("Policy not found. Please run initialize-counter.ts first.");
  }
}

/**
 * Main execution function
 */
async function main(): Promise<IncrementResult> {
  console.log("🚀 Counter Increment Script");
  console.log("=" .repeat(50));

  try {
    // Setup clients
    const { predicateProgram, counterProgram, provider, owner, attestor } = await setupClients();

    // Find PDAs
    const pdas = findPDAs(predicateProgram, counterProgram, owner.publicKey, attestor.publicKey);

    // Verify prerequisites
    await verifyPrerequisites(predicateProgram, counterProgram, pdas);

    console.log("\n" + "=" .repeat(50));
    console.log("🔢 Incrementing Counter with Predicate Validation");

    // Increment counter with attestation
    const result = await incrementCounter(provider, counterProgram, predicateProgram, owner, attestor, pdas);

    console.log("\n" + "=" .repeat(50));
    console.log("✅ Counter increment completed successfully!");
    console.log(`\n📊 Summary:`);
    console.log(`   Counter PDA: ${result.counterPda.toString()}`);
    console.log(`   Owner: ${result.owner.toString()}`);
    console.log(`   Attestor: ${result.attestor.toString()}`);
    console.log(`   Value Change: ${result.oldValue} → ${result.newValue}`);
    console.log(`   Transaction: ${result.transactionSignature}`);
    console.log(`\n🎉 Predicate validation was successfully used to protect the increment operation!`);

    return result;

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}

export { main as incrementCounter, IncrementResult };

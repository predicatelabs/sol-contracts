#!/usr/bin/env ts-node

/**
 * Counter Program Client Example
 * 
 * This script demonstrates how to interact with the Counter program that is
 * integrated with the predicate-registry for validation. It shows:
 * 
 * 1. Setting up program clients
 * 2. Initializing a counter with predicate integration
 * 3. Creating and signing tasks for increment operations
 * 4. Performing protected increment operations with attestation validation
 * 
 * Based on the inheritance pattern from Solidity examples where business logic
 * is directly protected by predicate validation.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  Keypair, 
  PublicKey, 
  SystemProgram,
  TransactionInstruction,
  Transaction,
  Ed25519Program 
} from "@solana/web3.js";
import { PredicateRegistry } from "../../target/types/predicate_registry";
import { Counter } from "../../target/types/counter";
import * as crypto from "crypto";
import * as nacl from "tweetnacl";

// Configuration
const CLUSTER_URL = "http://127.0.0.1:8899"; // Local testnet
const TEST_POLICY = "counter-increment-policy-v1";

interface ProgramClients {
  provider: anchor.AnchorProvider;
  predicateProgram: Program<PredicateRegistry>;
  counterProgram: Program<Counter>;
}

interface TestAccounts {
  authority: Keypair;
  owner: Keypair;
  attestor: Keypair;
}

interface PDAs {
  registryPda: PublicKey;
  registryBump: number;
  counterPda: PublicKey;
  counterBump: number;
  attestorPda: PublicKey;
  attestorBump: number;
  policyPda: PublicKey;
  policyBump: number;
}

/**
 * Setup program clients and provider
 */
async function setupClients(): Promise<ProgramClients> {
  // Setup provider
  const connection = new anchor.web3.Connection(CLUSTER_URL, "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load programs
  const predicateProgram = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  const counterProgram = anchor.workspace.Counter as Program<Counter>;

  console.log("✅ Programs loaded:");
  console.log(`   Predicate Registry: ${predicateProgram.programId.toString()}`);
  console.log(`   Counter: ${counterProgram.programId.toString()}`);

  return {
    provider,
    predicateProgram,
    counterProgram,
  };
}

/**
 * Setup test accounts and fund them
 */
async function setupAccounts(provider: anchor.AnchorProvider): Promise<TestAccounts> {
  const authority = Keypair.generate();
  const owner = Keypair.generate();
  const attestor = Keypair.generate();

  // Airdrop SOL to all accounts
  const accounts = [authority, owner, attestor];
  for (const account of accounts) {
    const signature = await provider.connection.requestAirdrop(
      account.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
  }

  console.log("✅ Test accounts created and funded:");
  console.log(`   Authority: ${authority.publicKey.toString()}`);
  console.log(`   Owner: ${owner.publicKey.toString()}`);
  console.log(`   Attestor: ${attestor.publicKey.toString()}`);

  return { authority, owner, attestor };
}

/**
 * Find all required PDAs
 */
function findPDAs(
  predicateProgram: Program<PredicateRegistry>,
  counterProgram: Program<Counter>,
  owner: PublicKey,
  attestor: PublicKey
): PDAs {
  // Registry PDA
  const [registryPda, registryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    predicateProgram.programId
  );

  // Counter PDA
  const [counterPda, counterBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), owner.toBuffer()],
    counterProgram.programId
  );

  // Attestor PDA
  const [attestorPda, attestorBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("attestor"), attestor.toBuffer()],
    predicateProgram.programId
  );

  // Policy PDA
  const [policyPda, policyBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), owner.toBuffer()],
    predicateProgram.programId
  );

  console.log("✅ PDAs calculated:");
  console.log(`   Registry: ${registryPda.toString()}`);
  console.log(`   Counter: ${counterPda.toString()}`);
  console.log(`   Attestor: ${attestorPda.toString()}`);
  console.log(`   Policy: ${policyPda.toString()}`);

  return {
    registryPda,
    registryBump,
    counterPda,
    counterBump,
    attestorPda,
    attestorBump,
    policyPda,
    policyBump,
  };
}

/**
 * Initialize predicate registry if it doesn't exist
 */
async function initializeRegistryIfNeeded(
  predicateProgram: Program<PredicateRegistry>,
  authority: Keypair,
  registryPda: PublicKey
): Promise<void> {
  try {
    // Check if registry already exists
    await predicateProgram.account.predicateRegistry.fetch(registryPda);
    console.log("✅ Registry already initialized");
    return;
  } catch (error) {
    // Registry doesn't exist, initialize it
    console.log("📝 Initializing predicate registry...");
    
    const tx = await predicateProgram.methods
      .initialize()
      .accounts({
        registry: registryPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    console.log(`✅ Registry initialized: ${tx}`);
  }
}

/**
 * Register attestor if not already registered
 */
async function registerAttestorIfNeeded(
  predicateProgram: Program<PredicateRegistry>,
  authority: Keypair,
  attestor: PublicKey,
  registryPda: PublicKey,
  attestorPda: PublicKey
): Promise<void> {
  try {
    // Check if attestor is already registered
    const attestorAccount = await predicateProgram.account.attestorAccount.fetch(attestorPda);
    if (attestorAccount.isRegistered) {
      console.log("✅ Attestor already registered");
      return;
    }
  } catch (error) {
    // Attestor account doesn't exist, register it
  }

  console.log("📝 Registering attestor...");
  
  const tx = await predicateProgram.methods
    .registerAttestor(attestor)
    .accounts({
      registry: registryPda,
      attestorAccount: attestorPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  console.log(`✅ Attestor registered: ${tx}`);
}

/**
 * Set policy for the counter owner if not already set
 */
async function setPolicyIfNeeded(
  predicateProgram: Program<PredicateRegistry>,
  owner: Keypair,
  registryPda: PublicKey,
  policyPda: PublicKey
): Promise<void> {
  try {
    // Check if policy is already set
    await predicateProgram.account.policyAccount.fetch(policyPda);
    console.log("✅ Policy already set");
    return;
  } catch (error) {
    // Policy doesn't exist, set it
  }

  console.log("📝 Setting policy for counter owner...");
  
  const policyBuffer = Buffer.from(TEST_POLICY, "utf8");
  
  const tx = await predicateProgram.methods
    .setPolicy(Array.from(policyBuffer))
    .accounts({
      registry: registryPda,
      policyAccount: policyPda,
      client: owner.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
    .rpc();

  console.log(`✅ Policy set: ${tx}`);
}

/**
 * Initialize counter if it doesn't exist
 */
async function initializeCounterIfNeeded(
  counterProgram: Program<Counter>,
  predicateProgram: Program<PredicateRegistry>,
  owner: Keypair,
  counterPda: PublicKey,
  registryPda: PublicKey,
  policyPda: PublicKey
): Promise<void> {
  try {
    // Check if counter already exists
    await counterProgram.account.counterAccount.fetch(counterPda);
    console.log("✅ Counter already initialized");
    return;
  } catch (error) {
    // Counter doesn't exist, initialize it
  }

  console.log("📝 Initializing counter...");
  
  const tx = await counterProgram.methods
    .initialize()
    .accounts({
      counter: counterPda,
      owner: owner.publicKey,
      predicateRegistry: registryPda,
      policyAccount: policyPda,
      predicateRegistryProgram: predicateProgram.programId,
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
    .rpc();

  console.log(`✅ Counter initialized: ${tx}`);
}

/**
 * Create a task for counter increment operation
 */
function createIncrementTask(owner: PublicKey, counterProgram: Program<Counter>): any {
  const uuid = crypto.randomBytes(16);
  const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  
  // Create policy buffer with exact length needed (200 bytes)
  const policyBuffer = Buffer.alloc(200);
  Buffer.from(TEST_POLICY, "utf8").copy(policyBuffer);
  
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
  counterProgram: Program<Counter>,
  predicateProgram: Program<PredicateRegistry>,
  owner: Keypair,
  attestor: Keypair,
  pdas: PDAs
): Promise<void> {
  console.log("📝 Preparing counter increment with attestation validation...");

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
    })
    .instruction();

  // Create transaction with both instructions
  const transaction = new Transaction();
  transaction.add(ed25519Instruction);
  transaction.add(incrementInstruction);

  console.log("🚀 Sending increment transaction...");

  // Send transaction (owner signs as they're the one calling increment)
  const tx = await counterProgram.provider.sendAndConfirm(transaction, [owner]);

  console.log(`✅ Counter incremented successfully: ${tx}`);
}

/**
 * Get current counter value
 */
async function getCounterValue(
  counterProgram: Program<Counter>,
  counterPda: PublicKey
): Promise<number> {
  const counterAccount = await counterProgram.account.counterAccount.fetch(counterPda);
  return counterAccount.value.toNumber();
}

/**
 * Main execution function
 */
async function main() {
  console.log("🚀 Counter Program Client Example Starting...");
  console.log("=" .repeat(60));

  try {
    // Step 1: Setup clients
    const { provider, predicateProgram, counterProgram } = await setupClients();

    // Step 2: Setup accounts
    const { authority, owner, attestor } = await setupAccounts(provider);

    // Step 3: Find PDAs
    const pdas = findPDAs(predicateProgram, counterProgram, owner.publicKey, attestor.publicKey);

    console.log("\n" + "=" .repeat(60));
    console.log("📝 Setting up predicate registry and counter...");

    // Step 4: Initialize predicate registry
    await initializeRegistryIfNeeded(predicateProgram, authority, pdas.registryPda);

    // Step 5: Register attestor
    await registerAttestorIfNeeded(predicateProgram, authority, attestor.publicKey, pdas.registryPda, pdas.attestorPda);

    // Step 6: Set policy for owner
    await setPolicyIfNeeded(predicateProgram, owner, pdas.registryPda, pdas.policyPda);

    // Step 7: Initialize counter
    await initializeCounterIfNeeded(counterProgram, predicateProgram, owner, pdas.counterPda, pdas.registryPda, pdas.policyPda);

    console.log("\n" + "=" .repeat(60));
    console.log("🔢 Counter Operations");

    // Step 8: Get initial counter value
    const initialValue = await getCounterValue(counterProgram, pdas.counterPda);
    console.log(`📊 Initial counter value: ${initialValue}`);

    // Step 9: Increment counter with attestation
    await incrementCounter(counterProgram, predicateProgram, owner, attestor, pdas);

    // Step 10: Get final counter value
    const finalValue = await getCounterValue(counterProgram, pdas.counterPda);
    console.log(`📊 Final counter value: ${finalValue}`);

    console.log("\n" + "=" .repeat(60));
    console.log("✅ Counter Program Client Example completed successfully!");
    console.log(`   Counter incremented from ${initialValue} to ${finalValue}`);
    console.log(`   Predicate validation was successfully used to protect the increment operation`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
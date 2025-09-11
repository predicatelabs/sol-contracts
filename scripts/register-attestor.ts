#!/usr/bin/env ts-node

/**
 * Register Attestor Script
 * 
 * This script registers an attestor with the predicate registry using the deployment keys
 * from the machine that deployed the program. It will:
 * 
 * 1. Load the authority keypair from the configured wallet
 * 2. Accept attestor public key from environment variable
 * 3. Verify that the predicate registry is initialized
 * 4. Register the attestor if not already registered
 * 5. Display the attestor information
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  Keypair, 
  PublicKey, 
  SystemProgram,
  Connection
} from "@solana/web3.js";
import { PredicateRegistry } from "../target/types/predicate_registry";
import * as fs from "fs";
import * as path from "path";

// Configuration
const CLUSTER_URL = process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899";
const WALLET_PATH = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";
const ATTESTOR_PUBKEY = process.env.ATTESTOR_PUBKEY;

interface AttestorRegistrationResult {
  attestorPubkey: PublicKey;
  attestorPda: PublicKey;
  attestorBump: number;
  registryPda: PublicKey;
  authority: PublicKey;
  transactionSignature?: string;
  alreadyRegistered: boolean;
}

/**
 * Load the authority keypair from the configured wallet
 */
function loadAuthorityKeypair(): Keypair {
  const walletPath = WALLET_PATH.startsWith("~/") 
    ? path.join(process.env.HOME || "", WALLET_PATH.slice(2))
    : WALLET_PATH;
    
  try {
    const keypairData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  } catch (error) {
    throw new Error(`Failed to load authority keypair from ${walletPath}: ${error}`);
  }
}

/**
 * Parse and validate the attestor public key from environment variable
 */
function parseAttestorPublicKey(): PublicKey {
  if (!ATTESTOR_PUBKEY) {
    throw new Error(
      "ATTESTOR_PUBKEY environment variable is required. " +
      "Please set it to the public key of the attestor you want to register.\n" +
      "Example: export ATTESTOR_PUBKEY=<attestor-public-key>"
    );
  }

  try {
    return new PublicKey(ATTESTOR_PUBKEY);
  } catch (error) {
    throw new Error(
      `Invalid ATTESTOR_PUBKEY format: ${ATTESTOR_PUBKEY}\n` +
      "Please provide a valid Solana public key (base58 encoded)."
    );
  }
}

/**
 * Setup program client and provider
 */
async function setupClient(): Promise<{
  program: Program<PredicateRegistry>;
  provider: anchor.AnchorProvider;
  authority: Keypair;
}> {
  // Load authority keypair
  const authority = loadAuthorityKeypair();
  
  // Setup provider
  const connection = new Connection(CLUSTER_URL, "confirmed");
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;

  console.log("✅ Client setup complete:");
  console.log(`   Cluster: ${CLUSTER_URL}`);
  console.log(`   Program ID: ${program.programId.toString()}`);
  console.log(`   Authority: ${authority.publicKey.toString()}`);
  
  // Check authority balance
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`   Authority Balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  
  if (balance < 0.01 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Warning: Authority balance is low. You may need to fund the account.");
  }

  return { program, provider, authority };
}

/**
 * Find the registry PDA
 */
function findRegistryPDA(programId: PublicKey): { registryPda: PublicKey; registryBump: number } {
  const [registryPda, registryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    programId
  );

  return { registryPda, registryBump };
}

/**
 * Find the attestor PDA
 */
function findAttestorPDA(
  attestor: PublicKey,
  programId: PublicKey
): { attestorPda: PublicKey; attestorBump: number } {
  const [attestorPda, attestorBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("attestor"), attestor.toBuffer()],
    programId
  );

  return { attestorPda, attestorBump };
}

/**
 * Check if registry is initialized
 */
async function checkRegistryExists(
  program: Program<PredicateRegistry>,
  registryPda: PublicKey
): Promise<boolean> {
  try {
    await program.account.predicateRegistry.fetch(registryPda);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if attestor is already registered
 */
async function checkAttestorExists(
  program: Program<PredicateRegistry>,
  attestorPda: PublicKey
): Promise<boolean> {
  try {
    const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
    return attestorAccount.isRegistered;
  } catch (error) {
    return false;
  }
}

/**
 * Register the attestor
 */
async function registerAttestor(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  attestor: PublicKey,
  registryPda: PublicKey,
  attestorPda: PublicKey
): Promise<string> {
  console.log("📝 Registering attestor...");
  
  const tx = await program.methods
    .registerAttestor(attestor)
    .accounts({
      registry: registryPda,
      attestorAccount: attestorPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([authority])
    .rpc();

  return tx;
}

/**
 * Display attestor information
 */
async function displayAttestorInfo(
  program: Program<PredicateRegistry>,
  attestor: PublicKey,
  attestorPda: PublicKey
): Promise<void> {
  try {
    const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
    
    console.log("\n📊 Attestor Information:");
    console.log(`   Attestor Public Key: ${attestor.toString()}`);
    console.log(`   Attestor PDA: ${attestorPda.toString()}`);
    console.log(`   Is Registered: ${attestorAccount.isRegistered}`);
    console.log(`   Registered At: ${new Date(attestorAccount.registeredAt.toNumber() * 1000).toISOString()}`);
  } catch (error) {
    console.error("❌ Failed to fetch attestor information:", error);
  }
}

/**
 * Display registry statistics after registration
 */
async function displayRegistryStats(
  program: Program<PredicateRegistry>,
  registryPda: PublicKey
): Promise<void> {
  try {
    const registryAccount = await program.account.predicateRegistry.fetch(registryPda);
    
    console.log("\n📈 Registry Statistics:");
    console.log(`   Total Attestors: ${registryAccount.totalAttestors.toNumber()}`);
    console.log(`   Total Policies: ${registryAccount.totalPolicies.toNumber()}`);
    console.log(`   Last Updated: ${new Date(registryAccount.updatedAt.toNumber() * 1000).toISOString()}`);
  } catch (error) {
    console.error("❌ Failed to fetch registry statistics:", error);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<AttestorRegistrationResult> {
  console.log("🚀 Attestor Registration Script");
  console.log("=" .repeat(50));

  try {
    // Parse attestor public key from environment
    const attestorPubkey = parseAttestorPublicKey();
    console.log(`📋 Attestor to register: ${attestorPubkey.toString()}`);

    // Setup client
    const { program, provider, authority } = await setupClient();

    // Find PDAs
    const { registryPda, registryBump } = findRegistryPDA(program.programId);
    const { attestorPda, attestorBump } = findAttestorPDA(attestorPubkey, program.programId);
    
    console.log(`\n📍 PDAs calculated:`);
    console.log(`   Registry PDA: ${registryPda.toString()}`);
    console.log(`   Attestor PDA: ${attestorPda.toString()}`);

    console.log("\n🔍 Checking prerequisites...");

    // Check if predicate registry exists
    const registryExists = await checkRegistryExists(program, registryPda);
    if (!registryExists) {
      throw new Error(
        "Predicate registry is not initialized. Please run initialize-predicate-registry.ts first."
      );
    }
    console.log("✅ Predicate registry is initialized");

    // Check if attestor is already registered
    const attestorExists = await checkAttestorExists(program, attestorPda);
    
    let transactionSignature: string | undefined;
    let alreadyRegistered = false;

    if (attestorExists) {
      console.log("✅ Attestor is already registered");
      alreadyRegistered = true;
    } else {
      // Register attestor
      transactionSignature = await registerAttestor(
        program,
        authority,
        attestorPubkey,
        registryPda,
        attestorPda
      );
      console.log(`✅ Attestor registered successfully!`);
      console.log(`   Transaction: ${transactionSignature}`);
    }

    // Display attestor information
    await displayAttestorInfo(program, attestorPubkey, attestorPda);

    // Display updated registry statistics
    await displayRegistryStats(program, registryPda);

    console.log("\n" + "=" .repeat(50));
    console.log("✅ Attestor registration completed successfully!");
    
    if (!alreadyRegistered) {
      console.log("\n🎉 Next steps:");
      console.log("   1. The attestor can now provide attestations for task validation");
      console.log("   2. Clients can use this attestor for predicate validation");
      console.log("   3. Test the attestation flow with counter operations");
    }

    return {
      attestorPubkey,
      attestorPda,
      attestorBump,
      registryPda,
      authority: authority.publicKey,
      transactionSignature,
      alreadyRegistered,
    };

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

export { main as registerAttestor, AttestorRegistrationResult };

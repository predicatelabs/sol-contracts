#!/usr/bin/env ts-node

/**
 * Register Attester Script
 *
 * This script registers an attester with the predicate registry using the deployment keys
 * from the machine that deployed the program. It will:
 *
 * 1. Load the authority keypair from the configured wallet
 * 2. Accept attester public key from environment variable
 * 3. Verify that the predicate registry is initialized
 * 4. Register the attester if not already registered
 * 5. Display the attester information
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { PredicateRegistry } from "../target/types/predicate_registry";
import * as fs from "fs";
import * as path from "path";

// Configuration
const CLUSTER_URL = process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899";
const WALLET_PATH = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";
const ATTESTER_PUBKEY = process.env.ATTESTER_PUBKEY;

interface AttesterRegistrationResult {
  attesterPubkey: PublicKey;
  attesterPda: PublicKey;
  attesterBump: number;
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
    throw new Error(
      `Failed to load authority keypair from ${walletPath}: ${error}`
    );
  }
}

/**
 * Parse and validate the attester public key from environment variable
 */
function parseAttesterPublicKey(): PublicKey {
  if (!ATTESTER_PUBKEY) {
    throw new Error(
      "ATTESTER_PUBKEY environment variable is required. " +
        "Please set it to the public key of the attester you want to register.\n" +
        "Example: export ATTESTER_PUBKEY=<attester-public-key>"
    );
  }

  try {
    return new PublicKey(ATTESTER_PUBKEY);
  } catch (error) {
    throw new Error(
      `Invalid ATTESTER_PUBKEY format: ${ATTESTER_PUBKEY}\n` +
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
  const program = anchor.workspace
    .PredicateRegistry as Program<PredicateRegistry>;

  console.log("✅ Client setup complete:");
  console.log(`   Cluster: ${CLUSTER_URL}`);
  console.log(`   Program ID: ${program.programId.toString()}`);
  console.log(`   Authority: ${authority.publicKey.toString()}`);

  // Check authority balance
  const balance = await connection.getBalance(authority.publicKey);
  console.log(
    `   Authority Balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`
  );

  if (balance < 0.01 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log(
      "⚠️  Warning: Authority balance is low. You may need to fund the account."
    );
  }

  return { program, provider, authority };
}

/**
 * Find the registry PDA
 */
function findRegistryPDA(programId: PublicKey): {
  registryPda: PublicKey;
  registryBump: number;
} {
  const [registryPda, registryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    programId
  );

  return { registryPda, registryBump };
}

/**
 * Find the attester PDA
 */
function findAttesterPDA(
  attester: PublicKey,
  programId: PublicKey
): { attesterPda: PublicKey; attesterBump: number } {
  const [attesterPda, attesterBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("attester"), attester.toBuffer()],
    programId
  );

  return { attesterPda, attesterBump };
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
 * Check if attester is already registered
 */
async function checkAttesterExists(
  program: Program<PredicateRegistry>,
  attesterPda: PublicKey
): Promise<boolean> {
  try {
    const attesterAccount = await program.account.attesterAccount.fetch(
      attesterPda
    );
    return attesterAccount.isRegistered;
  } catch (error) {
    return false;
  }
}

/**
 * Register the attester
 */
async function registerAttester(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  attester: PublicKey,
  registryPda: PublicKey,
  attesterPda: PublicKey
): Promise<string> {
  console.log("📝 Registering attester...");

  const tx = await program.methods
    .registerAttester(attester)
    .accounts({
      registry: registryPda,
      attesterAccount: attesterPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([authority])
    .rpc();

  return tx;
}

/**
 * Display attester information
 */
async function displayAttesterInfo(
  program: Program<PredicateRegistry>,
  attester: PublicKey,
  attesterPda: PublicKey
): Promise<void> {
  try {
    const attesterAccount = await program.account.attesterAccount.fetch(
      attesterPda
    );

    console.log("\n📊 Attester Information:");
    console.log(`   Attester Public Key: ${attester.toString()}`);
    console.log(`   Attester PDA: ${attesterPda.toString()}`);
    console.log(`   Is Registered: ${attesterAccount.isRegistered}`);
    console.log(
      `   Registered At: ${new Date(
        attesterAccount.registeredAt.toNumber() * 1000
      ).toISOString()}`
    );
  } catch (error) {
    console.error("❌ Failed to fetch attester information:", error);
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
    const registryAccount = await program.account.predicateRegistry.fetch(
      registryPda
    );

    console.log("\n📈 Registry Statistics:");
    console.log(
      `   Total Attesters: ${registryAccount.totalAttesters.toNumber()}`
    );
    console.log(
      `   Total Policies: ${registryAccount.totalPolicies.toNumber()}`
    );
    console.log(
      `   Last Updated: ${new Date(
        registryAccount.updatedAt.toNumber() * 1000
      ).toISOString()}`
    );
  } catch (error) {
    console.error("❌ Failed to fetch registry statistics:", error);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<AttesterRegistrationResult> {
  console.log("🚀 Attester Registration Script");
  console.log("=".repeat(50));

  try {
    // Parse attester public key from environment
    const attesterPubkey = parseAttesterPublicKey();
    console.log(`📋 Attester to register: ${attesterPubkey.toString()}`);

    // Setup client
    const { program, provider, authority } = await setupClient();

    // Find PDAs
    const { registryPda, registryBump } = findRegistryPDA(program.programId);
    const { attesterPda, attesterBump } = findAttesterPDA(
      attesterPubkey,
      program.programId
    );

    console.log(`\n📍 PDAs calculated:`);
    console.log(`   Registry PDA: ${registryPda.toString()}`);
    console.log(`   Attester PDA: ${attesterPda.toString()}`);

    console.log("\n🔍 Checking prerequisites...");

    // Check if predicate registry exists
    const registryExists = await checkRegistryExists(program, registryPda);
    if (!registryExists) {
      throw new Error(
        "Predicate registry is not initialized. Please run initialize-predicate-registry.ts first."
      );
    }
    console.log("✅ Predicate registry is initialized");

    // Check if attester is already registered
    const attesterExists = await checkAttesterExists(program, attesterPda);

    let transactionSignature: string | undefined;
    let alreadyRegistered = false;

    if (attesterExists) {
      console.log("✅ Attester is already registered");
      alreadyRegistered = true;
    } else {
      // Register attester
      transactionSignature = await registerAttester(
        program,
        authority,
        attesterPubkey,
        registryPda,
        attesterPda
      );
      console.log(`✅ Attester registered successfully!`);
      console.log(`   Transaction: ${transactionSignature}`);
    }

    // Display attester information
    await displayAttesterInfo(program, attesterPubkey, attesterPda);

    // Display updated registry statistics
    await displayRegistryStats(program, registryPda);

    console.log("\n" + "=".repeat(50));
    console.log("✅ Attester registration completed successfully!");

    if (!alreadyRegistered) {
      console.log("\n🎉 Next steps:");
      console.log(
        "   1. The attester can now provide attestations for statement validation"
      );
      console.log(
        "   2. Clients can use this attester for predicate validation"
      );
      console.log("   3. Test the attestation flow with counter operations");
    }

    return {
      attesterPubkey,
      attesterPda,
      attesterBump,
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

export { main as registerAttester, AttesterRegistrationResult };

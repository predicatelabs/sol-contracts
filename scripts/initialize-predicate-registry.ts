#!/usr/bin/env ts-node

/**
 * Initialize Predicate Registry Script
 *
 * This script initializes the predicate registry using the deployment keys
 * from the machine that deployed the program. It will:
 *
 * 1. Load the program keypair from target/deploy/
 * 2. Use the configured wallet as the authority
 * 3. Initialize the predicate registry if it doesn't exist
 * 4. Display the registry information
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { PredicateRegistry } from "../target/types/predicate_registry";
import * as fs from "fs";
import * as path from "path";

// Configuration
const CLUSTER_URL = process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899";
const WALLET_PATH =
  process.env.ANCHOR_WALLET ||
  path.join(__dirname, "test-keys", "authority.json");
const USE_TEST_KEYS = process.env.USE_TEST_KEYS !== "false"; // Default to true

// Test attester public keys (loaded from test-keys if available)
const TEST_ATTESTERS = [
  "6b1PX55tY4B2MzrG53e6a8mX3CGkhLuDZs9LdVHQ3L44", // attester-1
  "H6VsoAJjTFGk2bXaNGpojHri1Ud1zmZuoo4A9Bdkp2UC", // attester-2
  "JAJtV17DAwynd8DvUVsk2HnarazKm1P1yZ4rSpodZBay", // attester-3
];

interface AttesterRegistration {
  publicKey: PublicKey;
  attesterPda: PublicKey;
  transactionSignature?: string;
  alreadyRegistered: boolean;
}

interface InitializationResult {
  registryPda: PublicKey;
  registryBump: number;
  authority: PublicKey;
  transactionSignature?: string;
  alreadyInitialized: boolean;
  attesterRegistrations: AttesterRegistration[];
}

/**
 * Load the authority keypair from the configured wallet and ensure it's funded
 */
async function loadAuthorityKeypair(connection: Connection): Promise<Keypair> {
  let walletPath = WALLET_PATH;

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
      console.log("🔑 Using test authority key from test-keys/authority.json");
      console.log("⚠️  This is for development/testing only!");
    }
  } catch (error) {
    if (isUsingTestKeys) {
      throw new Error(
        `Failed to load test authority keypair from ${walletPath}. ` +
          `Please run 'npx ts-node --transpile-only scripts/generate-test-keys.ts' first.`
      );
    }
    throw new Error(
      `Failed to load authority keypair from ${walletPath}: ${error}`
    );
  }

  // Check balance and request airdrop if needed
  const balance = await connection.getBalance(keypair.publicKey);
  const minBalance = 0.1 * anchor.web3.LAMPORTS_PER_SOL; // 0.1 SOL minimum

  console.log(
    `💰 Current balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`
  );

  if (balance < minBalance) {
    console.log("💸 Balance is low, requesting airdrop...");

    try {
      // Check if we're on a network that supports airdrops
      const isLocalOrDevnet =
        CLUSTER_URL.includes("127.0.0.1") ||
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
        console.log(
          `✅ Airdrop successful! New balance: ${
            newBalance / anchor.web3.LAMPORTS_PER_SOL
          } SOL`
        );
      } else {
        console.log(
          "⚠️  Cannot request airdrop on this network. Please fund the account manually."
        );
        console.log(`   Account: ${keypair.publicKey.toString()}`);
        console.log(
          `   Required: At least ${
            minBalance / anchor.web3.LAMPORTS_PER_SOL
          } SOL`
        );
      }
    } catch (error) {
      console.log(`⚠️  Airdrop failed: ${error}`);
      console.log("   Continuing with current balance...");
    }
  }

  return keypair;
}

/**
 * Setup program client and provider
 */
async function setupClient(): Promise<{
  program: Program<PredicateRegistry>;
  provider: anchor.AnchorProvider;
  authority: Keypair;
}> {
  // Setup connection first
  const connection = new Connection(CLUSTER_URL, "confirmed");

  // Load authority keypair and ensure it's funded
  const authority = await loadAuthorityKeypair(connection);

  // Setup provider
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
 * Check if registry is already initialized
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
 * Initialize the predicate registry
 */
async function initializeRegistry(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  registryPda: PublicKey
): Promise<string> {
  console.log("📝 Initializing predicate registry...");

  const tx = await program.methods
    .initialize()
    .accounts({
      registry: registryPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([authority])
    .rpc();

  return tx;
}

/**
 * Find attester PDA
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
 * Register a single attester
 */
async function registerAttester(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  attesterPubkey: PublicKey,
  registryPda: PublicKey
): Promise<AttesterRegistration> {
  const { attesterPda } = findAttesterPDA(attesterPubkey, program.programId);

  // Check if already registered
  const alreadyRegistered = await checkAttesterExists(program, attesterPda);

  if (alreadyRegistered) {
    console.log(
      `   ✅ Attester ${attesterPubkey
        .toString()
        .slice(0, 8)}... already registered`
    );
    return {
      publicKey: attesterPubkey,
      attesterPda,
      alreadyRegistered: true,
    };
  }

  // Register the attester
  console.log(
    `   📝 Registering attester ${attesterPubkey.toString().slice(0, 8)}...`
  );

  const tx = await program.methods
    .registerAttester(attesterPubkey)
    .accounts({
      registry: registryPda,
      attesterAccount: attesterPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([authority])
    .rpc();

  console.log(`   ✅ Registered successfully: ${tx.slice(0, 8)}...`);

  return {
    publicKey: attesterPubkey,
    attesterPda,
    transactionSignature: tx,
    alreadyRegistered: false,
  };
}

/**
 * Register all test attesters
 */
async function registerTestAttesters(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  registryPda: PublicKey
): Promise<AttesterRegistration[]> {
  if (!USE_TEST_KEYS) {
    console.log("📝 Skipping attester registration (USE_TEST_KEYS=false)");
    return [];
  }

  console.log("📝 Registering test attesters...");

  const registrations: AttesterRegistration[] = [];

  for (const attesterKey of TEST_ATTESTERS) {
    try {
      const attesterPubkey = new PublicKey(attesterKey);
      const registration = await registerAttester(
        program,
        authority,
        attesterPubkey,
        registryPda
      );
      registrations.push(registration);
    } catch (error) {
      console.error(
        `   ❌ Failed to register attester ${attesterKey.slice(
          0,
          8
        )}...: ${error}`
      );
    }
  }

  return registrations;
}

/**
 * Display registry information
 */
async function displayRegistryInfo(
  program: Program<PredicateRegistry>,
  registryPda: PublicKey
): Promise<void> {
  try {
    const registryAccount = await program.account.predicateRegistry.fetch(
      registryPda
    );

    console.log("\n📊 Registry Information:");
    console.log(`   Registry PDA: ${registryPda.toString()}`);
    console.log(`   Authority: ${registryAccount.authority.toString()}`);
    console.log(
      `   Created At: ${new Date(
        registryAccount.createdAt.toNumber() * 1000
      ).toISOString()}`
    );
    console.log(
      `   Updated At: ${new Date(
        registryAccount.updatedAt.toNumber() * 1000
      ).toISOString()}`
    );
    console.log(
      `   Total Attesters: ${registryAccount.totalAttesters.toNumber()}`
    );
    console.log(
      `   Total Policies: ${registryAccount.totalPolicies.toNumber()}`
    );
  } catch (error) {
    console.error("❌ Failed to fetch registry information:", error);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<InitializationResult> {
  console.log("🚀 Predicate Registry Initialization Script");
  console.log("=".repeat(50));

  try {
    // Setup client
    const { program, provider, authority } = await setupClient();

    // Find registry PDA
    const { registryPda, registryBump } = findRegistryPDA(program.programId);
    console.log(`\n📍 Registry PDA: ${registryPda.toString()}`);

    // Check if already initialized
    const exists = await checkRegistryExists(program, registryPda);

    let transactionSignature: string | undefined;
    let alreadyInitialized = false;

    if (exists) {
      console.log("✅ Registry is already initialized");
      alreadyInitialized = true;
    } else {
      // Initialize registry
      transactionSignature = await initializeRegistry(
        program,
        authority,
        registryPda
      );
      console.log(`✅ Registry initialized successfully!`);
      console.log(`   Transaction: ${transactionSignature}`);
    }

    // Register test attesters
    const attesterRegistrations = await registerTestAttesters(
      program,
      authority,
      registryPda
    );

    // Display registry information
    await displayRegistryInfo(program, registryPda);

    console.log("\n" + "=".repeat(50));
    console.log("✅ Predicate Registry initialization completed successfully!");

    if (attesterRegistrations.length > 0) {
      const newRegistrations = attesterRegistrations.filter(
        (r) => !r.alreadyRegistered
      );
      const existingRegistrations = attesterRegistrations.filter(
        (r) => r.alreadyRegistered
      );

      console.log(`\n📊 Attester Registration Summary:`);
      console.log(`   New registrations: ${newRegistrations.length}`);
      console.log(`   Already registered: ${existingRegistrations.length}`);
      console.log(`   Total attesters: ${attesterRegistrations.length}`);
    }

    if (
      !alreadyInitialized ||
      attesterRegistrations.some((r) => !r.alreadyRegistered)
    ) {
      console.log("\n🎉 Next steps:");
      console.log("   1. Set policies for clients");
      console.log("   2. Deploy and initialize counter programs");
      console.log("   3. Test attestation validation flow");
    }

    return {
      registryPda,
      registryBump,
      authority: authority.publicKey,
      transactionSignature,
      alreadyInitialized,
      attesterRegistrations,
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

export { main as initializePredicateRegistry, InitializationResult };

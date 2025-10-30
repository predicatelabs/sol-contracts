#!/usr/bin/env ts-node

/**
 * Initialize Counter Program Script
 *
 * This script initializes a counter program instance using the deployment keys
 * from the machine that deployed the program. It will:
 *
 * 1. Load the program keypair from target/deploy/
 * 2. Use the configured wallet as the owner
 * 3. Ensure predicate registry is initialized
 * 4. Set a policy for the Counter PROGRAM (if not already set)
 * 5. Initialize a new counter instance
 * 6. Display the counter information
 *
 * NOTE: Policies are tied to PROGRAMS, not users. The Counter program's upgrade
 * authority (typically the deployer) sets the policy that applies to all users
 * who call the Counter program.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { PredicateRegistry } from "../target/types/predicate_registry";
import { Counter } from "../target/types/counter";
import * as fs from "fs";
import * as path from "path";

// BPF Loader Upgradeable Program ID (well-known constant)
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

// Configuration
const CLUSTER_URL = process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899";
const WALLET_PATH =
  process.env.ANCHOR_WALLET ||
  path.join(__dirname, "test-keys", "authority.json");
const DEFAULT_POLICY = "counter-increment-policy-v1";
const USE_TEST_KEYS = process.env.USE_TEST_KEYS !== "false"; // Default to true

interface CounterInitializationResult {
  counterPda: PublicKey;
  counterBump: number;
  owner: PublicKey;
  registryPda: PublicKey;
  policyPda: PublicKey;
  transactionSignature?: string;
  alreadyInitialized: boolean;
}

/**
 * Load the owner keypair from the configured wallet and ensure it's funded
 */
async function loadOwnerKeypair(connection: Connection): Promise<Keypair> {
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
      `Failed to load owner keypair from ${walletPath}: ${error}`
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
 * Setup program clients and provider
 */
async function setupClients(): Promise<{
  predicateProgram: Program<PredicateRegistry>;
  counterProgram: Program<Counter>;
  provider: anchor.AnchorProvider;
  owner: Keypair;
}> {
  // Setup connection first
  const connection = new Connection(CLUSTER_URL, "confirmed");

  // Load owner keypair and ensure it's funded
  const owner = await loadOwnerKeypair(connection);

  // Setup provider
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load programs
  const predicateProgram = anchor.workspace
    .PredicateRegistry as Program<PredicateRegistry>;
  const counterProgram = anchor.workspace.Counter as Program<Counter>;

  console.log("✅ Clients setup complete:");
  console.log(`   Cluster: ${CLUSTER_URL}`);
  console.log(
    `   Predicate Registry: ${predicateProgram.programId.toString()}`
  );
  console.log(`   Counter Program: ${counterProgram.programId.toString()}`);
  console.log(`   Owner: ${owner.publicKey.toString()}`);

  return { predicateProgram, counterProgram, provider, owner };
}

/**
 * Find all required PDAs
 */
function findPDAs(
  predicateProgram: Program<PredicateRegistry>,
  counterProgram: Program<Counter>,
  owner: PublicKey
): {
  registryPda: PublicKey;
  registryBump: number;
  counterPda: PublicKey;
  counterBump: number;
  policyPda: PublicKey;
  policyBump: number;
} {
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

  // Policy PDA - derived from COUNTER PROGRAM, not user
  // Policies are owned by programs, not users
  const [policyPda, policyBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), counterProgram.programId.toBuffer()],
    predicateProgram.programId
  );

  console.log("📍 PDAs calculated:");
  console.log(`   Registry: ${registryPda.toString()}`);
  console.log(`   Counter: ${counterPda.toString()}`);
  console.log(`   Policy (for Counter program): ${policyPda.toString()}`);

  return {
    registryPda,
    registryBump,
    counterPda,
    counterBump,
    policyPda,
    policyBump,
  };
}

/**
 * Check if predicate registry exists
 */
async function checkRegistryExists(
  predicateProgram: Program<PredicateRegistry>,
  registryPda: PublicKey
): Promise<boolean> {
  try {
    await predicateProgram.account.predicateRegistry.fetch(registryPda);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if policy exists for the owner
 */
async function checkPolicyExists(
  predicateProgram: Program<PredicateRegistry>,
  policyPda: PublicKey
): Promise<boolean> {
  try {
    await predicateProgram.account.policyAccount.fetch(policyPda);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Set policy for the Counter program
 * NOTE: Only the program's upgrade authority can set the policy
 */
async function setPolicyId(
  predicateProgram: Program<PredicateRegistry>,
  counterProgram: Program<Counter>,
  upgradeAuthority: Keypair,
  registryPda: PublicKey,
  policyPda: PublicKey,
  policy: string = DEFAULT_POLICY
): Promise<string> {
  console.log(`📝 Setting policy ID for Counter program: ${policy}`);
  console.log(`   Upgrade authority: ${upgradeAuthority.publicKey.toString()}`);

  // Derive program data PDA
  const [programDataPda] = PublicKey.findProgramAddressSync(
    [counterProgram.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID
  );

  const tx = await predicateProgram.methods
    .setPolicyId(counterProgram.programId, policy)
    .accounts({
      registry: registryPda,
      policyAccount: policyPda,
      clientProgram: counterProgram.programId,
      programData: programDataPda,
      authority: upgradeAuthority.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([upgradeAuthority])
    .rpc();

  return tx;
}

/**
 * Check if counter is already initialized
 */
async function checkCounterExists(
  counterProgram: Program<Counter>,
  counterPda: PublicKey
): Promise<boolean> {
  try {
    await counterProgram.account.counterAccount.fetch(counterPda);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Initialize the counter
 */
async function initializeCounter(
  counterProgram: Program<Counter>,
  predicateProgram: Program<PredicateRegistry>,
  owner: Keypair,
  counterPda: PublicKey,
  registryPda: PublicKey,
  policyPda: PublicKey
): Promise<string> {
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
    } as any)
    .signers([owner])
    .rpc();

  return tx;
}

/**
 * Display counter information
 */
async function displayCounterInfo(
  counterProgram: Program<Counter>,
  counterPda: PublicKey
): Promise<void> {
  try {
    const counterAccount = await counterProgram.account.counterAccount.fetch(
      counterPda
    );

    console.log("\n📊 Counter Information:");
    console.log(`   Counter PDA: ${counterPda.toString()}`);
    console.log(`   Owner: ${counterAccount.owner.toString()}`);
    console.log(`   Current Value: ${counterAccount.value.toNumber()}`);
    console.log(
      `   Predicate Registry: ${counterAccount.predicateRegistry.toString()}`
    );
    console.log(
      `   Created At: ${new Date(
        counterAccount.createdAt.toNumber() * 1000
      ).toISOString()}`
    );
    console.log(
      `   Updated At: ${new Date(
        counterAccount.updatedAt.toNumber() * 1000
      ).toISOString()}`
    );
  } catch (error) {
    console.error("❌ Failed to fetch counter information:", error);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<CounterInitializationResult> {
  console.log("🚀 Counter Program Initialization Script");
  console.log("=".repeat(50));

  try {
    // Setup clients
    const { predicateProgram, counterProgram, provider, owner } =
      await setupClients();

    // Find PDAs
    const pdas = findPDAs(predicateProgram, counterProgram, owner.publicKey);

    console.log("\n🔍 Checking prerequisites...");

    // Check if predicate registry exists
    const registryExists = await checkRegistryExists(
      predicateProgram,
      pdas.registryPda
    );
    if (!registryExists) {
      throw new Error(
        "Predicate registry is not initialized. Please run initialize-predicate-registry.ts first."
      );
    }
    console.log("✅ Predicate registry is initialized");

    // Check if policy exists, set if not
    const policyExists = await checkPolicyExists(
      predicateProgram,
      pdas.policyPda
    );
    if (!policyExists) {
      console.log(
        "📝 Policy not found for Counter program, setting default policy..."
      );
      console.log(
        "   NOTE: This requires the wallet to be the Counter program's upgrade authority"
      );
      const policyTx = await setPolicyId(
        predicateProgram,
        counterProgram,
        owner, // Assumes owner is the upgrade authority
        pdas.registryPda,
        pdas.policyPda
      );
      console.log(`✅ Policy set: ${policyTx}`);
    } else {
      console.log("✅ Policy already exists for Counter program");
    }

    // Check if counter already exists
    const counterExists = await checkCounterExists(
      counterProgram,
      pdas.counterPda
    );

    let transactionSignature: string | undefined;
    let alreadyInitialized = false;

    if (counterExists) {
      console.log("✅ Counter is already initialized");
      alreadyInitialized = true;
    } else {
      // Initialize counter
      transactionSignature = await initializeCounter(
        counterProgram,
        predicateProgram,
        owner,
        pdas.counterPda,
        pdas.registryPda,
        pdas.policyPda
      );
      console.log(`✅ Counter initialized successfully!`);
      console.log(`   Transaction: ${transactionSignature}`);
    }

    // Display counter information
    await displayCounterInfo(counterProgram, pdas.counterPda);

    console.log("\n" + "=".repeat(50));
    console.log("✅ Counter initialization completed successfully!");

    if (!alreadyInitialized) {
      console.log("\n🎉 Next steps:");
      console.log("   1. Register attesters with the predicate registry");
      console.log(
        "   2. Use the counter client to perform protected increment operations"
      );
      console.log("   3. Test the predicate validation flow");
    }

    return {
      counterPda: pdas.counterPda,
      counterBump: pdas.counterBump,
      owner: owner.publicKey,
      registryPda: pdas.registryPda,
      policyPda: pdas.policyPda,
      transactionSignature,
      alreadyInitialized,
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

export { main as initializeCounter, CounterInitializationResult };

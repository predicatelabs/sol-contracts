/**
 * Get Policy ID Script
 * 
 * Fetches and displays the policy ID for a given program.
 * 
 * Usage:
 *   ts-node scripts/get-policy.ts <program-id>
 * 
 * Example:
 *   ts-node scripts/get-policy.ts DNqiXmRMXgcGaqFJAegJT4EZd7e6b3S7mTpT3EsXMDdn
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { PredicateRegistry } from "../target/types/predicate_registry";
import * as fs from "fs";

async function main() {
  // Get program ID from command line
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: ts-node scripts/get-policy.ts <program-id>");
    console.error("Example: ts-node scripts/get-policy.ts DNqiXmRMXgcGaqFJAegJT4EZd7e6b3S7mTpT3EsXMDdn");
    process.exit(1);
  }

  const clientProgramId = new PublicKey(args[0]);
  
  // Setup connection and provider
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  
  // Use a dummy wallet for read-only operations
  const dummyWallet = Keypair.generate();
  const wallet = new anchor.Wallet(dummyWallet);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  // Load the Predicate Registry program
  const predicateRegistryProgramId = new PublicKey(
    "GjXtvmWihnf22Bg48srpzYrs6iGhSUvu1tzsf9L4u9Ck"
  );
  
  // Load IDL
  const idlPath = __dirname + "/../target/idl/predicate_registry.json";
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  
  const program = new Program(
    idl as anchor.Idl,
    provider
  ) as Program<PredicateRegistry>;

  console.log("\n🔍 Looking up policy for program:", clientProgramId.toBase58());
  console.log("Using RPC:", rpcUrl);
  console.log("");

  // Derive the policy PDA
  const [policyPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), clientProgramId.toBuffer()],
    predicateRegistryProgramId
  );

  console.log("Policy PDA:", policyPda.toBase58());
  console.log("Policy PDA Bump:", bump);
  console.log("");

  try {
    // Fetch the policy account
    const policyAccount = await program.account.policyAccount.fetch(policyPda);

    console.log("✅ Policy Found!");
    console.log("━".repeat(60));
    console.log("Policy ID:        ", policyAccount.policyId);
    console.log("Client Program:   ", policyAccount.clientProgram.toBase58());
    console.log("Authority:        ", policyAccount.authority.toBase58());
    console.log("Set At:           ", new Date(policyAccount.setAt.toNumber() * 1000).toISOString());
    console.log("Updated At:       ", new Date(policyAccount.updatedAt.toNumber() * 1000).toISOString());
    console.log("━".repeat(60));
    console.log("");

    // Explorer links
    console.log("🔗 Explorer Links:");
    console.log("Policy Account:   ", `https://solscan.io/account/${policyPda.toBase58()}`);
    console.log("Client Program:   ", `https://solscan.io/account/${clientProgramId.toBase58()}`);
    console.log("");

  } catch (error: any) {
    if (error.message?.includes("Account does not exist")) {
      console.log("❌ No policy found for this program");
      console.log("");
      console.log("This program does not have a policy set in the Predicate Registry.");
      console.log("To set a policy, the program's upgrade authority must call set_policy_id.");
      console.log("");
    } else {
      console.error("Error fetching policy:", error.message);
      throw error;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


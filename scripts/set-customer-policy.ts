#!/usr/bin/env ts-node
/**
 * Set Policy ID for a Customer Stub Program
 * 
 * Usage:
 *   npx ts-node scripts/set-customer-policy.ts <customer-program-id> <policy-id>
 * 
 * Example:
 *   npx ts-node scripts/set-customer-policy.ts C4DUV... customer-policy-v1
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PredicateRegistry } from "../target/types/predicate_registry";
import fs from "fs";
import path from "path";

async function setCustomerPolicy(customerProgramId: string, policyId: string) {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  
  // Load authority wallet
  const walletPath = process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, ".config/solana/id.json");
  const authorityKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  
  const customerProgram = new PublicKey(customerProgramId);
  
  console.log("🔐 Setting Customer Policy");
  console.log("==================================================");
  console.log(`Customer Program: ${customerProgram.toString()}`);
  console.log(`Policy ID: ${policyId}`);
  console.log(`Authority: ${authorityKeypair.publicKey.toString()}`);
  console.log();
  
  // Derive PDAs
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    program.programId
  );
  
  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), customerProgram.toBuffer()],
    program.programId
  );
  
  const [programDataPda] = PublicKey.findProgramAddressSync(
    [customerProgram.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
  );
  
  console.log("📍 Derived Accounts:");
  console.log(`   Registry PDA: ${registryPda.toString()}`);
  console.log(`   Policy PDA: ${policyPda.toString()}`);
  console.log(`   Program Data PDA: ${programDataPda.toString()}`);
  console.log();
  
  // Check if policy already exists
  try {
    const existingPolicy = await program.account.policyAccount.fetch(policyPda);
    console.log("⚠️  Policy already exists for this program:");
    console.log(`   Current Policy ID: ${existingPolicy.policyId}`);
    console.log(`   Set At: ${new Date(existingPolicy.setAt.toNumber() * 1000).toISOString()}`);
    console.log();
    
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const answer = await new Promise<string>((resolve) => {
      readline.question("Update policy? (yes/no): ", resolve);
    });
    readline.close();
    
    if (answer.toLowerCase() !== "yes") {
      console.log("Aborted.");
      return;
    }
    
    console.log("\n📝 Updating policy...");
    const tx = await program.methods
      .updatePolicyId(customerProgram, policyId)
      .accounts({
        registry: registryPda,
        policyAccount: policyPda,
        clientProgram: customerProgram,
        programData: programDataPda,
        authority: authorityKeypair.publicKey,
      } as any)
      .signers([authorityKeypair])
      .rpc();
    
    console.log("✅ Policy updated successfully!");
    console.log(`   Transaction: ${tx}`);
    
  } catch (error: any) {
    if (error.message?.includes("Account does not exist")) {
      console.log("📝 Setting new policy...");
      const tx = await program.methods
        .setPolicyId(policyId)
        .accounts({
          registry: registryPda,
          policyAccount: policyPda,
          clientProgram: customerProgram,
          programData: programDataPda,
          authority: authorityKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([authorityKeypair])
        .rpc();
      
      console.log("✅ Policy set successfully!");
      console.log(`   Transaction: ${tx}`);
    } else {
      throw error;
    }
  }
  
  // Verify
  const policy = await program.account.policyAccount.fetch(policyPda);
  console.log();
  console.log("📊 Policy Details:");
  console.log(`   Client Program: ${policy.clientProgram.toString()}`);
  console.log(`   Policy ID: ${policy.policyId}`);
  console.log(`   Authority: ${policy.authority.toString()}`);
  console.log(`   Set At: ${new Date(policy.setAt.toNumber() * 1000).toISOString()}`);
  console.log(`   Updated At: ${new Date(policy.updatedAt.toNumber() * 1000).toISOString()}`);
  console.log();
  console.log("🎉 Customer policy configured successfully!");
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("Usage: npx ts-node scripts/set-customer-policy.ts <customer-program-id> <policy-id>");
  console.error("Example: npx ts-node scripts/set-customer-policy.ts C4DUV... customer-policy-v1");
  process.exit(1);
}

const [customerProgramId, policyId] = args;

setCustomerPolicy(customerProgramId, policyId).catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});

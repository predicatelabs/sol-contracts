/**
 * UUID Replay Prevention via Cleanup Test
 *
 * This test verifies that UUID replay prevention is maintained when cleanup
 * is attempted during the validation buffer window.
 *
 * Test scenario:
 * 1. Validate an attestation (creates UUID account)
 * 2. Attempt cleanup while attestation is still within validation buffer
 * 3. Verify cleanup is prevented and UUID account remains
 *
 * This ensures UUID accounts cannot be cleaned up while attestations are
 * still valid for validation (within the 30-second buffer window).
 */

import { expect } from "chai";
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
  createMessageHash,
} from "../helpers/test-utils";
import nacl from "tweetnacl";
import * as crypto from "crypto";

describe("UUID Replay Prevention via Cleanup", () => {
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
    await connection.confirmTransaction(airdropSig, "confirmed");

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
    // Hash variable-length fields separately to prevent collisions
    const encodedSigAndArgsHash = crypto.createHash("sha256").update(statement.encodedSigAndArgs).digest();
    const policyIdHash = crypto.createHash("sha256").update(Buffer.from(statement.policyId, "utf8")).digest();
    
    // Concatenate fixed-length fields with hashed variable-length fields
    const data = Buffer.concat([
      Buffer.from(statement.uuid),
      statement.msgSender.toBuffer(),
      statement.target.toBuffer(),
      Buffer.from(statement.msgValue.toBuffer("le", 8)),
      encodedSigAndArgsHash,
      policyIdHash,
      Buffer.from(statement.expiration.toBuffer("le", 8)),
    ]);

    // Hash the data using SHA-256 (Solana's hash function)
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

  it("should prevent cleanup when attestation is within validation buffer", async () => {
    // Test scenario: Attempt cleanup while attestation is still valid for validation
    // Cleanup should be prevented to maintain replay protection

    // Create an attestation that has expired but is still within the validation buffer
    // This tests the edge case where cleanup might be attempted but validation still works
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

    // Step 2: First validation - should succeed (within 30s buffer)
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

    // Verify transaction succeeded and returned a valid signature
    expect(validateTx1).to.be.a("string");
    expect(validateTx1.length).to.be.greaterThan(0);

    // Verify UUID account was created with correct data
    const uuidAccount1 = await program.account.usedUuidAccount.fetch(
      usedUuidPda
    );
    expect(uuidAccount1.uuid).to.deep.equal(uuid);
    expect(uuidAccount1.expiresAt.toNumber()).to.equal(expiredTime);
    expect(uuidAccount1.signer).to.deep.equal(client.publicKey);

    // Attempt cleanup - should fail because attestation is still within validation buffer
    // Cleanup is only allowed after: current_timestamp > expires_at + CLOCK_DRIFT_BUFFER
    try {
      await program.methods
        .cleanupExpiredUuid()
        .accounts({
          usedUuidAccount: usedUuidPda,
          signerRecipient: client.publicKey,
        } as any)
        .rpc();

      expect.fail(
        "Cleanup should have failed - attestation is still within the 30-second validation buffer"
      );
    } catch (error: any) {
      // Verify the specific error: StatementNotExpired
      expect(error).to.exist;
      const errorMessage = error.message || String(error);
      expect(
        errorMessage.includes("StatementNotExpired") ||
          errorMessage.includes("Statement not expired")
      ).to.be.true;
    }

    // Verify UUID account still exists (cleanup was prevented)
    // This ensures replay protection remains intact
    const uuidAccountAfterCleanupAttempt =
      await program.account.usedUuidAccount.fetch(usedUuidPda);
    expect(uuidAccountAfterCleanupAttempt.uuid).to.deep.equal(uuid);
    expect(uuidAccountAfterCleanupAttempt.expiresAt.toNumber()).to.equal(
      expiredTime
    );
    expect(uuidAccountAfterCleanupAttempt.signer).to.deep.equal(
      client.publicKey
    );
  });

  it("should prevent cleanup during validation buffer window", async () => {
    // Test scenario: Attempt cleanup while attestation is within validation buffer
    // Cleanup should be prevented to maintain replay protection

    const currentTime = Math.floor(Date.now() / 1000);
    const expiredTime = currentTime - 10; // Expired 10 seconds ago (within 30s buffer)

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

    // First validation should succeed
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

    // Verify transaction succeeded and returned a valid signature
    expect(validateTx1).to.be.a("string");
    expect(validateTx1.length).to.be.greaterThan(0);

    // Attempt cleanup - should fail (attestation still within validation buffer)
    // Cleanup is only allowed after: current_timestamp > expires_at + CLOCK_DRIFT_BUFFER
    try {
      await program.methods
        .cleanupExpiredUuid()
        .accounts({
          usedUuidAccount: usedUuidPda,
          signerRecipient: client.publicKey,
        } as any)
        .rpc();

      expect.fail(
        "Cleanup should have failed - attestation is still within the 30-second validation buffer"
      );
    } catch (error: any) {
      // Verify the specific error: StatementNotExpired
      expect(error).to.exist;
      const errorMessage = error.message || String(error);
      expect(
        errorMessage.includes("StatementNotExpired") ||
          errorMessage.includes("Statement not expired")
      ).to.be.true;
    }

    // Verify UUID account still exists (cleanup was prevented)
    // This ensures replay protection remains intact
    const uuidAccountAfterCleanupAttempt =
      await program.account.usedUuidAccount.fetch(usedUuidPda);
    expect(uuidAccountAfterCleanupAttempt.uuid).to.deep.equal(uuid);
    expect(uuidAccountAfterCleanupAttempt.expiresAt.toNumber()).to.equal(
      expiredTime
    );
    expect(uuidAccountAfterCleanupAttempt.signer).to.deep.equal(
      client.publicKey
    );
  });
});

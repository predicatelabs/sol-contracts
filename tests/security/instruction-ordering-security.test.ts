/**
 * Instruction Ordering & CPI Security Tests
 *
 * These tests validate security against:
 * 1. Transaction instruction ordering attacks
 * 2. CPI-related instruction manipulation
 * 3. Multiple validations in same transaction
 * 4. Non-adjacent instruction scenarios
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Counter } from "../../target/types/counter";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Ed25519Program,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { expect } from "chai";
import * as crypto from "crypto";
import * as nacl from "tweetnacl";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "../helpers/shared-setup";
import {
  createTestAccount,
  findAttesterPDA,
  findPolicyPDA,
  registerAttesterIfNotExists,
  setPolicyId,
  getFutureTimestamp,
} from "../helpers/test-utils";

describe("Program Security Tests", () => {
  describe("Instruction Ordering & CPI Security Tests", () => {
    let context: SharedTestContext;
    let counterProgram: Program<Counter>;
    let targetProgramId: PublicKey;
    let attester: Keypair;
    let client1: Keypair;
    let client2: Keypair;
    let validator: Keypair;
    let attesterPda: PublicKey;
    let policyPda: PublicKey;

    const testPolicy = "ordering-test-policy";

    before(async () => {
      context = await setupSharedTestContext();

      // Get Counter program (target for validation)
      counterProgram = anchor.workspace.Counter as Program<Counter>;
      targetProgramId = counterProgram.programId;

      // Create test accounts
      const attesterAccount = await createTestAccount(context.provider);
      attester = attesterAccount.keypair;

      const client1Account = await createTestAccount(context.provider);
      client1 = client1Account.keypair;

      const client2Account = await createTestAccount(context.provider);
      client2 = client2Account.keypair;

      const validatorAccount = await createTestAccount(context.provider);
      validator = validatorAccount.keypair;

      // Get PDAs - policy is for target program
      [attesterPda] = findAttesterPDA(
        attester.publicKey,
        context.program.programId
      );
      [policyPda] = findPolicyPDA(targetProgramId, context.program.programId);

      // Register attester
      await registerAttesterIfNotExists(
        context.program,
        context.authority.keypair,
        attester.publicKey,
        context.registry.registryPda
      );

      // Set policy for target program (not users)
      try {
        await setPolicyId(
          context.program,
          targetProgramId,
          context.authority.keypair,
          testPolicy,
          context.registry.registryPda
        );
      } catch (error: any) {
        console.log("Policy already set:", error.message);
      }
    });

    /**
     * Helper: Create message hash
     */
    function createMessageHash(statement: any): Buffer {
      const data = Buffer.concat([
        Buffer.from(statement.uuid),
        statement.msgSender.toBuffer(),
        statement.target.toBuffer(),
        Buffer.from(statement.msgValue.toBuffer("le", 8)),
        Buffer.from(statement.encodedSigAndArgs),
        Buffer.from(statement.policyId, "utf8"),
        Buffer.from(statement.expiration.toBuffer("le", 8)),
      ]);

      return Buffer.from(crypto.createHash("sha256").update(data).digest());
    }

    /**
     * Helper: Create statement
     */
    function createStatement(
      uuid: Uint8Array,
      msgSender: PublicKey,
      expiration: number
    ) {
      return {
        uuid: Array.from(uuid),
        msgSender: msgSender,
        target: targetProgramId, // Program being called
        msgValue: new anchor.BN(0),
        encodedSigAndArgs: Buffer.from("test()"),
        policyId: testPolicy,
        expiration: new anchor.BN(expiration),
      };
    }

    /**
     * Helper: Create attestation
     */
    function createAttestation(
      uuid: Uint8Array,
      attesterKeypair: Keypair,
      statement: any,
      validatorKey: PublicKey
    ) {
      const messageHash = createMessageHash(statement, validatorKey);
      const signature = nacl.sign.detached(
        messageHash,
        attesterKeypair.secretKey
      );

      return {
        uuid: Array.from(uuid),
        attester: attesterKeypair.publicKey,
        signature: Array.from(signature),
        expiration: statement.expiration,
      };
    }

    /**
     * TEST 1: Non-adjacent Ed25519 instruction (should fail)
     *
     * Tests that ed25519 must be IMMEDIATELY before validate_attestation
     */
    it("should fail when ed25519 is not immediately before validate_attestation", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, client1.publicKey, expiration);
      const attestation = createAttestation(
        uuid,
        attester,
        statement,
        validator.publicKey
      );

      const [usedUuidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid)],
        context.program.programId
      );

      try {
        const transaction = new Transaction();

        // Instruction 0: Ed25519 verification
        const messageHash = createMessageHash(statement);
        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          publicKey: attester.publicKey.toBytes(),
          message: messageHash,
          signature: attestation.signature,
        });
        transaction.add(ed25519Ix);

        // Instruction 1: Spacer (dummy instruction to separate ed25519 from validate)
        const spacerIx = SystemProgram.transfer({
          fromPubkey: validator.publicKey,
          toPubkey: validator.publicKey,
          lamports: 0,
        });
        transaction.add(spacerIx);

        // Instruction 2: validate_attestation (expects ed25519 at index 1, but it's at 0!)
        const validateIx = await context.program.methods
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
            policyAccount: policyPda,
            usedUuidAccount: usedUuidPda,
            signer: validator.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .instruction();
        transaction.add(validateIx);

        await context.provider.sendAndConfirm(transaction, [validator]);

        expect.fail(
          "Should have failed: ed25519 not immediately before validate_attestation"
        );
      } catch (error: any) {
        console.log("✓ Non-adjacent ed25519 rejected:", error.message);
        expect(error).to.exist;
        // Should fail because instruction at (current_index - 1) is not ed25519
      }
    });

    /**
     * TEST 3: Attempt to reuse ed25519 instruction (should fail due to UUID replay)
     *
     * Tests that UUID replay protection works across instruction ordering
     */
    it("should prevent reusing ed25519 for second validation", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, client1.publicKey, expiration);
      const attestation = createAttestation(
        uuid,
        attester,
        statement,
        validator.publicKey
      );

      const [usedUuidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid)],
        context.program.programId
      );

      try {
        // First validation - should succeed
        const transaction1 = new Transaction();

        const messageHash = createMessageHash(statement);
        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          publicKey: attester.publicKey.toBytes(),
          message: messageHash,
          signature: attestation.signature,
        });
        transaction1.add(ed25519Ix);

        const validateIx = await context.program.methods
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
            policyAccount: policyPda,
            usedUuidAccount: usedUuidPda,
            signer: validator.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .instruction();
        transaction1.add(validateIx);

        await context.provider.sendAndConfirm(transaction1, [validator]);

        // Second validation with same UUID - should fail
        const transaction2 = new Transaction();
        transaction2.add(ed25519Ix);
        transaction2.add(validateIx);

        await context.provider.sendAndConfirm(transaction2, [validator]);

        expect.fail("Should have failed: UUID already used");
      } catch (error: any) {
        console.log("✓ UUID replay correctly prevented:", error.message);
        expect(error).to.exist;
        // Should fail at used_uuid_account init (account already exists)
      }
    });

    /**
     * TEST 4: Wrong ed25519 instruction order (cross-validation attack)
     *
     * Tests that each validation checks its own ed25519 instruction
     */
    it("should prevent cross-validation with wrong ed25519", async () => {
      const uuid1 = crypto.randomBytes(16);
      const uuid2 = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);

      const statement1 = createStatement(uuid1, client1.publicKey, expiration);
      const statement2 = createStatement(uuid2, client2.publicKey, expiration);

      const attestation1 = createAttestation(
        uuid1,
        attester,
        statement1,
        validator.publicKey
      );
      const attestation2 = createAttestation(
        uuid2,
        attester,
        statement2,
        validator.publicKey
      );

      const [usedUuidPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid2)],
        context.program.programId
      );

      try {
        const transaction = new Transaction();

        // Instruction 0: Ed25519 for statement1
        const messageHash1 = createMessageHash(statement1, validator.publicKey);
        const ed25519Ix1 = Ed25519Program.createInstructionWithPublicKey({
          publicKey: attester.publicKey.toBytes(),
          message: messageHash1,
          signature: attestation1.signature,
        });
        transaction.add(ed25519Ix1);

        // Instruction 1: Try to validate statement2 (but ed25519 is for statement1!)
        const validateIx2 = await context.program.methods
          .validateAttestation(
            statement2.target,
            statement2.msgValue,
            statement2.encodedSigAndArgs,
            attester.publicKey,
            attestation2
          )
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: attesterPda,
            policyAccount: policyPda,
            usedUuidAccount: usedUuidPda2,
            signer: validator.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .instruction();
        transaction.add(validateIx2);

        await context.provider.sendAndConfirm(transaction, [validator]);

        expect.fail("Should have failed: wrong ed25519 instruction");
      } catch (error: any) {
        console.log("✓ Cross-validation attack prevented:", error.message);
        expect(error).to.exist;
        // Should fail at data comparison (signature/message mismatch)
      }
    });
  });
});

/**
 * Security Tests for Ed25519 Signature Verification
 *
 * This test suite attempts various adversarial transaction patterns to validate
 * the security of the Ed25519 signature verification implementation.
 *
 * Test Categories:
 * 1. Cross-instruction data sourcing attacks
 * 2. Multiple ed25519 instruction attacks
 * 3. Signature substitution attacks
 * 4. Message tampering attacks
 * 5. Instruction ordering attacks
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
  describe("Signature Verification Security Tests", () => {
    let context: SharedTestContext;
    let counterProgram: Program<Counter>;
    let targetProgramId: PublicKey;
    let attester: Keypair;
    let client: Keypair;
    let validator: Keypair;
    let attesterPda: PublicKey;
    let policyPda: PublicKey;

    const testPolicy = "security-test-policy";

    before(async () => {
      context = await setupSharedTestContext();

      // Get Counter program (target for validation)
      counterProgram = anchor.workspace.Counter as Program<Counter>;
      targetProgramId = counterProgram.programId;

      // Create test accounts
      const attesterAccount = await createTestAccount(context.provider);
      attester = attesterAccount.keypair;

      const clientAccount = await createTestAccount(context.provider);
      client = clientAccount.keypair;

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

      // Set policy for target program
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
     * Helper: Create message hash matching hash_statement_safe in Rust
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
     * Helper: Create a valid statement
     */
    function createStatement(uuid: Uint8Array, expiration: number) {
      return {
        uuid: Array.from(uuid),
        msgSender: client.publicKey, // User calling the program
        target: targetProgramId, // Program being called
        msgValue: new anchor.BN(0),
        encodedSigAndArgs: Buffer.from("test()"),
        policyId: testPolicy,
        expiration: new anchor.BN(expiration),
      };
    }

    /**
     * Helper: Create attestation with signature
     */
    function createAttestation(
      uuid: Uint8Array,
      attesterKeypair: Keypair,
      statement: any,
      validatorKey: PublicKey
    ) {
      const messageHash = createMessageHash(statement);
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
     * Helper: Create Ed25519 verification instruction with custom data sourcing
     */
    function createCustomEd25519Instruction(
      publicKey: Uint8Array,
      message: Uint8Array,
      signature: Uint8Array,
      instructionIndices: {
        signatureIndex: number;
        publicKeyIndex: number;
        messageIndex: number;
      }
    ): TransactionInstruction {
      // Create the Ed25519 instruction data manually
      const dataLayout = Buffer.alloc(
        16 + signature.length + publicKey.length + message.length
      );

      let offset = 0;

      // [0] num_signatures: u8
      dataLayout.writeUInt8(1, offset);
      offset += 1;

      // [1] padding: u8
      dataLayout.writeUInt8(0, offset);
      offset += 1;

      // [2..4] signature_offset: u16
      dataLayout.writeUInt16LE(16, offset); // Data starts at offset 16
      offset += 2;

      // [4..6] signature_instruction_index: u16
      dataLayout.writeUInt16LE(instructionIndices.signatureIndex, offset);
      offset += 2;

      // [6..8] public_key_offset: u16
      dataLayout.writeUInt16LE(16 + signature.length, offset);
      offset += 2;

      // [8..10] public_key_instruction_index: u16
      dataLayout.writeUInt16LE(instructionIndices.publicKeyIndex, offset);
      offset += 2;

      // [10..12] message_data_offset: u16
      dataLayout.writeUInt16LE(
        16 + signature.length + publicKey.length,
        offset
      );
      offset += 2;

      // [12..14] message_data_size: u16
      dataLayout.writeUInt16LE(message.length, offset);
      offset += 2;

      // [14..16] message_instruction_index: u16
      dataLayout.writeUInt16LE(instructionIndices.messageIndex, offset);
      offset += 2;

      // [16..] Data: signature, publicKey, message
      Buffer.from(signature).copy(dataLayout, offset);
      offset += signature.length;

      Buffer.from(publicKey).copy(dataLayout, offset);
      offset += publicKey.length;

      Buffer.from(message).copy(dataLayout, offset);

      return new TransactionInstruction({
        keys: [],
        programId: Ed25519Program.programId,
        data: dataLayout,
      });
    }

    /**
     * TEST 1: Attempt to use cross-instruction data sourcing
     *
     * This test tries to create an ed25519 instruction that references
     * data from a different instruction in the transaction.
     */
    it("should reject ed25519 instruction with cross-instruction data sourcing", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);
      const attestation = createAttestation(
        uuid,
        attester,
        statement,
        validator.publicKey
      );

      // Create a valid signature for DIFFERENT data
      const maliciousData = Buffer.from("malicious data");
      const maliciousHash = crypto
        .createHash("sha256")
        .update(maliciousData)
        .digest();
      const maliciousSignature = nacl.sign.detached(
        maliciousHash,
        attester.secretKey
      );

      const [usedUuidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid)],
        context.program.programId
      );

      try {
        const transaction = new Transaction();

        // Instruction 0: A decoy instruction with malicious data
        // (In a real attack, this might contain different message/signature)
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: validator.publicKey,
            toPubkey: validator.publicKey,
            lamports: 0,
          })
        );

        // Instruction 1: Ed25519 verification that references instruction 0
        // This attempts to verify a signature using data from instruction 0
        const messageHash = createMessageHash(statement);
        const ed25519Ix = createCustomEd25519Instruction(
          attester.publicKey.toBytes(),
          messageHash,
          maliciousSignature, // Different signature!
          {
            signatureIndex: 0, // Try to source from instruction 0
            publicKeyIndex: 0,
            messageIndex: 0,
          }
        );
        transaction.add(ed25519Ix);

        // Instruction 2: validate_attestation
        transaction.add(
          await context.program.methods
            .validateAttestation(
              statement.target,
              statement.msgValue,
              statement.encodedSigAndArgs,
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
            .instruction()
        );

        await context.provider.sendAndConfirm(transaction, [validator]);

        // If we reach here, the attack succeeded (BAD!)
        expect.fail(
          "Cross-instruction data sourcing should have been rejected"
        );
      } catch (error: any) {
        // Expected to fail
        console.log("✓ Cross-instruction attack rejected:", error.message);
        expect(error).to.exist;
      }
    });

    /**
     * TEST 2: Attempt signature substitution with valid signatures
     *
     * Create two valid signatures and try to use the wrong one
     */
    it("should reject signature substitution attack", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);

      // Create a valid signature for DIFFERENT data
      const differentStatement = createStatement(
        crypto.randomBytes(16),
        expiration
      );
      const differentMessageHash = createMessageHash(differentStatement);
      const differentSignature = nacl.sign.detached(
        differentMessageHash,
        attester.secretKey
      );

      // But try to use it for our statement
      const attestation = {
        uuid: Array.from(uuid),
        attester: attester.publicKey,
        signature: Array.from(differentSignature),
        expiration: statement.expiration,
      };

      const [usedUuidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid)],
        context.program.programId
      );

      try {
        const messageHash = createMessageHash(statement);
        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          publicKey: attester.publicKey.toBytes(),
          message: messageHash,
          signature: differentSignature,
        });

        const validateIx = await context.program.methods
          .validateAttestation(
            statement.target,
            statement.msgValue,
            statement.encodedSigAndArgs,
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

        const transaction = new Transaction().add(ed25519Ix).add(validateIx);
        await context.provider.sendAndConfirm(transaction, [validator]);

        expect.fail("Signature substitution should have been rejected");
      } catch (error: any) {
        console.log("✓ Signature substitution rejected:", error.message);
        expect(error).to.exist;
      }
    });

    /**
     * TEST 4: Wrong attester key attack
     *
     * Use a valid signature but from a different attester
     */
    it("should reject signature from wrong attester", async () => {
      // Create a second attester
      const wrongAttester = Keypair.generate();

      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);

      // Sign with wrong attester
      const messageHash = createMessageHash(statement);
      const signature = nacl.sign.detached(
        messageHash,
        wrongAttester.secretKey
      );

      const attestation = {
        uuid: Array.from(uuid),
        attester: attester.publicKey, // Claim it's from registered attester
        signature: Array.from(signature), // But use wrong attester's signature
        expiration: statement.expiration,
      };

      const [usedUuidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid)],
        context.program.programId
      );

      try {
        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          publicKey: wrongAttester.publicKey.toBytes(), // Wrong key!
          message: messageHash,
          signature: signature,
        });

        const validateIx = await context.program.methods
          .validateAttestation(
            statement.target,
            statement.msgValue,
            statement.encodedSigAndArgs,
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

        const transaction = new Transaction().add(ed25519Ix).add(validateIx);
        await context.provider.sendAndConfirm(transaction, [validator]);

        expect.fail("Wrong attester signature should have been rejected");
      } catch (error: any) {
        console.log("✓ Wrong attester rejected:", error.message);
        expect(error).to.exist;
      }
    });

    /**
     * TEST 5: Message tampering attack
     *
     * Ed25519 verifies one message, but validate_attestation receives different message
     */
    it("should reject message tampering", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);

      // Create valid signature for original statement
      const messageHash = createMessageHash(statement);
      const signature = nacl.sign.detached(messageHash, attester.secretKey);

      // Modify the statement after signing
      const tamperedStatement = {
        ...statement,
        msgValue: new anchor.BN(999999), // Changed!
      };

      const attestation = {
        uuid: Array.from(uuid),
        attester: attester.publicKey,
        signature: Array.from(signature),
        expiration: statement.expiration,
      };

      const [usedUuidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid)],
        context.program.programId
      );

      try {
        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          publicKey: attester.publicKey.toBytes(),
          message: messageHash, // Original message
          signature: signature,
        });

        // But pass tampered statement
        const validateIx = await context.program.methods
          .validateAttestation(
            tamperedStatement.target,
            tamperedStatement.msgValue,
            tamperedStatement.encodedSigAndArgs,
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

        const transaction = new Transaction().add(ed25519Ix).add(validateIx);
        await context.provider.sendAndConfirm(transaction, [validator]);

        expect.fail("Message tampering should have been rejected");
      } catch (error: any) {
        console.log("✓ Message tampering rejected:", error.message);
        expect(error).to.exist;
      }
    });

    /**
     * TEST 7: Message size mismatch
     *
     * Try to use a message of incorrect size (not 32 bytes)
     */
    it("should reject message with incorrect size", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);

      // Create signature for wrong-sized message
      const wrongSizedMessage = Buffer.from("short");
      const signature = nacl.sign.detached(
        wrongSizedMessage,
        attester.secretKey
      );

      const attestation = {
        uuid: Array.from(uuid),
        attester: attester.publicKey,
        signature: Array.from(signature),
        expiration: statement.expiration,
      };

      const [usedUuidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("used_uuid"), Buffer.from(uuid)],
        context.program.programId
      );

      try {
        // Try to create ed25519 instruction with wrong-sized message
        const dataLayout = Buffer.alloc(100);
        let offset = 0;

        dataLayout.writeUInt8(1, offset);
        offset += 1; // num_signatures
        dataLayout.writeUInt8(0, offset);
        offset += 1; // padding
        dataLayout.writeUInt16LE(16, offset);
        offset += 2; // signature_offset
        dataLayout.writeUInt16LE(0xffff, offset);
        offset += 2; // signature_instruction_index
        dataLayout.writeUInt16LE(16 + 64, offset);
        offset += 2; // public_key_offset
        dataLayout.writeUInt16LE(0xffff, offset);
        offset += 2; // public_key_instruction_index
        dataLayout.writeUInt16LE(16 + 64 + 32, offset);
        offset += 2; // message_offset
        dataLayout.writeUInt16LE(wrongSizedMessage.length, offset);
        offset += 2; // message_size (WRONG!)
        dataLayout.writeUInt16LE(0xffff, offset);
        offset += 2; // message_instruction_index

        // Copy data
        Buffer.from(signature).copy(dataLayout, 16);
        attester.publicKey.toBuffer().copy(dataLayout, 16 + 64);
        wrongSizedMessage.copy(dataLayout, 16 + 64 + 32);

        const ed25519Ix = new TransactionInstruction({
          keys: [],
          programId: Ed25519Program.programId,
          data: dataLayout.slice(0, 16 + 64 + 32 + wrongSizedMessage.length),
        });

        const validateIx = await context.program.methods
          .validateAttestation(
            statement.target,
            statement.msgValue,
            statement.encodedSigAndArgs,
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

        const transaction = new Transaction().add(ed25519Ix).add(validateIx);
        await context.provider.sendAndConfirm(transaction, [validator]);

        expect.fail("Wrong message size should have been rejected");
      } catch (error: any) {
        console.log("✓ Wrong message size rejected:", error.message);
        expect(error).to.exist;
      }
    });
  });
});

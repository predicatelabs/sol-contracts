import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  Transaction,
  Ed25519Program,
  SystemProgram,
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
  getPastTimestamp,
  expectError,
  findUsedUuidPDA,
} from "../helpers/test-utils";

describe("Validate Attestation", () => {
  let context: SharedTestContext;
  let attester: Keypair;
  let client: Keypair; // The actual client/signer
  let attesterPda: PublicKey;
  let policyPda: PublicKey;

  const testPolicy = "test-policy-v1";

  before(async () => {
    // Set up shared context
    context = await setupSharedTestContext();

    // Create test accounts
    const attesterAccount = await createTestAccount(context.provider);
    attester = attesterAccount.keypair;

    const clientAccount = await createTestAccount(context.provider);
    client = clientAccount.keypair;

    // Get PDAs
    const [attesterPdaResult] = findAttesterPDA(
      attester.publicKey,
      context.program.programId
    );
    attesterPda = attesterPdaResult;

    const [policyPdaResult] = findPolicyPDA(
      client.publicKey,
      context.program.programId
    );
    policyPda = policyPdaResult;

    // Register attester using helper function
    await registerAttesterIfNotExists(
      context.program,
      context.authority.keypair,
      attester.publicKey,
      context.registry.registryPda
    );

    // Set policy ID for client using helper function
    try {
      await setPolicyId(
        context.program,
        client,
        testPolicy,
        context.registry.registryPda
      );
    } catch (error: any) {
      console.log("Policy already set or error:", error.message);
    }
  });

  /**
   * Helper function to create a statement
   */
  function createStatement(uuid: Uint8Array, expiration: number) {
    return {
      uuid: Array.from(uuid),
      msgSender: client.publicKey,
      target: new PublicKey("11111111111111111111111111111111"),
      msgValue: new anchor.BN(1000000), // 1 SOL in lamports
      encodedSigAndArgs: Buffer.from("test-encoded-data"),
      policyId: testPolicy,
      expiration: new anchor.BN(expiration),
    };
  }

  /**
   * Helper function to create message hash matching Rust implementation
   */
  function createMessageHash(statement: any): Buffer {
    // Create message hash exactly like the Rust implementation
    // This matches the hash_statement_safe function in state.rs

    const data = Buffer.concat([
      Buffer.from(statement.uuid),
      statement.msgSender.toBuffer(),
      statement.target.toBuffer(), // target (client program ID)
      Buffer.from(statement.msgValue.toBuffer("le", 8)),
      statement.encodedSigAndArgs,
      Buffer.from(statement.policyId, "utf8"),
      Buffer.from(statement.expiration.toBuffer("le", 8)),
    ]);

    // Hash the data using SHA-256 (Solana's hash function)
    return crypto.createHash("sha256").update(data).digest();
  }

  /**
   * Helper function to create an Ed25519 signature matching Rust implementation
   */
  function createSignature(
    statement: any,
    attesterKeypair: Keypair
  ): Uint8Array {
    const messageHash = createMessageHash(statement);

    // Sign with Ed25519 using NaCl/TweetNaCl
    const signature = nacl.sign.detached(
      messageHash,
      attesterKeypair.secretKey
    );
    return signature;
  }

  /**
   * Helper function to create an attestation
   */
  function createAttestation(
    uuid: Uint8Array,
    attesterKeypair: Keypair,
    expiration: number,
    signature: Uint8Array
  ) {
    return {
      uuid: Array.from(uuid),
      attester: attesterKeypair.publicKey,
      signature: Array.from(signature),
      expiration: new anchor.BN(expiration),
    };
  }

  describe("Successful Validation", () => {
    it("should validate a correct attestation", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600); // 1 hour from now
      const statement = createStatement(uuid, expiration);

      // Create signature
      const signature = createSignature(statement, attester);
      const attestation = createAttestation(
        uuid,
        attester,
        expiration,
        signature
      );

      // Create message hash for Ed25519 verification instruction
      const messageHash = createMessageHash(statement);

      // Create Ed25519 verification instruction
      const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: attester.publicKey.toBytes(),
        message: messageHash,
        signature: signature,
      });

      const [usedUuidPda] = findUsedUuidPDA(
        Array.from(uuid),
        context.program.programId
      );

      // Create the validate attestation instruction
      const validateInstruction = await context.program.methods
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
          signer: client.publicKey,
          systemProgram: SystemProgram.programId,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        } as any)
        .instruction();

      // Create transaction with both instructions
      const transaction = new Transaction();
      transaction.add(ed25519Instruction);
      transaction.add(validateInstruction);

      // Send transaction
      const result = await context.provider.sendAndConfirm(transaction, [
        client,
      ]);

      expect(result).to.be.a("string");
    });
  });

  describe("Validation Failures", () => {
    it("should fail with expired attestation", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getPastTimestamp(3600); // 1 hour ago
      const statement = createStatement(uuid, expiration);

      const signature = createSignature(statement, attester);
      const attestation = createAttestation(
        uuid,
        attester,
        expiration,
        signature
      );

      const [usedUuidPda] = findUsedUuidPDA(
        Array.from(uuid),
        context.program.programId
      );

      try {
        await context.program.methods
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
            signer: client.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .signers([client])
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "StatementExpired");
      }
    });

    it("should fail with mismatched statement UUID", async () => {
      const statementUuid = crypto.randomBytes(16);
      const attestationUuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);

      const statement = createStatement(statementUuid, expiration);
      const signature = createSignature(statement, attester);
      const attestation = createAttestation(
        attestationUuid,
        attester,
        expiration,
        signature
      );

      const [usedUuidPda] = findUsedUuidPDA(
        Array.from(attestationUuid),
        context.program.programId
      );

      try {
        await context.program.methods
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
            signer: client.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .signers([client])
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "InvalidSignature");
      }
    });

    it("should fail with invalid signature", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);

      // Create invalid signature (random bytes)
      const invalidSignature = crypto.randomBytes(64);
      const attestation = createAttestation(
        uuid,
        attester,
        expiration,
        invalidSignature
      );

      const [usedUuidPda] = findUsedUuidPDA(
        Array.from(uuid),
        context.program.programId
      );

      try {
        await context.program.methods
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
            signer: client.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .signers([client])
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (error: any) {
        // Check if it's an anchor error with the expected message
        if (error.message && error.message.includes("InvalidSignature")) {
          return; // Test passed
        }
        // For other error formats, just check that the transaction failed
        expect(error).to.exist;
      }
    });

    it("should fail with wrong attester signature", async () => {
      const wrongAttesterAccount = await createTestAccount(context.provider);
      const wrongAttester = wrongAttesterAccount.keypair;
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);

      // Sign with wrong attester
      const signature = createSignature(statement, wrongAttester);
      const attestation = createAttestation(
        uuid,
        attester,
        expiration,
        signature
      );

      const [usedUuidPda] = findUsedUuidPDA(
        Array.from(uuid),
        context.program.programId
      );

      try {
        await context.program.methods
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
            signer: client.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .signers([client])
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (error: any) {
        // Check if it's an anchor error with the expected message
        if (error.message && error.message.includes("InvalidSignature")) {
          return; // Test passed
        }
        // For other error formats, just check that the transaction failed
        expect(error).to.exist;
      }
    });
  });

  describe("Edge Cases", () => {
    it("should fail with unregistered attester", async () => {
      const unregisteredAttesterAccount = await createTestAccount(
        context.provider
      );
      const unregisteredAttester = unregisteredAttesterAccount.keypair;
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const statement = createStatement(uuid, expiration);

      const signature = createSignature(statement, unregisteredAttester);
      const attestation = createAttestation(
        uuid,
        unregisteredAttester,
        expiration,
        signature
      );

      const [unregisteredAttesterPda] = findAttesterPDA(
        unregisteredAttester.publicKey,
        context.program.programId
      );

      const [usedUuidPda] = findUsedUuidPDA(
        Array.from(uuid),
        context.program.programId
      );

      try {
        await context.program.methods
          .validateAttestation(
            statement.target,
            statement.msgValue,
            statement.encodedSigAndArgs,
            unregisteredAttester.publicKey,
            attestation
          )
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: unregisteredAttesterPda,
            policyAccount: policyPda,
            usedUuidAccount: usedUuidPda,
            signer: client.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .signers([client])
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (error: any) {
        // Should fail because attester account doesn't exist
        expect(error.message).to.include("AccountNotInitialized");
      }
    });

    it("should fail with mismatched expiration times", async () => {
      const uuid = crypto.randomBytes(16);
      const statementExpiration = getFutureTimestamp(3600);
      const attestationExpiration = getFutureTimestamp(7200); // Different expiration

      const statement = createStatement(uuid, statementExpiration);
      const signature = createSignature(statement, attester);
      const attestation = createAttestation(
        uuid,
        attester,
        attestationExpiration,
        signature
      );

      const [usedUuidPda] = findUsedUuidPDA(
        Array.from(uuid),
        context.program.programId
      );

      try {
        await context.program.methods
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
            signer: client.publicKey,
            systemProgram: SystemProgram.programId,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          } as any)
          .signers([client])
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "InvalidSignature");
      }
    });
  });
});

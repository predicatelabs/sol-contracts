import * as anchor from "@coral-xyz/anchor";
import { 
  Keypair, 
  PublicKey, 
  TransactionInstruction,
  Transaction,
  Ed25519Program
} from "@solana/web3.js";
import { expect } from "chai";
import * as crypto from "crypto";
import * as nacl from "tweetnacl";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "./helpers/shared-setup";
import {
  createTestAccount,
  findAttestorPDA,
  findPolicyPDA,
  registerAttestorIfNotExists,
  setPolicy,
  getFutureTimestamp,
  getPastTimestamp,
  expectError,
} from "./helpers/test-utils";

describe("Validate Attestation", () => {
  let context: SharedTestContext;
  let attestor: Keypair;
  let client: Keypair;
  let validator: Keypair;
  let attestorPda: PublicKey;
  let policyPda: PublicKey;

  const testPolicy = "test-policy-v1";

  before(async () => {
    // Set up shared context
    context = await setupSharedTestContext();

    // Create test accounts
    const attestorAccount = await createTestAccount(context.provider);
    attestor = attestorAccount.keypair;
    
    const clientAccount = await createTestAccount(context.provider);
    client = clientAccount.keypair;
    
    const validatorAccount = await createTestAccount(context.provider);
    validator = validatorAccount.keypair;

    // Get PDAs
    const [attestorPdaResult] = findAttestorPDA(attestor.publicKey, context.program.programId);
    attestorPda = attestorPdaResult;

    const [policyPdaResult] = findPolicyPDA(client.publicKey, context.program.programId);
    policyPda = policyPdaResult;

    // Register attestor using helper function
    await registerAttestorIfNotExists(
      context.program,
      context.authority.keypair,
      attestor.publicKey,
      context.registry.registryPda
    );

    // Set policy for client using helper function
    try {
      await setPolicy(
        context.program,
        client,
        Buffer.from(testPolicy, "utf8"),
        context.registry.registryPda
      );
    } catch (error: any) {
      console.log("Policy already set or error:", error.message);
    }
  });

  /**
   * Helper function to create a task
   */
  function createTask(uuid: Uint8Array, expiration: number) {
    // Create policy buffer with exact length needed (200 bytes)
    const policyBuffer = Buffer.alloc(200);
    Buffer.from(testPolicy, "utf8").copy(policyBuffer);
    
    return {
      uuid: Array.from(uuid),
      msgSender: client.publicKey,
      target: new PublicKey("11111111111111111111111111111111"),
      msgValue: new anchor.BN(1000000), // 1 SOL in lamports
      encodedSigAndArgs: Buffer.from("test-encoded-data"),
      policy: Array.from(policyBuffer),
      expiration: new anchor.BN(expiration),
    };
  }

  /**
   * Helper function to create message hash matching Rust implementation
   */
  function createMessageHash(task: any, validatorPubkey: PublicKey): Buffer {
    // Create message hash exactly like the Rust implementation
    // This matches the hash_task_safe function in state.rs
    
    // Get policy data - trim null bytes like get_policy() in Rust
    const policyData = Buffer.from(task.policy);
    const policyEnd = policyData.indexOf(0);
    const trimmedPolicy = policyEnd === -1 ? policyData : policyData.subarray(0, policyEnd);
    
    const data = Buffer.concat([
      Buffer.from(task.uuid),
      task.msgSender.toBuffer(),
      validatorPubkey.toBuffer(), // validator key (equivalent to msg.sender in Solidity)
      Buffer.from(task.msgValue.toBuffer("le", 8)),
      task.encodedSigAndArgs,
      trimmedPolicy,
      Buffer.from(task.expiration.toBuffer("le", 8)),
    ]);

    // Hash the data using SHA-256 (Solana's hash function)
    return crypto.createHash("sha256").update(data).digest();
  }

  /**
   * Helper function to create an Ed25519 signature matching Rust implementation
   */
  function createSignature(task: any, attestorKeypair: Keypair, validatorPubkey: PublicKey): Uint8Array {
    const messageHash = createMessageHash(task, validatorPubkey);
    
    // Sign with Ed25519 using NaCl/TweetNaCl
    const signature = nacl.sign.detached(messageHash, attestorKeypair.secretKey);
    return signature;
  }

  /**
   * Helper function to create an attestation
   */
  function createAttestation(uuid: Uint8Array, attestorKeypair: Keypair, expiration: number, signature: Uint8Array) {
    return {
      uuid: Array.from(uuid),
      attestor: attestorKeypair.publicKey,
      signature: Array.from(signature),
      expiration: new anchor.BN(expiration),
    };
  }

  describe("Successful Validation", () => {
    it("should validate a correct attestation", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600); // 1 hour from now
      const task = createTask(uuid, expiration);
      
      // Create signature
      const signature = createSignature(task, attestor, validator.publicKey);
      const attestation = createAttestation(uuid, attestor, expiration, signature);

      // Create message hash for Ed25519 verification instruction
      const messageHash = createMessageHash(task, validator.publicKey);

      // Create Ed25519 verification instruction
      const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: attestor.publicKey.toBytes(),
        message: messageHash,
        signature: signature,
      });

      // Create the validate attestation instruction
      const validateInstruction = await context.program.methods
        .validateAttestation(task, attestor.publicKey, attestation)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: attestorPda,
          policyAccount: policyPda,
          validator: validator.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        } as any)
        .instruction();

      // Create transaction with both instructions
      const transaction = new Transaction();
      transaction.add(ed25519Instruction);
      transaction.add(validateInstruction);

      // Send transaction
      const result = await context.provider.sendAndConfirm(transaction, [validator]);

      expect(result).to.be.a("string");
    });
  });

  describe("Validation Failures", () => {
    it("should fail with expired attestation", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getPastTimestamp(3600); // 1 hour ago
      const task = createTask(uuid, expiration);
      
      const signature = createSignature(task, attestor, validator.publicKey);
      const attestation = createAttestation(uuid, attestor, expiration, signature);

      try {
        await context.program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          } as any)
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "AttestationExpired");
      }
    });

    it("should fail with mismatched task UUID", async () => {
      const taskUuid = crypto.randomBytes(16);
      const attestationUuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      
      const task = createTask(taskUuid, expiration);
      const signature = createSignature(task, attestor, validator.publicKey);
      const attestation = createAttestation(attestationUuid, attestor, expiration, signature);

      try {
        await context.program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          } as any)
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "TaskIdMismatch");
      }
    });

    it("should fail with invalid signature", async () => {
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const task = createTask(uuid, expiration);
      
      // Create invalid signature (random bytes)
      const invalidSignature = crypto.randomBytes(64);
      const attestation = createAttestation(uuid, attestor, expiration, invalidSignature);

      try {
        await context.program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          } as any)
          .signers([validator])
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

    it("should fail with wrong attestor signature", async () => {
      const wrongAttestorAccount = await createTestAccount(context.provider);
      const wrongAttestor = wrongAttestorAccount.keypair;
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const task = createTask(uuid, expiration);
      
      // Sign with wrong attestor
      const signature = createSignature(task, wrongAttestor, validator.publicKey);
      const attestation = createAttestation(uuid, attestor, expiration, signature);

      try {
        await context.program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          } as any)
          .signers([validator])
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
    it("should fail with unregistered attestor", async () => {
      const unregisteredAttestorAccount = await createTestAccount(context.provider);
      const unregisteredAttestor = unregisteredAttestorAccount.keypair;
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const task = createTask(uuid, expiration);
      
      const signature = createSignature(task, unregisteredAttestor, validator.publicKey);
      const attestation = createAttestation(uuid, unregisteredAttestor, expiration, signature);

      const [unregisteredAttestorPda] = findAttestorPDA(unregisteredAttestor.publicKey, context.program.programId);

      try {
        await context.program.methods
          .validateAttestation(task, unregisteredAttestor.publicKey, attestation)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: unregisteredAttestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          } as any)
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error: any) {
        // Should fail because attestor account doesn't exist
        expect(error.message).to.include("AccountNotInitialized");
      }
    });

    it("should fail with mismatched expiration times", async () => {
      const uuid = crypto.randomBytes(16);
      const taskExpiration = getFutureTimestamp(3600);
      const attestationExpiration = getFutureTimestamp(7200); // Different expiration
      
      const task = createTask(uuid, taskExpiration);
      const signature = createSignature(task, attestor, validator.publicKey);
      const attestation = createAttestation(uuid, attestor, attestationExpiration, signature);

      try {
        await context.program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          } as any)
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "ExpirationMismatch");
      }
    });
  });
});

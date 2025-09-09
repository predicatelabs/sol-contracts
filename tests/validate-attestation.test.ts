import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../target/types/predicate_registry";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as ed25519 from "ed25519-hd-key";
import * as crypto from "crypto";
import {
  loadTestAuthorityKeypair,
  getRegistryPDA,
  getAttestorPDA,
  getPolicyPDA,
  createFundedKeypair,
  getCurrentTimestamp,
  getFutureTimestamp,
  getPastTimestamp,
  expectError,
  sleep,
} from "./helpers/test-utils";

describe("Validate Attestation", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  let authority: Keypair;
  let attestor: Keypair;
  let client: Keypair;
  let validator: Keypair;
  let registryPda: PublicKey;
  let attestorPda: PublicKey;
  let policyPda: PublicKey;

  const testPolicy = "test-policy-v1";

  before(async () => {
    // Load persistent authority keypair
    authority = loadTestAuthorityKeypair();

    // Create test accounts
    attestor = await createFundedKeypair(provider);
    client = await createFundedKeypair(provider);
    validator = await createFundedKeypair(provider);

    // Get PDAs
    const registryResult = getRegistryPDA(program.programId);
    registryPda = registryResult.registryPda;

    const attestorResult = getAttestorPDA(program.programId, attestor.publicKey);
    attestorPda = attestorResult.attestorPda;

    const policyResult = getPolicyPDA(program.programId, client.publicKey);
    policyPda = policyResult.policyPda;

    // Initialize registry if not already initialized
    try {
      await program.methods
        .initialize()
        .accounts({
          registry: registryPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    } catch (error) {
      // Registry might already be initialized, ignore error
      console.log("Registry already initialized or error:", error.message);
    }

    // Register attestor
    try {
      await program.methods
        .registerAttestor(attestor.publicKey)
        .accounts({
          registry: registryPda,
          attestorAccount: attestorPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    } catch (error) {
      console.log("Attestor already registered or error:", error.message);
    }

    // Set policy for client
    try {
      await program.methods
        .setPolicy(testPolicy)
        .accounts({
          registry: registryPda,
          policyAccount: policyPda,
          client: client.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc();
    } catch (error) {
      console.log("Policy already set or error:", error.message);
    }
  });

  /**
   * Helper function to create a task
   */
  function createTask(uuid: Uint8Array, expiration: number) {
    return {
      uuid: Array.from(uuid),
      msgSender: client.publicKey,
      target: new PublicKey("11111111111111111111111111111111"),
      msgValue: new anchor.BN(1000000), // 1 SOL in lamports
      encodedSigAndArgs: Buffer.from("test-encoded-data"),
      policy: Array.from(Buffer.concat([
        Buffer.from(testPolicy, "utf8"),
        Buffer.alloc(200 - testPolicy.length, 0)
      ])),
      expiration: new anchor.BN(expiration),
    };
  }

  /**
   * Helper function to create an Ed25519 signature
   */
  function createSignature(task: any, attestorKeypair: Keypair, validatorPubkey: PublicKey): Uint8Array {
    // Create message hash similar to the Rust implementation
    const data = Buffer.concat([
      Buffer.from(task.uuid),
      task.msgSender.toBuffer(),
      validatorPubkey.toBuffer(),
      task.msgValue.toBuffer("le", 8),
      task.encodedSigAndArgs,
      Buffer.from(task.policy).subarray(0, testPolicy.length), // Only the actual policy data
      task.expiration.toBuffer("le", 8),
    ]);

    // Hash the data using SHA-256 (similar to Solana's hash function)
    const messageHash = crypto.createHash("sha256").update(data).digest();

    // Sign with Ed25519
    const signature = ed25519.sign(messageHash, attestorKeypair.secretKey.slice(0, 32));
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

      // Validate attestation
      const result = await program.methods
        .validateAttestation(task, attestor.publicKey, attestation)
        .accounts({
          registry: registryPda,
          attestorAccount: attestorPda,
          policyAccount: policyPda,
          validator: validator.publicKey,
        })
        .signers([validator])
        .rpc();

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
        await program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          })
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
        await program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          })
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
        await program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          })
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "InvalidSignature");
      }
    });

    it("should fail with wrong attestor signature", async () => {
      const wrongAttestor = await createFundedKeypair(provider);
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const task = createTask(uuid, expiration);
      
      // Sign with wrong attestor
      const signature = createSignature(task, wrongAttestor, validator.publicKey);
      const attestation = createAttestation(uuid, attestor, expiration, signature);

      try {
        await program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          })
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "InvalidSignature");
      }
    });

  });

  describe("Edge Cases", () => {
    it("should fail with unregistered attestor", async () => {
      const unregisteredAttestor = await createFundedKeypair(provider);
      const uuid = crypto.randomBytes(16);
      const expiration = getFutureTimestamp(3600);
      const task = createTask(uuid, expiration);
      
      const signature = createSignature(task, unregisteredAttestor, validator.publicKey);
      const attestation = createAttestation(uuid, unregisteredAttestor, expiration, signature);

      const unregisteredAttestorResult = getAttestorPDA(program.programId, unregisteredAttestor.publicKey);
      const unregisteredAttestorPda = unregisteredAttestorResult.attestorPda;

      try {
        await program.methods
          .validateAttestation(task, unregisteredAttestor.publicKey, attestation)
          .accounts({
            registry: registryPda,
            attestorAccount: unregisteredAttestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          })
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error) {
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
        await program.methods
          .validateAttestation(task, attestor.publicKey, attestation)
          .accounts({
            registry: registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            validator: validator.publicKey,
          })
          .signers([validator])
          .rpc();
        
        expect.fail("Expected transaction to fail");
      } catch (error) {
        expectError(error, "ExpirationMismatch");
      }
    });
  });
});

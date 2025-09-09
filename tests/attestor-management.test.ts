import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { 
  findAttestorPDA,
  registerAttestor,
  createFundedKeypair,
  createTestAccount,
} from "./helpers/test-utils";
import { setupSharedTestContext, SharedTestContext } from "./helpers/shared-setup";

describe("Attestor Management", () => {
  let context: SharedTestContext;

  before(async () => {
    context = await setupSharedTestContext();
  });

  describe("Attestor Registration", () => {
    it("Should register single attestor successfully", async () => {
      const attestor1 = await createTestAccount(context.provider);
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      const registryBefore = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

      const tx = await registerAttestor(
        context.program, 
        context.authority.keypair, 
        attestor1.keypair.publicKey, 
        context.registry.registryPda
      );

      expect(tx).to.be.a('string');

      // Verify attestor account state
      const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.attestor.toString()).to.equal(attestor1.keypair.publicKey.toString());
      expect(attestorAccount.isRegistered).to.be.true;
      expect(attestorAccount.registeredAt.toNumber()).to.be.greaterThan(0);

      // Verify registry statistics
      const registryAfter = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore + 1);
      expect(registryAfter.updatedAt.toNumber()).to.be.at.least(registryBefore.updatedAt.toNumber());
    });

    it("Should register multiple attestors", async () => {
      const attestor1 = await createTestAccount(context.provider);
      const attestor2 = await createTestAccount(context.provider);
      const attestors = [attestor1.keypair.publicKey, attestor2.keypair.publicKey];
      
      const initialRegistry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialCount = initialRegistry.totalAttestors.toNumber();
      
      for (let i = 0; i < attestors.length; i++) {
        await registerAttestor(context.program, context.authority.keypair, attestors[i], context.registry.registryPda);
        
        const registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
        expect(registryAccount.totalAttestors.toNumber()).to.equal(initialCount + i + 1);
      }
    });

    it("Should emit AttestorRegistered event", async () => {
      const attestor1 = await createTestAccount(context.provider);
      let eventReceived = false;
      
      const listener = context.program.addEventListener("attestorRegistered", (event: any) => {
        expect(event.registry.toString()).to.equal(context.registry.registryPda.toString());
        expect(event.attestor.toString()).to.equal(attestor1.keypair.publicKey.toString());
        expect(event.authority.toString()).to.equal(context.authority.keypair.publicKey.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
        eventReceived = true;
      });

      await registerAttestor(context.program, context.authority.keypair, attestor1.keypair.publicKey, context.registry.registryPda);
      
      // Wait a bit for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await context.program.removeEventListener(listener);
    });

    it("Should fail to register with unauthorized authority", async () => {
      const attestor1 = await createTestAccount(context.provider);
      const unauthorizedAuthority = await createFundedKeypair(context.provider);
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);

      try {
        await context.program.methods
          .registerAttestor(attestor1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            authority: unauthorizedAuthority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedAuthority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("Should fail to register same attestor twice", async () => {
      const attestor1 = await createTestAccount(context.provider);
      
      // First registration
      await registerAttestor(context.program, context.authority.keypair, attestor1.keypair.publicKey, context.registry.registryPda);

      // Second registration should fail
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      
      try {
        await context.program.methods
          .registerAttestor(attestor1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            authority: context.authority.keypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([context.authority.keypair])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("already in use");
      }
    });

    it("Should handle registration with different authority after transfer", async () => {
      const newAuthority = await createTestAccount(context.provider);
      const attestor1 = await createTestAccount(context.provider);
      
      // Transfer authority first
      await context.program.methods
        .transferAuthority(newAuthority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      // Register with new authority
      await registerAttestor(context.program, newAuthority.keypair, attestor1.keypair.publicKey, context.registry.registryPda);

      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.isRegistered).to.be.true;

      // Transfer authority back to original authority
      await context.program.methods
        .transferAuthority(context.authority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: newAuthority.keypair.publicKey,
          newAuthority: context.authority.keypair.publicKey,
        } as any)
        .signers([newAuthority.keypair])
        .rpc();
      
    });
  });

  describe("Attestor Deregistration", () => {
    let attestor1: any, attestor2: any;
    
    beforeEach(async () => {
      // Create fresh attestors for each test
      attestor1 = await createTestAccount(context.provider);
      attestor2 = await createTestAccount(context.provider);
      
      // Register attestors for deregistration tests
      await registerAttestor(context.program, context.authority.keypair, attestor1.keypair.publicKey, context.registry.registryPda);
      await registerAttestor(context.program, context.authority.keypair, attestor2.keypair.publicKey, context.registry.registryPda);
    });

    it("Should deregister attestor successfully", async () => {
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      const registryBefore = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

      await context.program.methods
        .deregisterAttestor(attestor1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: attestorPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Verify attestor is deregistered
      const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.isRegistered).to.be.false;
      expect(attestorAccount.attestor.toString()).to.equal(attestor1.keypair.publicKey.toString());

      // Verify registry statistics
      const registryAfter = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore - 1);
    });

    it("Should emit AttestorDeregistered event", async () => {
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      let eventReceived = false;

      const listener = context.program.addEventListener("attestorDeregistered", (event: any) => {
        expect(event.registry.toString()).to.equal(context.registry.registryPda.toString());
        expect(event.attestor.toString()).to.equal(attestor1.keypair.publicKey.toString());
        expect(event.authority.toString()).to.equal(context.authority.keypair.publicKey.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
        eventReceived = true;
      });

      await context.program.methods
        .deregisterAttestor(attestor1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: attestorPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await context.program.removeEventListener(listener);
    });

    it("Should fail to deregister with unauthorized authority", async () => {
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      const unauthorizedAuthority = await createFundedKeypair(context.provider);

      try {
        await context.program.methods
          .deregisterAttestor(attestor1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            authority: unauthorizedAuthority.publicKey,
          })
          .signers([unauthorizedAuthority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("Should fail to deregister non-registered attestor", async () => {
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      
      // First deregister
      await context.program.methods
        .deregisterAttestor(attestor1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: attestorPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Try to deregister again
      try {
        await context.program.methods
          .deregisterAttestor(attestor1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            authority: context.authority.keypair.publicKey,
          })
          .signers([context.authority.keypair])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("AttestorNotRegistered");
      }
    });

    it("Should fail to deregister non-existent attestor", async () => {
      const nonExistentAttestor = Keypair.generate();
      const [attestorPda] = findAttestorPDA(nonExistentAttestor.publicKey, context.program.programId);

      try {
        await context.program.methods
          .deregisterAttestor(nonExistentAttestor.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: attestorPda,
            authority: context.authority.keypair.publicKey,
          })
          .signers([context.authority.keypair])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("AccountNotInitialized");
      }
    });
  });

  describe("Re-registration", () => {
    it("Should allow re-registration of deregistered attestor", async () => {
      const attestor1 = await createTestAccount(context.provider);
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      
      // Register, deregister, then re-register
      await registerAttestor(context.program, context.authority.keypair, attestor1.keypair.publicKey, context.registry.registryPda);
      
      await context.program.methods
        .deregisterAttestor(attestor1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: attestorPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Verify deregistered
      let attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.isRegistered).to.be.false;

      // Re-register should work but fail because account already exists
      try {
        await registerAttestor(context.program, context.authority.keypair, attestor1.keypair.publicKey, context.registry.registryPda);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("already in use");
      }
    });

    it("Should maintain correct statistics during re-registration cycle", async () => {
      const attestor1 = await createTestAccount(context.provider);
      const initialRegistry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialCount = initialRegistry.totalAttestors.toNumber();

      // Register
      await registerAttestor(context.program, context.authority.keypair, attestor1.keypair.publicKey, context.registry.registryPda);
      let registry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registry.totalAttestors.toNumber()).to.equal(initialCount + 1);

      // Deregister
      const [attestorPda] = findAttestorPDA(attestor1.keypair.publicKey, context.program.programId);
      await context.program.methods
        .deregisterAttestor(attestor1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: attestorPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      registry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registry.totalAttestors.toNumber()).to.equal(initialCount);
    });
  });

  describe("Edge Cases", () => {
    it("Should handle maximum number of attestors gracefully", async () => {
      // Register multiple attestors to test counter limits
      const attestors: Keypair[] = [];
      for (let i = 0; i < 10; i++) {
        attestors.push(Keypair.generate());
      }

      const initialRegistry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialCount = initialRegistry.totalAttestors.toNumber();

      for (const attestor of attestors) {
        await registerAttestor(context.program, context.authority.keypair, attestor.publicKey, context.registry.registryPda);
      }

      const registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialCount + 10);
    });
  });
});

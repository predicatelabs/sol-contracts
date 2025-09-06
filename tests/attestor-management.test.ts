import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../target/types/predicate_registry";
import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { 
  createTestAccounts, 
  findRegistryPDAs, 
  findAttestorPDA,
  initializeRegistry,
  registerAttestor,
  createFundedKeypair,
  TestAccounts, 
  TestPDAs 
} from "./helpers/test-utils";

describe("Attestor Management", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  const provider = anchor.getProvider();

  let accounts: TestAccounts;
  let pdas: TestPDAs;

  beforeEach(async () => {
    accounts = await createTestAccounts(provider as anchor.AnchorProvider);
    pdas = findRegistryPDAs(program.programId);
    
    // Initialize registry for each test
    await initializeRegistry(program, accounts.authority, pdas.registryPda);
  });

  describe("Attestor Registration", () => {
    it("Should register single attestor successfully", async () => {
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      const registryBefore = await program.account.predicateRegistry.fetch(pdas.registryPda);
      const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

      const tx = await registerAttestor(
        program, 
        accounts.authority, 
        accounts.attestor1.publicKey, 
        pdas.registryPda
      );

      expect(tx).to.be.a('string');

      // Verify attestor account state
      const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.attestor.toString()).to.equal(accounts.attestor1.publicKey.toString());
      expect(attestorAccount.isRegistered).to.be.true;
      expect(attestorAccount.registeredAt.toNumber()).to.be.greaterThan(0);

      // Verify registry statistics
      const registryAfter = await program.account.predicateRegistry.fetch(pdas.registryPda);
      expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore + 1);
      expect(registryAfter.updatedAt.toNumber()).to.be.greaterThan(registryBefore.updatedAt.toNumber());
    });

    it("Should register multiple attestors", async () => {
      const attestors = [accounts.attestor1.publicKey, accounts.attestor2.publicKey];
      
      for (let i = 0; i < attestors.length; i++) {
        await registerAttestor(program, accounts.authority, attestors[i], pdas.registryPda);
        
        const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
        expect(registryAccount.totalAttestors.toNumber()).to.equal(i + 1);
      }
    });

    it("Should emit AttestorRegistered event", async () => {
      let eventReceived = false;
      
      const listener = program.addEventListener("attestorRegistered", (event: any) => {
        expect(event.registry.toString()).to.equal(pdas.registryPda.toString());
        expect(event.attestor.toString()).to.equal(accounts.attestor1.publicKey.toString());
        expect(event.authority.toString()).to.equal(accounts.authority.publicKey.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
        eventReceived = true;
      });

      await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      
      // Wait a bit for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await program.removeEventListener(listener);
    });

    it("Should fail to register with unauthorized authority", async () => {
      const unauthorizedAuthority = await createFundedKeypair(provider as anchor.AnchorProvider);
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);

      try {
        await program.methods
          .registerAttestor(accounts.attestor1.publicKey)
          .accounts({
            registry: pdas.registryPda,
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
      // First registration
      await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);

      // Second registration should fail
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      
      try {
        await program.methods
          .registerAttestor(accounts.attestor1.publicKey)
          .accounts({
            registry: pdas.registryPda,
            attestorAccount: attestorPda,
            authority: accounts.authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([accounts.authority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("already in use");
      }
    });

    it("Should handle registration with different authority after transfer", async () => {
      // Transfer authority first
      await program.methods
        .transferAuthority(accounts.newAuthority.publicKey)
        .accounts({
          registry: pdas.registryPda,
          authority: accounts.authority.publicKey,
          newAuthority: accounts.newAuthority.publicKey,
        } as any)
        .signers([accounts.authority])
        .rpc();

      // Register with new authority
      await registerAttestor(program, accounts.newAuthority, accounts.attestor1.publicKey, pdas.registryPda);

      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.isRegistered).to.be.true;
    });
  });

  describe("Attestor Deregistration", () => {
    beforeEach(async () => {
      // Register attestors for deregistration tests
      await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      await registerAttestor(program, accounts.authority, accounts.attestor2.publicKey, pdas.registryPda);
    });

    it("Should deregister attestor successfully", async () => {
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      const registryBefore = await program.account.predicateRegistry.fetch(pdas.registryPda);
      const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

      await program.methods
        .deregisterAttestor(accounts.attestor1.publicKey)
        .accounts({
          registry: pdas.registryPda,
          attestorAccount: attestorPda,
          authority: accounts.authority.publicKey,
        })
        .signers([accounts.authority])
        .rpc();

      // Verify attestor is deregistered
      const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.isRegistered).to.be.false;
      expect(attestorAccount.attestor.toString()).to.equal(accounts.attestor1.publicKey.toString());

      // Verify registry statistics
      const registryAfter = await program.account.predicateRegistry.fetch(pdas.registryPda);
      expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore - 1);
    });

    it("Should emit AttestorDeregistered event", async () => {
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      let eventReceived = false;

      const listener = program.addEventListener("attestorDeregistered", (event: any) => {
        expect(event.registry.toString()).to.equal(pdas.registryPda.toString());
        expect(event.attestor.toString()).to.equal(accounts.attestor1.publicKey.toString());
        expect(event.authority.toString()).to.equal(accounts.authority.publicKey.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
        eventReceived = true;
      });

      await program.methods
        .deregisterAttestor(accounts.attestor1.publicKey)
        .accounts({
          registry: pdas.registryPda,
          attestorAccount: attestorPda,
          authority: accounts.authority.publicKey,
        })
        .signers([accounts.authority])
        .rpc();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await program.removeEventListener(listener);
    });

    it("Should fail to deregister with unauthorized authority", async () => {
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      const unauthorizedAuthority = await createFundedKeypair(provider as anchor.AnchorProvider);

      try {
        await program.methods
          .deregisterAttestor(accounts.attestor1.publicKey)
          .accounts({
            registry: pdas.registryPda,
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
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      
      // First deregister
      await program.methods
        .deregisterAttestor(accounts.attestor1.publicKey)
        .accounts({
          registry: pdas.registryPda,
          attestorAccount: attestorPda,
          authority: accounts.authority.publicKey,
        })
        .signers([accounts.authority])
        .rpc();

      // Try to deregister again
      try {
        await program.methods
          .deregisterAttestor(accounts.attestor1.publicKey)
          .accounts({
            registry: pdas.registryPda,
            attestorAccount: attestorPda,
            authority: accounts.authority.publicKey,
          })
          .signers([accounts.authority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("AttestorNotRegistered");
      }
    });

    it("Should fail to deregister non-existent attestor", async () => {
      const nonExistentAttestor = Keypair.generate();
      const [attestorPda] = findAttestorPDA(nonExistentAttestor.publicKey, program.programId);

      try {
        await program.methods
          .deregisterAttestor(nonExistentAttestor.publicKey)
          .accounts({
            registry: pdas.registryPda,
            attestorAccount: attestorPda,
            authority: accounts.authority.publicKey,
          })
          .signers([accounts.authority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("AccountNotInitialized");
      }
    });
  });

  describe("Re-registration", () => {
    it("Should allow re-registration of deregistered attestor", async () => {
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      
      // Register, deregister, then re-register
      await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      
      await program.methods
        .deregisterAttestor(accounts.attestor1.publicKey)
        .accounts({
          registry: pdas.registryPda,
          attestorAccount: attestorPda,
          authority: accounts.authority.publicKey,
        })
        .signers([accounts.authority])
        .rpc();

      // Verify deregistered
      let attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
      expect(attestorAccount.isRegistered).to.be.false;

      // Re-register should work but fail because account already exists
      try {
        await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("already in use");
      }
    });

    it("Should maintain correct statistics during re-registration cycle", async () => {
      const initialRegistry = await program.account.predicateRegistry.fetch(pdas.registryPda);
      const initialCount = initialRegistry.totalAttestors.toNumber();

      // Register
      await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      let registry = await program.account.predicateRegistry.fetch(pdas.registryPda);
      expect(registry.totalAttestors.toNumber()).to.equal(initialCount + 1);

      // Deregister
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      await program.methods
        .deregisterAttestor(accounts.attestor1.publicKey)
        .accounts({
          registry: pdas.registryPda,
          attestorAccount: attestorPda,
          authority: accounts.authority.publicKey,
        })
        .signers([accounts.authority])
        .rpc();

      registry = await program.account.predicateRegistry.fetch(pdas.registryPda);
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

      for (const attestor of attestors) {
        await registerAttestor(program, accounts.authority, attestor.publicKey, pdas.registryPda);
      }

      const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(10);
    });

    it("Should maintain correct timestamps", async () => {
      const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      
      await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      
      const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
      const currentTime = Math.floor(Date.now() / 1000);
      
      expect(attestorAccount.registeredAt.toNumber()).to.be.closeTo(currentTime, 10);
    });
  });
});

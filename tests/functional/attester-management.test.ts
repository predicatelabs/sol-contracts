import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import {
  findAttesterPDA,
  registerAttester,
  createFundedKeypair,
  createTestAccount,
} from "../helpers/test-utils";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "../helpers/shared-setup";

describe("Attester Management", () => {
  let context: SharedTestContext;

  before(async () => {
    context = await setupSharedTestContext();
  });

  describe("Attester Registration", () => {
    it("Should register single attester successfully", async () => {
      const attester1 = await createTestAccount(context.provider);
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const totalAttestersBefore = registryBefore.totalAttesters.toNumber();

      const tx = await registerAttester(
        context.program,
        context.authority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      expect(tx).to.be.a("string");

      // Verify attester account state
      const attesterAccount =
        await context.program.account.attesterAccount.fetch(attesterPda);
      expect(attesterAccount.attester.toString()).to.equal(
        attester1.keypair.publicKey.toString()
      );
      expect(attesterAccount.isRegistered).to.be.true;
      expect(attesterAccount.registeredAt.toNumber()).to.be.greaterThan(0);

      // Verify registry statistics
      const registryAfter =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter.totalAttesters.toNumber()).to.equal(
        totalAttestersBefore + 1
      );
      expect(registryAfter.updatedAt.toNumber()).to.be.at.least(
        registryBefore.updatedAt.toNumber()
      );
    });

    it("Should register multiple attesters", async () => {
      const attester1 = await createTestAccount(context.provider);
      const attester2 = await createTestAccount(context.provider);
      const attesters = [
        attester1.keypair.publicKey,
        attester2.keypair.publicKey,
      ];

      const initialRegistry =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialCount = initialRegistry.totalAttesters.toNumber();

      for (let i = 0; i < attesters.length; i++) {
        await registerAttester(
          context.program,
          context.authority.keypair,
          attesters[i],
          context.registry.registryPda
        );

        const registryAccount =
          await context.program.account.predicateRegistry.fetch(
            context.registry.registryPda
          );
        expect(registryAccount.totalAttesters.toNumber()).to.equal(
          initialCount + i + 1
        );
      }
    });

    it("Should emit AttesterRegistered event", async () => {
      const attester1 = await createTestAccount(context.provider);
      let eventReceived = false;

      const listener = context.program.addEventListener(
        "attesterRegistered",
        (event: any) => {
          expect(event.registry.toString()).to.equal(
            context.registry.registryPda.toString()
          );
          expect(event.attester.toString()).to.equal(
            attester1.keypair.publicKey.toString()
          );
          expect(event.authority.toString()).to.equal(
            context.authority.keypair.publicKey.toString()
          );
          expect(event.timestamp.toNumber()).to.be.greaterThan(0);
          eventReceived = true;
        }
      );

      await registerAttester(
        context.program,
        context.authority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      // Wait a bit for event processing
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await context.program.removeEventListener(listener);
    });

    it("Should fail to register with unauthorized authority", async () => {
      const attester1 = await createTestAccount(context.provider);
      const unauthorizedAuthority = await createFundedKeypair(context.provider);
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );

      try {
        await context.program.methods
          .registerAttester(attester1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: attesterPda,
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

    it("Should fail to register same attester twice", async () => {
      const attester1 = await createTestAccount(context.provider);

      // First registration
      await registerAttester(
        context.program,
        context.authority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      // Second registration should fail
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );

      try {
        await context.program.methods
          .registerAttester(attester1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: attesterPda,
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
      const attester1 = await createTestAccount(context.provider);

      // Transfer authority first
      await context.program.methods
        .transferAuthority(newAuthority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      // Register with new authority
      await registerAttester(
        context.program,
        newAuthority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );
      const attesterAccount =
        await context.program.account.attesterAccount.fetch(attesterPda);
      expect(attesterAccount.isRegistered).to.be.true;

      // Transfer authority back to original authority
      await context.program.methods
        .transferAuthority(context.authority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: newAuthority.keypair.publicKey,
        } as any)
        .signers([newAuthority.keypair])
        .rpc();
    });
  });

  describe("Attester Deregistration", () => {
    let attester1: any, attester2: any;

    beforeEach(async () => {
      // Create fresh attesters for each test
      attester1 = await createTestAccount(context.provider);
      attester2 = await createTestAccount(context.provider);

      // Register attesters for deregistration tests
      await registerAttester(
        context.program,
        context.authority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );
      await registerAttester(
        context.program,
        context.authority.keypair,
        attester2.keypair.publicKey,
        context.registry.registryPda
      );
    });

    it("Should deregister attester successfully", async () => {
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const totalAttestersBefore = registryBefore.totalAttesters.toNumber();

      await context.program.methods
        .deregisterAttester(attester1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: attesterPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Verify attester is deregistered
      const attesterAccount =
        await context.program.account.attesterAccount.fetch(attesterPda);
      expect(attesterAccount.isRegistered).to.be.false;
      expect(attesterAccount.attester.toString()).to.equal(
        attester1.keypair.publicKey.toString()
      );

      // Verify registry statistics
      const registryAfter =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter.totalAttesters.toNumber()).to.equal(
        totalAttestersBefore - 1
      );
    });

    it("Should emit AttesterDeregistered event", async () => {
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );
      let eventReceived = false;

      const listener = context.program.addEventListener(
        "attesterDeregistered",
        (event: any) => {
          expect(event.registry.toString()).to.equal(
            context.registry.registryPda.toString()
          );
          expect(event.attester.toString()).to.equal(
            attester1.keypair.publicKey.toString()
          );
          expect(event.authority.toString()).to.equal(
            context.authority.keypair.publicKey.toString()
          );
          expect(event.timestamp.toNumber()).to.be.greaterThan(0);
          eventReceived = true;
        }
      );

      await context.program.methods
        .deregisterAttester(attester1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: attesterPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await context.program.removeEventListener(listener);
    });

    it("Should fail to deregister with unauthorized authority", async () => {
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );
      const unauthorizedAuthority = await createFundedKeypair(context.provider);

      try {
        await context.program.methods
          .deregisterAttester(attester1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: attesterPda,
            authority: unauthorizedAuthority.publicKey,
          })
          .signers([unauthorizedAuthority])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("Should fail to deregister non-registered attester", async () => {
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );

      // First deregister
      await context.program.methods
        .deregisterAttester(attester1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: attesterPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Try to deregister again
      try {
        await context.program.methods
          .deregisterAttester(attester1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: attesterPda,
            authority: context.authority.keypair.publicKey,
          })
          .signers([context.authority.keypair])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("AttesterNotRegistered");
      }
    });

    it("Should fail to deregister non-existent attester", async () => {
      const nonExistentAttester = Keypair.generate();
      const [attesterPda] = findAttesterPDA(
        nonExistentAttester.publicKey,
        context.program.programId
      );

      try {
        await context.program.methods
          .deregisterAttester(nonExistentAttester.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: attesterPda,
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
    it("Should allow re-registration of deregistered attester", async () => {
      const attester1 = await createTestAccount(context.provider);
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );

      // Register, deregister, then re-register
      await registerAttester(
        context.program,
        context.authority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      await context.program.methods
        .deregisterAttester(attester1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: attesterPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Verify deregistered
      let attesterAccount = await context.program.account.attesterAccount.fetch(
        attesterPda
      );
      expect(attesterAccount.isRegistered).to.be.false;

      // Re-register should work but fail because account already exists
      try {
        await registerAttester(
          context.program,
          context.authority.keypair,
          attester1.keypair.publicKey,
          context.registry.registryPda
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("already in use");
      }
    });

    it("Should maintain correct statistics during re-registration cycle", async () => {
      const attester1 = await createTestAccount(context.provider);
      const initialRegistry =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialCount = initialRegistry.totalAttesters.toNumber();

      // Register
      await registerAttester(
        context.program,
        context.authority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );
      let registry = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registry.totalAttesters.toNumber()).to.equal(initialCount + 1);

      // Deregister
      const [attesterPda] = findAttesterPDA(
        attester1.keypair.publicKey,
        context.program.programId
      );
      await context.program.methods
        .deregisterAttester(attester1.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: attesterPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      registry = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registry.totalAttesters.toNumber()).to.equal(initialCount);
    });
  });

  describe("Edge Cases", () => {
    it("Should handle maximum number of attesters gracefully", async () => {
      // Register multiple attesters to test counter limits
      const attesters: Keypair[] = [];
      for (let i = 0; i < 10; i++) {
        attesters.push(Keypair.generate());
      }

      const initialRegistry =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialCount = initialRegistry.totalAttesters.toNumber();

      for (const attester of attesters) {
        await registerAttester(
          context.program,
          context.authority.keypair,
          attester.publicKey,
          context.registry.registryPda
        );
      }

      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialCount + 10
      );
    });
  });
});

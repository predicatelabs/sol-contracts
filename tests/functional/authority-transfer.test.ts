import { expect } from "chai";
import {
  findAttesterPDA,
  registerAttester,
  createFundedKeypair,
  createTestAccount,
} from "../helpers/test-utils";
import {
  setupSharedTestContext,
  SharedTestContext,
  verifyAuthorityState,
} from "../helpers/shared-setup";
import * as anchor from "@coral-xyz/anchor";

describe("Authority Transfer", () => {
  let context: SharedTestContext;

  before(async () => {
    context = await setupSharedTestContext();
  });

  /**
   * Helper function to ensure authority is always restored after a test
   * even if the test fails partway through authority transfers
   *
   * Usage:
   * await withAuthorityRestore(async (tracker) => {
   *   // Transfer to new authority
   *   await transferAuthority(newAuth);
   *   tracker.setCurrent(newAuth);
   *
   *   // Do test logic...
   * });
   */
  async function withAuthorityRestore<T>(
    testFn: (tracker: {
      getCurrent: () => anchor.web3.Keypair;
      setCurrent: (auth: anchor.web3.Keypair) => void;
    }) => Promise<T>
  ): Promise<T> {
    let currentAuthority = context.authority.keypair;

    const tracker = {
      getCurrent: () => currentAuthority,
      setCurrent: (newAuth: anchor.web3.Keypair) => {
        currentAuthority = newAuth;
      },
    };

    try {
      return await testFn(tracker);
    } finally {
      // Always transfer authority back to original, even if test fails
      if (
        !currentAuthority.publicKey.equals(context.authority.keypair.publicKey)
      ) {
        try {
          await context.program.methods
            .transferAuthority(context.authority.keypair.publicKey)
            .accounts({
              registry: context.registry.registryPda,
              authority: currentAuthority.publicKey,
              newAuthority: context.authority.keypair.publicKey,
            } as any)
            .signers([currentAuthority])
            .rpc();
        } catch (error) {
          console.error("Failed to restore authority in test cleanup:", error);
          throw error;
        }
      }
    }
  }

  describe("Successful Authority Transfer", () => {
    it("Should transfer authority successfully", async () => {
      const newAuthority = await createTestAccount(context.provider);
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const previousAuthority = registryBefore.authority;
      const updatedAtBefore = registryBefore.updatedAt.toNumber();

      const tx = await context.program.methods
        .transferAuthority(newAuthority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      expect(tx).to.be.a("string");

      // Verify authority was transferred
      const registryAfter =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter.authority.toString()).to.equal(
        newAuthority.keypair.publicKey.toString()
      );
      expect(registryAfter.authority.toString()).to.not.equal(
        previousAuthority.toString()
      );
      expect(registryAfter.updatedAt.toNumber()).to.be.greaterThan(
        updatedAtBefore
      );

      // Transfer authority back to original
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

    it("Should emit AuthorityTransferred event", async () => {
      const newAuthority = await createTestAccount(context.provider);
      let eventReceived = false;

      const listener = context.program.addEventListener(
        "authorityTransferred",
        (event: any) => {
          expect(event.registry.toString()).to.equal(
            context.registry.registryPda.toString()
          );
          expect(event.previousAuthority.toString()).to.equal(
            context.authority.keypair.publicKey.toString()
          );
          expect(event.newAuthority.toString()).to.equal(
            newAuthority.keypair.publicKey.toString()
          );
          expect(event.timestamp.toNumber()).to.be.greaterThan(0);
          eventReceived = true;
        }
      );

      await context.program.methods
        .transferAuthority(newAuthority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await context.program.removeEventListener(listener);

      // Transfer authority back to original
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

    it("Should allow transfer to same address (no-op)", async () => {
      await context.program.methods
        .transferAuthority(context.authority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: context.authority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.authority.toString()).to.equal(
        context.authority.keypair.publicKey.toString()
      );
    });

    it("Should preserve other registry data during transfer", async () => {
      const newAuthority = await createTestAccount(context.provider);
      const attester1 = await createTestAccount(context.provider);

      // Add some data to the registry first
      await registerAttester(
        context.program,
        context.authority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const totalAttestersBefore = registryBefore.totalAttesters.toNumber();
      const totalPoliciesBefore = registryBefore.totalPolicies.toNumber();
      const createdAtBefore = registryBefore.createdAt.toNumber();

      // Transfer authority
      await context.program.methods
        .transferAuthority(newAuthority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      // Verify other data is preserved
      const registryAfter =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter.totalAttesters.toNumber()).to.equal(
        totalAttestersBefore
      );
      expect(registryAfter.totalPolicies.toNumber()).to.equal(
        totalPoliciesBefore
      );
      expect(registryAfter.createdAt.toNumber()).to.equal(createdAtBefore);
      expect(registryAfter.authority.toString()).to.equal(
        newAuthority.keypair.publicKey.toString()
      );

      // Transfer authority back to original
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

  describe("Authority Transfer Failures", () => {
    it("Should fail with unauthorized current authority", async () => {
      const newAuthority = await createTestAccount(context.provider);
      const unauthorizedAuthority = await createFundedKeypair(context.provider);

      try {
        await context.program.methods
          .transferAuthority(newAuthority.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            authority: unauthorizedAuthority.publicKey,
            newAuthority: newAuthority.keypair.publicKey,
          } as any)
          .signers([unauthorizedAuthority])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("Should fail after authority has been transferred", async () => {
      const newAuthority = await createTestAccount(context.provider);
      const client1 = await createTestAccount(context.provider);

      // First transfer
      await context.program.methods
        .transferAuthority(newAuthority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      // Try to transfer again with old authority
      try {
        await context.program.methods
          .transferAuthority(client1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            authority: context.authority.keypair.publicKey, // Old authority
            newAuthority: client1.keypair.publicKey,
          } as any)
          .signers([context.authority.keypair])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }

      // Transfer authority back to original
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

    it("Should fail with missing signature", async () => {
      const newAuthority = await createTestAccount(context.provider);

      try {
        await context.program.methods
          .transferAuthority(newAuthority.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            authority: context.authority.keypair.publicKey,
            newAuthority: newAuthority.keypair.publicKey,
          } as any)
          .signers([]) // No signers
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Signature verification failed");
      }
    });

    it("Should fail with wrong signer", async () => {
      const newAuthority = await createTestAccount(context.provider);
      const client1 = await createTestAccount(context.provider);

      try {
        await context.program.methods
          .transferAuthority(newAuthority.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            authority: context.authority.keypair.publicKey,
            newAuthority: newAuthority.keypair.publicKey,
          } as any)
          .signers([client1.keypair]) // Wrong signer
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("unknown signer");
      }
    });
  });

  describe("New Authority Operations", () => {
    let newAuthority: any;

    beforeEach(async () => {
      // Create new authority for these tests
      newAuthority = await createTestAccount(context.provider);

      // Transfer authority for these tests
      await context.program.methods
        .transferAuthority(newAuthority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.keypair.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();
    });

    afterEach(async () => {
      // Always transfer authority back to original after each test
      try {
        await context.program.methods
          .transferAuthority(context.authority.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            authority: newAuthority.keypair.publicKey,
            newAuthority: context.authority.keypair.publicKey,
          } as any)
          .signers([newAuthority.keypair])
          .rpc();
      } catch (error: any) {
        console.error(
          "Failed to restore authority in afterEach:",
          error.message
        );
        // Try to get current authority from registry
        try {
          const registryAccount =
            await context.program.account.predicateRegistry.fetch(
              context.registry.registryPda
            );
          console.error(
            `Current registry authority: ${registryAccount.authority.toString()}`
          );
          console.error(
            `Expected authority: ${context.authority.keypair.publicKey.toString()}`
          );
          console.error(
            `Attempted to use: ${newAuthority.keypair.publicKey.toString()}`
          );
        } catch (fetchError) {
          console.error("Could not fetch registry state");
        }
      }
    });

    it("Should allow new authority to register attestors", async () => {
      const attester1 = await createTestAccount(context.provider);

      await registerAttester(
        context.program,
        newAuthority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.totalAttesters.toNumber()).to.be.greaterThan(0);
    });

    it("Should allow new authority to deregister attestors", async () => {
      const attester1 = await createTestAccount(context.provider);

      // Register first
      await registerAttester(
        context.program,
        newAuthority.keypair,
        attester1.keypair.publicKey,
        context.registry.registryPda
      );

      // Then deregister
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
          authority: newAuthority.keypair.publicKey,
        } as any)
        .signers([newAuthority.keypair])
        .rpc();

      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        totalAttestersBefore - 1
      );
    });

    it("Should allow new authority to transfer authority again", async () => {
      const thirdAuthority = await createFundedKeypair(context.provider);

      await context.program.methods
        .transferAuthority(thirdAuthority.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: newAuthority.keypair.publicKey,
          newAuthority: thirdAuthority.publicKey,
        } as any)
        .signers([newAuthority.keypair])
        .rpc();

      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.authority.toString()).to.equal(
        thirdAuthority.publicKey.toString()
      );

      // Update newAuthority for afterEach cleanup
      newAuthority = { keypair: thirdAuthority };
    });

    it("Should prevent old authority from performing admin operations", async () => {
      const attester1 = await createTestAccount(context.provider);
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
            authority: context.authority.keypair.publicKey, // Old authority
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([context.authority.keypair])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });
  });

  describe("Authority Transfer Chain", () => {
    it("Should handle multiple authority transfers", async () => {
      const authority1 = await createTestAccount(context.provider);
      const authority2 = await createTestAccount(context.provider);
      const authority3 = await createTestAccount(context.provider);
      const authority4 = await createTestAccount(context.provider);

      const authorities = [
        authority1.keypair,
        authority2.keypair,
        authority3.keypair,
        authority4.keypair,
      ];

      let currentAuthority = context.authority.keypair;

      for (const nextAuthority of authorities) {
        await context.program.methods
          .transferAuthority(nextAuthority.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            authority: currentAuthority.publicKey,
            newAuthority: nextAuthority.publicKey,
          } as any)
          .signers([currentAuthority])
          .rpc();

        const registryAccount =
          await context.program.account.predicateRegistry.fetch(
            context.registry.registryPda
          );
        expect(registryAccount.authority.toString()).to.equal(
          nextAuthority.publicKey.toString()
        );

        currentAuthority = nextAuthority;
      }

      // Transfer authority back to original
      await context.program.methods
        .transferAuthority(context.authority.keypair.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: currentAuthority.publicKey,
          newAuthority: context.authority.keypair.publicKey,
        } as any)
        .signers([currentAuthority])
        .rpc();
    });

    it("Should maintain correct timestamps during multiple transfers", async () => {
      await withAuthorityRestore(async (tracker) => {
        const registryBefore =
          await context.program.account.predicateRegistry.fetch(
            context.registry.registryPda
          );
        let lastUpdatedAt = registryBefore.updatedAt.toNumber();

        const authority1 = await createTestAccount(context.provider);
        const authority2 = await createTestAccount(context.provider);
        const authorities = [authority1.keypair, authority2.keypair];

        for (const nextAuthority of authorities) {
          // Wait to ensure timestamp difference
          await new Promise((resolve) => setTimeout(resolve, 100));

          await context.program.methods
            .transferAuthority(nextAuthority.publicKey)
            .accounts({
              registry: context.registry.registryPda,
              authority: tracker.getCurrent().publicKey,
              newAuthority: nextAuthority.publicKey,
            } as any)
            .signers([tracker.getCurrent()])
            .rpc();

          tracker.setCurrent(nextAuthority);

          const registryAccount =
            await context.program.account.predicateRegistry.fetch(
              context.registry.registryPda
            );
          expect(registryAccount.updatedAt.toNumber()).to.be.greaterThanOrEqual(
            lastUpdatedAt
          );

          lastUpdatedAt = registryAccount.updatedAt.toNumber();
        }
      });
    });
  });

  describe("Edge Cases", () => {
    it("Should handle rapid successive transfers", async () => {
      await withAuthorityRestore(async (tracker) => {
        const authority1 = await createTestAccount(context.provider);
        const authority2 = await createTestAccount(context.provider);

        const authorities = [authority1.keypair, authority2.keypair];

        for (const nextAuthority of authorities) {
          await context.program.methods
            .transferAuthority(nextAuthority.publicKey)
            .accounts({
              registry: context.registry.registryPda,
              authority: tracker.getCurrent().publicKey,
              newAuthority: nextAuthority.publicKey,
            } as any)
            .signers([tracker.getCurrent()])
            .rpc();

          tracker.setCurrent(nextAuthority);
        }
      });

      // Verify final state (after cleanup has restored authority)
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.authority.toString()).to.equal(
        context.authority.keypair.publicKey.toString()
      );
    });

    it("Should maintain registry functionality after authority transfer", async () => {
      await withAuthorityRestore(async (tracker) => {
        const newAuthority = await createTestAccount(context.provider);
        const attester1 = await createTestAccount(context.provider);

        // Transfer authority
        await context.program.methods
          .transferAuthority(newAuthority.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            authority: tracker.getCurrent().publicKey,
            newAuthority: newAuthority.keypair.publicKey,
          } as any)
          .signers([tracker.getCurrent()])
          .rpc();

        tracker.setCurrent(newAuthority.keypair);

        // Test that all admin functions still work with new authority
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

        await context.program.methods
          .deregisterAttester(attester1.keypair.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: attesterPda,
            authority: newAuthority.keypair.publicKey,
          } as any)
          .signers([newAuthority.keypair])
          .rpc();
      });

      // Verify final state (after cleanup has restored authority)
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.authority.toString()).to.equal(
        context.authority.keypair.publicKey.toString()
      );
    });
  });

  // Global cleanup verification - ensure authority is at the original for subsequent test files
  after(async () => {
    await verifyAuthorityState(context, {
      when: "after",
      suiteName: "authority-transfer test suite",
    });
  });
});

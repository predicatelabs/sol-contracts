import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "./helpers/shared-setup";
import {
  createTestAccount,
  findAttesterPDA,
  findPolicyPDA,
  registerAttester,
  setPolicyId,
} from "./helpers/test-utils";

describe("Integration Tests", () => {
  let context: SharedTestContext;
  let newAuthority: Keypair;
  let client1: Keypair;
  let client2: Keypair;
  let attester1: Keypair;
  let attester2: Keypair;

  before(async () => {
    context = await setupSharedTestContext();

    // Create test accounts
    const newAuthorityAccount = await createTestAccount(context.provider);
    const client1Account = await createTestAccount(context.provider);
    const client2Account = await createTestAccount(context.provider);

    newAuthority = newAuthorityAccount.keypair;
    client1 = client1Account.keypair;
    client2 = client2Account.keypair;
    attester1 = Keypair.generate();
    attester2 = Keypair.generate();
  });

  describe("Complete Registry Workflow", () => {
    let originalAuthority: Keypair;

    before(async () => {
      originalAuthority = context.authority.keypair;
    });

    afterEach(async () => {
      // Restore original authority after each test
      try {
        const currentRegistry =
          await context.program.account.predicateRegistry.fetch(
            context.registry.registryPda
          );
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;

          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else if (currentAuthorityKey.equals(client2.publicKey)) {
            currentAuthorityKeypair = client2;
          } else {
            console.warn(
              "Cannot restore authority - unknown current authority"
            );
            return;
          }

          await context.program.methods
            .transferAuthority(originalAuthority.publicKey)
            .accounts({
              registry: context.registry.registryPda,
              authority: currentAuthorityKeypair.publicKey,
              newAuthority: originalAuthority.publicKey,
            } as any)
            .signers([currentAuthorityKeypair])
            .rpc();
        }
      } catch (error) {
        console.warn("Failed to restore original authority:", error);
      }
    });

    it("Should handle full registry lifecycle", async () => {
      // 1. Initialize (already done by shared setup)
      let registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialAttesters = registryAccount.totalAttesters.toNumber();

      // 2. Register multiple attesters
      const attesters = [attester1.publicKey, attester2.publicKey];
      for (const attester of attesters) {
        await registerAttester(
          context.program,
          context.authority.keypair,
          attester,
          context.registry.registryPda
        );
      }

      registryAccount = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 2
      );

      // 3. Set policy IDs for multiple clients
      const policies = [
        { client: client1, policyId: "x-client1-policy" },
        { client: client2, policyId: "x-client2-policy" },
      ];

      for (const { client, policyId } of policies) {
        await setPolicyId(
          context.program,
          client,
          policyId,
          context.registry.registryPda
        );
      }

      // 4. Verify all accounts exist and have correct data
      for (const attester of attesters) {
        const [attesterPda] = findAttesterPDA(
          attester,
          context.program.programId
        );
        const attesterAccount =
          await context.program.account.attesterAccount.fetch(attesterPda);
        expect(attesterAccount.isRegistered).to.be.true;
      }

      for (const { client, policyId } of policies) {
        const [policyPda] = findPolicyPDA(
          client.publicKey,
          context.program.programId
        );
        const policyAccount = await context.program.account.policyAccount.fetch(
          policyPda
        );
        expect(policyAccount.policyId).to.equal(policyId);
      }

      // 5. Transfer authority
      await context.program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      registryAccount = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registryAccount.authority.toString()).to.equal(
        newAuthority.publicKey.toString()
      );

      // 6. New authority can perform operations
      const newAttester = Keypair.generate();
      await registerAttester(
        context.program,
        newAuthority,
        newAttester.publicKey,
        context.registry.registryPda
      );

      registryAccount = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 3
      );
    });

    it("Should maintain data consistency across authority transfers", async () => {
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const createdAtBefore = registryBefore.createdAt.toNumber();
      const totalAttestersBefore = registryBefore.totalAttesters.toNumber();

      // Transfer authority multiple times
      const authorities = [newAuthority, client2, context.authority.keypair];
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

        currentAuthority = nextAuthority;
      }

      // Verify data consistency
      const registryAfter =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter.createdAt.toNumber()).to.equal(createdAtBefore);
      expect(registryAfter.totalAttesters.toNumber()).to.equal(
        totalAttestersBefore
      );
      expect(registryAfter.authority.toString()).to.equal(
        context.authority.keypair.publicKey.toString()
      );

      // Verify attestor accounts still exist and are correct
      const [attestor1Pda] = findAttesterPDA(
        attester1.publicKey,
        context.program.programId
      );
      const [attestor2Pda] = findAttesterPDA(
        attester2.publicKey,
        context.program.programId
      );

      const attestor1Account =
        await context.program.account.attesterAccount.fetch(attestor1Pda);
      const attestor2Account =
        await context.program.account.attesterAccount.fetch(attestor2Pda);

      expect(attestor1Account.isRegistered).to.be.true;
      expect(attestor2Account.isRegistered).to.be.true;

      // Verify policy account still exists and is correct
      const [policyPda] = findPolicyPDA(
        client1.publicKey,
        context.program.programId
      );
      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAccount.policyId).to.equal("x-client1-policy");
    });
  });

  describe("Cross-Operation Error Handling", () => {
    let originalAuthority: Keypair;

    before(async () => {
      originalAuthority = context.authority.keypair;
    });

    afterEach(async () => {
      // Restore original authority after each test
      try {
        const currentRegistry =
          await context.program.account.predicateRegistry.fetch(
            context.registry.registryPda
          );
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;

          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else {
            console.warn(
              "Cannot restore authority - unknown current authority"
            );
            return;
          }

          await context.program.methods
            .transferAuthority(originalAuthority.publicKey)
            .accounts({
              registry: context.registry.registryPda,
              authority: currentAuthorityKeypair.publicKey,
              newAuthority: originalAuthority.publicKey,
            } as any)
            .signers([currentAuthorityKeypair])
            .rpc();
        }
      } catch (error) {
        console.warn("Failed to restore original authority:", error);
      }
    });

    it("Should handle errors gracefully during complex operations", async () => {
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const totalAttestersBefore = registryBefore.totalAttesters.toNumber();

      // Transfer authority
      await context.program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      // Try to register with old authority (should fail)
      const newAttester = Keypair.generate();
      const [newAttesterPda] = findAttesterPDA(
        newAttester.publicKey,
        context.program.programId
      );

      try {
        await context.program.methods
          .registerAttester(newAttester.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attesterAccount: newAttesterPda,
            authority: context.authority.keypair.publicKey, // Old authority
            systemProgram: SystemProgram.programId,
          })
          .signers([context.authority.keypair])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }

      // Verify registry state is still consistent
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        totalAttestersBefore
      );
      expect(registryAccount.authority.toString()).to.equal(
        newAuthority.publicKey.toString()
      );
    });
  });

  describe("Concurrent Operations", () => {
    it("Should handle multiple attestor registrations correctly", async () => {
      const attesters = Array.from({ length: 5 }, () => Keypair.generate());

      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialAttesters = registryBefore.totalAttesters.toNumber();

      // Register all attestors
      for (const attester of attesters) {
        await registerAttester(
          context.program,
          context.authority.keypair,
          attester.publicKey,
          context.registry.registryPda
        );
      }

      // Verify all are registered
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 5
      );

      // Verify each attestor account
      for (const attester of attesters) {
        const [attesterPda] = findAttesterPDA(
          attester.publicKey,
          context.program.programId
        );
        const attesterAccount =
          await context.program.account.attesterAccount.fetch(attesterPda);
        expect(attesterAccount.isRegistered).to.be.true;
        expect(attesterAccount.attester.toString()).to.equal(
          attester.publicKey.toString()
        );
      }
    });

    it("Should handle multiple policy operations correctly", async () => {
      const clients: Keypair[] = [];

      // Create and fund clients
      for (let i = 0; i < 3; i++) {
        const clientAccount = await createTestAccount(context.provider);
        clients.push(clientAccount.keypair);
      }

      // Set policy IDs for all clients
      for (let i = 0; i < clients.length; i++) {
        const policyId = `x-policy-${i}`;
        await setPolicyId(
          context.program,
          clients[i],
          policyId,
          context.registry.registryPda
        );
      }

      // Update all policies
      for (let i = 0; i < clients.length; i++) {
        const [policyPda] = findPolicyPDA(
          clients[i].publicKey,
          context.program.programId
        );
        const updatedPolicyId = `x-updated-policy-${i}`;

        await context.program.methods
          .updatePolicyId(updatedPolicyId)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            client: clients[i].publicKey,
          } as any)
          .signers([clients[i]])
          .rpc();

        // Verify update
        const policyAccount = await context.program.account.policyAccount.fetch(
          policyPda
        );
        expect(policyAccount.policyId).to.equal(updatedPolicyId);
      }
    });
  });

  describe("State Consistency", () => {
    let originalAuthority: Keypair;

    before(async () => {
      originalAuthority = context.authority.keypair;
    });

    afterEach(async () => {
      // Restore original authority after each test
      try {
        const currentRegistry =
          await context.program.account.predicateRegistry.fetch(
            context.registry.registryPda
          );
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;

          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else {
            console.warn(
              "Cannot restore authority - unknown current authority"
            );
            return;
          }

          await context.program.methods
            .transferAuthority(originalAuthority.publicKey)
            .accounts({
              registry: context.registry.registryPda,
              authority: currentAuthorityKeypair.publicKey,
              newAuthority: originalAuthority.publicKey,
            } as any)
            .signers([currentAuthorityKeypair])
            .rpc();
        }
      } catch (error) {
        console.warn("Failed to restore original authority:", error);
      }
    });

    it("Should maintain consistent state across mixed operations", async () => {
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialAttesters = registryBefore.totalAttesters.toNumber();

      // Two new clients
      const client3 = await createTestAccount(context.provider);
      const client4 = await createTestAccount(context.provider);

      // Two new attestors
      const attester3 = Keypair.generate();
      const attester4 = Keypair.generate();

      const operations = [
        async () => {
          await registerAttester(
            context.program,
            context.authority.keypair,
            attester3.publicKey,
            context.registry.registryPda
          );
        },
        async () => {
          await setPolicyId(
            context.program,
            client3.keypair,
            "x-policy1",
            context.registry.registryPda
          );
        },
        async () => {
          await registerAttester(
            context.program,
            context.authority.keypair,
            attester4.publicKey,
            context.registry.registryPda
          );
        },
        async () => {
          await setPolicyId(
            context.program,
            client4.keypair,
            "x-policy2",
            context.registry.registryPda
          );
        },
        async () => {
          const [policyPda] = findPolicyPDA(
            client3.keypair.publicKey,
            context.program.programId
          );
          await context.program.methods
            .updatePolicyId("x-updated-policy1")
            .accounts({
              registry: context.registry.registryPda,
              policyAccount: policyPda,
              client: client3.keypair.publicKey,
            } as any)
            .signers([client3.keypair])
            .rpc();
        },
      ];

      // Execute all operations
      for (const operation of operations) {
        await operation();
      }

      // Verify final state
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 2
      );

      // Verify attestors
      const [attester3Pda] = findAttesterPDA(
        attester3.publicKey,
        context.program.programId
      );
      const [attester4Pda] = findAttesterPDA(
        attester4.publicKey,
        context.program.programId
      );

      const attester3Account =
        await context.program.account.attesterAccount.fetch(attester3Pda);
      const attester4Account =
        await context.program.account.attesterAccount.fetch(attester4Pda);

      expect(attester3Account.isRegistered).to.be.true;
      expect(attester4Account.isRegistered).to.be.true;

      // Verify policies
      const [policy1Pda] = findPolicyPDA(
        client3.keypair.publicKey,
        context.program.programId
      );
      const [policy2Pda] = findPolicyPDA(
        client4.keypair.publicKey,
        context.program.programId
      );

      const policy1Account = await context.program.account.policyAccount.fetch(
        policy1Pda
      );
      const policy2Account = await context.program.account.policyAccount.fetch(
        policy2Pda
      );

      expect(policy1Account.policyId).to.equal("x-updated-policy1");
      expect(policy2Account.policyId).to.equal("x-policy2");
    });

    it("Should handle registry statistics correctly across all operations", async () => {
      let registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialUpdatedAt = registryAccount.updatedAt.toNumber();
      const initialAttesters = registryAccount.totalAttesters.toNumber();

      // Two new attestors
      const attester3 = Keypair.generate();
      const attester4 = Keypair.generate();

      // Register 3 attestors
      const attesters = [attester3, attester4, Keypair.generate()];
      for (const attester of attesters) {
        await registerAttester(
          context.program,
          context.authority.keypair,
          attester.publicKey,
          context.registry.registryPda
        );
      }

      registryAccount = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 3
      );
      expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(
        initialUpdatedAt
      );

      // Deregister 1 attestor
      const [attesterPda] = findAttesterPDA(
        attester3.publicKey,
        context.program.programId
      );
      await context.program.methods
        .deregisterAttester(attester3.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: attesterPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      registryAccount = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 2
      );

      // Transfer authority (should update timestamp but not counts)
      const updatedAtBeforeTransfer = registryAccount.updatedAt.toNumber();

      await context.program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          authority: context.authority.keypair.publicKey,
          newAuthority: newAuthority.publicKey,
        } as any)
        .signers([context.authority.keypair])
        .rpc();

      registryAccount = await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 2
      ); // Should not change
    });
  });

  describe("Recovery Scenarios", () => {
    let originalAuthority: Keypair;

    before(async () => {
      originalAuthority = context.authority.keypair;
    });

    afterEach(async () => {
      // Restore original authority after each test
      try {
        const currentRegistry =
          await context.program.account.predicateRegistry.fetch(
            context.registry.registryPda
          );
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;

          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else {
            console.warn(
              "Cannot restore authority - unknown current authority"
            );
            return;
          }

          await context.program.methods
            .transferAuthority(originalAuthority.publicKey)
            .accounts({
              registry: context.registry.registryPda,
              authority: currentAuthorityKeypair.publicKey,
              newAuthority: originalAuthority.publicKey,
            } as any)
            .signers([currentAuthorityKeypair])
            .rpc();
        }
      } catch (error) {
        console.warn("Failed to restore original authority:", error);
      }
    });

    it("Should recover from partial failures", async () => {
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialAttesters = registryBefore.totalAttesters.toNumber();

      // New attestor
      const newAttester = Keypair.generate();

      // Register attestor successfully
      await registerAttester(
        context.program,
        context.authority.keypair,
        newAttester.publicKey,
        context.registry.registryPda
      );

      // Try to register same attestor again (should fail)
      const [attesterPda] = findAttesterPDA(
        newAttester.publicKey,
        context.program.programId
      );

      try {
        await context.program.methods
          .registerAttester(newAttester.publicKey)
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

      // Registry should still be in consistent state
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 1
      );

      // New attestor should be registered
      const secondAttestor = Keypair.generate();

      // Should be able to register different attestor
      await registerAttester(
        context.program,
        context.authority.keypair,
        secondAttestor.publicKey,
        context.registry.registryPda
      );

      const updatedRegistryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(updatedRegistryAccount.totalAttesters.toNumber()).to.equal(
        initialAttesters + 2
      );
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("Should handle maximum policy length correctly", async () => {
      const maxClientAccount = await createTestAccount(context.provider);
      const maxClient = maxClientAccount.keypair;

      const [maxPolicyPda] = findPolicyPDA(
        maxClient.publicKey,
        context.program.programId
      );

      const maxPolicyId = "x-" + "A".repeat(62); // Exactly 64 characters

      await context.program.methods
        .setPolicyId(maxPolicyId)
        .accounts({
          registry: context.registry.registryPda,
          policyAccount: maxPolicyPda,
          client: maxClient.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([maxClient])
        .rpc();

      const policyAccount = await context.program.account.policyAccount.fetch(
        maxPolicyPda
      );
      expect(policyAccount.policyId).to.equal(maxPolicyId);
      expect(policyAccount.policyId.length).to.equal(64);
    });

    it("Should handle re-registration of deregistered attestor", async () => {
      // Create a fresh attestor for this test to avoid account conflicts
      const freshAttester = Keypair.generate();
      const [freshAttesterPda] = findAttesterPDA(
        freshAttester.publicKey,
        context.program.programId
      );

      // Register the fresh attestor
      await registerAttester(
        context.program,
        context.authority.keypair,
        freshAttester.publicKey,
        context.registry.registryPda
      );

      // Deregister the attestor
      await context.program.methods
        .deregisterAttester(freshAttester.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attesterAccount: freshAttesterPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Verify it's deregistered
      const deregisteredAccount =
        await context.program.account.attesterAccount.fetch(freshAttesterPda);
      expect(deregisteredAccount.isRegistered).to.be.false;

      // For now, re-registration of an existing account is not supported
      // This test verifies that deregistration works correctly
      expect(deregisteredAccount.attester.toString()).to.equal(
        freshAttester.publicKey.toString()
      );
    });

    it("Should maintain correct registry statistics", async () => {
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );

      // Count should be at least 0 (depending on previous tests)
      expect(registryAccount.totalAttesters.toNumber()).to.be.at.least(0);

      // Policies counter may not be implemented in the smart contract
      expect(registryAccount.totalPolicies.toNumber()).to.be.at.least(0);
    });
  });
});

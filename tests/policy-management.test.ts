import { expect } from "chai";
import { SystemProgram } from "@solana/web3.js";
import {
  findPolicyPDA,
  setPolicyId,
  createFundedKeypair,
  createTestAccount,
} from "./helpers/test-utils";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "./helpers/shared-setup";

describe("Policy Management", () => {
  let context: SharedTestContext;

  // Test policy IDs
  const shortPolicyId = "x-short123456789";
  const mediumPolicyId = "x-70742d552a93b03d"; // Typical format
  const longPolicyId = "x-" + "a".repeat(62); // Maximum length (64 total)
  const tooLongPolicyId = "x-" + "a".repeat(63); // Too long (65 total)
  const updatedPolicyId = "x-updated-policy-id";

  before(async () => {
    context = await setupSharedTestContext();
  });

  describe("Policy Setting", () => {
    it("Should set policy ID successfully", async () => {
      const client1 = await createTestAccount(context.provider);
      const [policyPda] = findPolicyPDA(
        client1.keypair.publicKey,
        context.program.programId
      );

      const tx = await setPolicyId(
        context.program,
        client1.keypair,
        mediumPolicyId,
        context.registry.registryPda
      );
      expect(tx).to.be.a("string");

      // Verify policy account state
      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAccount.client.toString()).to.equal(
        client1.keypair.publicKey.toString()
      );
      expect(policyAccount.policyId).to.equal(mediumPolicyId);
      expect(policyAccount.setAt.toNumber()).to.be.greaterThan(0);
      expect(policyAccount.updatedAt.toNumber()).to.be.greaterThan(0);
      expect(policyAccount.setAt.toNumber()).to.equal(
        policyAccount.updatedAt.toNumber()
      );
    });

    it("Should set multiple policy IDs for different clients", async () => {
      const client1 = await createTestAccount(context.provider);
      const client2 = await createTestAccount(context.provider);
      const policies = [
        { client: client1.keypair, policyId: shortPolicyId },
        { client: client2.keypair, policyId: mediumPolicyId },
      ];

      for (const { client, policyId } of policies) {
        await setPolicyId(
          context.program,
          client,
          policyId,
          context.registry.registryPda
        );

        const [policyPda] = findPolicyPDA(
          client.publicKey,
          context.program.programId
        );
        const policyAccount = await context.program.account.policyAccount.fetch(
          policyPda
        );

        expect(policyAccount.client.toString()).to.equal(
          client.publicKey.toString()
        );
        expect(policyAccount.policyId).to.equal(policyId);
      }
    });

    it("Should handle maximum length policy ID", async () => {
      const client1 = await createTestAccount(context.provider);
      const [policyPda] = findPolicyPDA(
        client1.keypair.publicKey,
        context.program.programId
      );

      const tx = await setPolicyId(
        context.program,
        client1.keypair,
        longPolicyId,
        context.registry.registryPda
      );
      expect(tx).to.be.a("string");

      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAccount.policyId).to.equal(longPolicyId);
      expect(policyAccount.policyId.length).to.equal(64);
    });

    it("Should fail with policy ID too long", async () => {
      const client1 = await createTestAccount(context.provider);
      try {
        await setPolicyId(
          context.program,
          client1.keypair,
          tooLongPolicyId,
          context.registry.registryPda
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("PolicyIdTooLong");
      }
    });

    it("Should fail with unauthorized client", async () => {
      const client1 = await createTestAccount(context.provider);
      const unauthorizedClient = await createFundedKeypair(context.provider);
      const [policyPda] = findPolicyPDA(
        client1.keypair.publicKey,
        context.program.programId
      );

      try {
        await context.program.methods
          .setPolicyId(mediumPolicyId)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            client: unauthorizedClient.publicKey, // Wrong client
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([unauthorizedClient])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("ConstraintSeeds");
      }
    });
  });

  describe("Policy Updates", () => {
    let client1: any;

    beforeEach(async () => {
      // Create client and set initial policy ID
      client1 = await createTestAccount(context.provider);
      await setPolicyId(
        context.program,
        client1.keypair,
        mediumPolicyId,
        context.registry.registryPda
      );
    });

    it("Should update policy ID successfully", async () => {
      const [policyPda] = findPolicyPDA(
        client1.keypair.publicKey,
        context.program.programId
      );
      const policyBefore = await context.program.account.policyAccount.fetch(
        policyPda
      );
      const setAtBefore = policyBefore.setAt.toNumber();

      const tx = await context.program.methods
        .updatePolicyId(updatedPolicyId)
        .accounts({
          registry: context.registry.registryPda,
          policyAccount: policyPda,
          client: client1.keypair.publicKey,
        } as any)
        .signers([client1.keypair])
        .rpc();

      expect(tx).to.be.a("string");

      // Verify policy ID was updated
      const policyAfter = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAfter.policyId).to.equal(updatedPolicyId);
      expect(policyAfter.setAt.toNumber()).to.equal(setAtBefore); // Should not change
    });

    it("Should fail to update with unauthorized client", async () => {
      const [policyPda] = findPolicyPDA(
        client1.keypair.publicKey,
        context.program.programId
      );
      const unauthorizedClient = await createFundedKeypair(context.provider);

      try {
        await context.program.methods
          .updatePolicyId(updatedPolicyId)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            client: unauthorizedClient.publicKey, // Wrong client
          } as any)
          .signers([unauthorizedClient])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("ConstraintSeeds");
      }
    });

    it("Should fail to update non-existent policy", async () => {
      const newClient = await createFundedKeypair(context.provider);
      const [policyPda] = findPolicyPDA(
        newClient.publicKey,
        context.program.programId
      );

      try {
        await context.program.methods
          .updatePolicyId(updatedPolicyId)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            client: newClient.publicKey,
          } as any)
          .signers([newClient])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("AccountNotInitialized");
      }
    });
  });

  describe("Edge Cases", () => {
    it("Should fail to set empty policy ID", async () => {
      const client1 = await createTestAccount(context.provider);
      const emptyPolicyId = "";

      try {
        await setPolicyId(
          context.program,
          client1.keypair,
          emptyPolicyId,
          context.registry.registryPda
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include(
          "Invalid policy ID: Policy ID cannot be empty"
        );
      }
    });

    it("Should handle policy ID with valid special characters", async () => {
      const client1 = await createTestAccount(context.provider);
      const specialPolicyId = "x-policy_id-with-dashes_underscores123";
      const [policyPda] = findPolicyPDA(
        client1.keypair.publicKey,
        context.program.programId
      );

      const tx = await setPolicyId(
        context.program,
        client1.keypair,
        specialPolicyId,
        context.registry.registryPda
      );
      expect(tx).to.be.a("string");

      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAccount.policyId).to.equal(specialPolicyId);
    });
  });
});

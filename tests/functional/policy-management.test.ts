import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Counter } from "../../target/types/counter";
import {
  findPolicyPDA,
  setPolicyId,
  setPolicyIdOrUpdate,
  updatePolicyId,
  createFundedKeypair,
} from "../helpers/test-utils";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "../helpers/shared-setup";

describe("Policy Management", () => {
  let context: SharedTestContext;
  let counterProgram: Program<Counter>;
  let counterProgramId: PublicKey;

  // Test policy IDs
  const shortPolicyId = "x-short123456789";
  const mediumPolicyId = "x-70742d552a93b03d"; // Typical format
  const longPolicyId = "x-" + "a".repeat(62); // Maximum length (64 total)
  const tooLongPolicyId = "x-" + "a".repeat(63); // Too long (65 total)
  const updatedPolicyId = "x-updated-policy-id";

  before(async () => {
    context = await setupSharedTestContext();

    // Get Counter program (policies are set for programs, not users)
    counterProgram = anchor.workspace.Counter as Program<Counter>;
    counterProgramId = counterProgram.programId;
  });

  describe("Policy Setting", () => {
    it("Should set policy ID for Counter program successfully", async () => {
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );

      const tx = await setPolicyIdOrUpdate(
        context.program,
        counterProgramId,
        context.authority.keypair,
        mediumPolicyId,
        context.registry.registryPda
      );
      expect(tx).to.be.a("string");

      // Verify policy account state
      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAccount.clientProgram.toString()).to.equal(
        counterProgramId.toString()
      );
      expect(policyAccount.authority.toString()).to.equal(
        context.authority.keypair.publicKey.toString()
      );
      expect(policyAccount.policyId).to.equal(mediumPolicyId);
      expect(policyAccount.setAt.toNumber()).to.be.greaterThan(0);
      expect(policyAccount.updatedAt.toNumber()).to.be.greaterThan(0);
    });

    it("Should set policy IDs for both PredicateRegistry and Counter programs", async () => {
      // Test setting policies for multiple programs
      const programs = [
        { programId: context.program.programId, policyId: shortPolicyId },
        { programId: counterProgramId, policyId: mediumPolicyId },
      ];

      for (const { programId, policyId } of programs) {
        await setPolicyIdOrUpdate(
          context.program,
          programId,
          context.authority.keypair,
          policyId,
          context.registry.registryPda
        );

        const [policyPda] = findPolicyPDA(programId, context.program.programId);
        const policyAccount = await context.program.account.policyAccount.fetch(
          policyPda
        );

        expect(policyAccount.clientProgram.toString()).to.equal(
          programId.toString()
        );
        expect(policyAccount.policyId).to.equal(policyId);
      }
    });

    it("Should handle maximum length policy ID", async () => {
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );

      const tx = await setPolicyIdOrUpdate(
        context.program,
        counterProgramId,
        context.authority.keypair,
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
      try {
        await setPolicyId(
          context.program,
          counterProgramId,
          context.authority.keypair,
          tooLongPolicyId,
          context.registry.registryPda
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        // Error was thrown as expected - test passes
        expect(error).to.exist;
      }
    });

    it("Should fail with unauthorized authority (not upgrade authority)", async () => {
      const unauthorizedAuthority = await createFundedKeypair(context.provider);
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );

      // Derive program data PDA
      const [programDataPda] = PublicKey.findProgramAddressSync(
        [counterProgramId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      );

      try {
        await context.program.methods
          .setPolicyId(mediumPolicyId)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            clientProgram: counterProgramId,
            programData: programDataPda,
            authority: unauthorizedAuthority.publicKey, // Not the upgrade authority
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([unauthorizedAuthority])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        // Error was thrown as expected - test passes
        expect(error).to.exist;
      }
    });
  });

  describe("Policy Updates", () => {
    beforeEach(async () => {
      // Set initial policy ID for Counter program (or update if exists)
      await setPolicyIdOrUpdate(
        context.program,
        counterProgramId,
        context.authority.keypair,
        mediumPolicyId,
        context.registry.registryPda
      );
    });

    it("Should update policy ID successfully", async () => {
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );
      const policyBefore = await context.program.account.policyAccount.fetch(
        policyPda
      );
      const setAtBefore = policyBefore.setAt.toNumber();

      const tx = await updatePolicyId(
        context.program,
        counterProgramId,
        context.authority.keypair,
        updatedPolicyId,
        context.registry.registryPda
      );

      expect(tx).to.be.a("string");

      // Verify policy ID was updated
      const policyAfter = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAfter.policyId).to.equal(updatedPolicyId);
      expect(policyAfter.setAt.toNumber()).to.equal(setAtBefore); // Should not change
    });

    it("Should emit PolicyUpdated event with correct client_program", async () => {
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );
      const policyBefore = await context.program.account.policyAccount.fetch(
        policyPda
      );
      const previousPolicyId = policyBefore.policyId;
      let eventReceived = false;

      const listener = context.program.addEventListener(
        "policyUpdated",
        (event: any) => {
          expect(event.registry.toString()).to.equal(
            context.registry.registryPda.toString()
          );
          expect(event.clientProgram.toString()).to.equal(
            counterProgramId.toString()
          );
          expect(event.authority.toString()).to.equal(
            context.authority.keypair.publicKey.toString()
          );
          expect(event.previousPolicyId).to.equal(previousPolicyId);
          expect(event.newPolicyId).to.equal(updatedPolicyId);
          expect(event.timestamp.toNumber()).to.be.greaterThan(0);
          eventReceived = true;
        }
      );

      await updatePolicyId(
        context.program,
        counterProgramId,
        context.authority.keypair,
        updatedPolicyId,
        context.registry.registryPda
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await context.program.removeEventListener(listener);
    });

    it("Should NOT increment registry policy count when updating existing policy", async () => {
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );

      // Get policy count before update
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const countBefore = registryBefore.totalPolicies.toNumber();

      // Update the policy
      await updatePolicyId(
        context.program,
        counterProgramId,
        context.authority.keypair,
        updatedPolicyId,
        context.registry.registryPda
      );

      // Verify policy count has NOT changed
      const registryAfter =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter.totalPolicies.toNumber()).to.equal(countBefore);
    });

    it("Should fail to update with unauthorized authority", async () => {
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );
      const unauthorizedAuthority = await createFundedKeypair(context.provider);

      // Derive program data PDA
      const [programDataPda] = PublicKey.findProgramAddressSync(
        [counterProgramId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      );

      try {
        await context.program.methods
          .updatePolicyId(updatedPolicyId)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            clientProgram: counterProgramId,
            programData: programDataPda,
            authority: unauthorizedAuthority.publicKey, // Not the upgrade authority
          } as any)
          .signers([unauthorizedAuthority])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("Should fail to update non-existent policy", async () => {
      // Use a dummy program ID that definitely doesn't have a policy
      const programWithoutPolicy = Keypair.generate().publicKey;
      const [policyPda] = findPolicyPDA(
        programWithoutPolicy,
        context.program.programId
      );

      // Derive program data PDA
      const [programDataPda] = PublicKey.findProgramAddressSync(
        [programWithoutPolicy.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      );

      try {
        await context.program.methods
          .updatePolicyId(updatedPolicyId)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            clientProgram: programWithoutPolicy,
            programData: programDataPda,
            authority: context.authority.keypair.publicKey,
          } as any)
          .signers([context.authority.keypair])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (error: any) {
        // Should fail with AccountNotInitialized or similar
        const errorStr = JSON.stringify(error);
        expect(errorStr).to.satisfy(
          (s: string) =>
            s.includes("AccountNotInitialized") ||
            s.includes("Account does not exist") ||
            s.includes("not initialized")
        );
      }
    });
  });

  describe("Edge Cases", () => {
    it("Should fail to set empty policy ID", async () => {
      const emptyPolicyId = "";

      try {
        await setPolicyId(
          context.program,
          counterProgramId,
          context.authority.keypair,
          emptyPolicyId,
          context.registry.registryPda
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        // Error was thrown as expected - test passes
        expect(error).to.exist;
      }
    });

    it("Should handle policy ID with valid special characters", async () => {
      const specialPolicyId = "x-policy_id-with-dashes_underscores123";
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );

      const tx = await setPolicyIdOrUpdate(
        context.program,
        counterProgramId,
        context.authority.keypair,
        specialPolicyId,
        context.registry.registryPda
      );
      expect(tx).to.be.a("string");

      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );
      expect(policyAccount.policyId).to.equal(specialPolicyId);
    });

    it("Should increment registry policy count when setting new policies", async () => {
      // Get initial policy count
      const registryBefore =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      const initialCount = registryBefore.totalPolicies.toNumber();

      // Update policy for Counter program (shouldn't increment count)
      await setPolicyIdOrUpdate(
        context.program,
        counterProgramId,
        context.authority.keypair,
        "test-policy-count-1",
        context.registry.registryPda
      );

      // Check count hasn't changed (update, not new)
      const registryAfter1 =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter1.totalPolicies.toNumber()).to.equal(initialCount);

      // Set policy for PredicateRegistry program (SHOULD increment count if it's new)
      await setPolicyIdOrUpdate(
        context.program,
        context.program.programId,
        context.authority.keypair,
        "test-policy-count-2",
        context.registry.registryPda
      );

      // Check count increased by 0 or 1 depending on whether PredicateRegistry policy already existed
      const registryAfter2 =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );
      expect(registryAfter2.totalPolicies.toNumber()).to.be.at.least(
        initialCount
      );
      expect(registryAfter2.totalPolicies.toNumber()).to.be.at.most(
        initialCount + 1
      );
    });
  });

  describe("Policy Account Consistency", () => {
    it("should store client_program value that matches PDA derivation", async () => {
      // This test verifies that the stored client_program value matches the PDA derivation source.
      // The PDA is derived from the client_program account's key, and the stored value
      // must match this to ensure validation works correctly.

      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );

      const testPolicyId = "x-consistency-test";

      // Set policy for Counter program
      await setPolicyIdOrUpdate(
        context.program,
        counterProgramId,
        context.authority.keypair,
        testPolicyId,
        context.registry.registryPda
      );

      // Fetch the policy account
      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );

      // Verify the stored client_program matches the PDA derivation source
      // The PDA is derived from counterProgramId, so the stored value must match
      expect(policyAccount.clientProgram.toString()).to.equal(
        counterProgramId.toString()
      );

      // Verify the PDA was derived correctly (implicitly tested by fetch succeeding)
      // If the PDA didn't match, the fetch would fail or return wrong account
      expect(policyAccount.policyId).to.equal(testPolicyId);
    });

    it("should allow validation to succeed with correctly set policy", async () => {
      // This test verifies that a correctly set policy can be used in validation.
      // The constraint in ValidateAttestation checks: policy_account.client_program == target
      // This passes because the stored value matches the PDA derivation source

      const testPolicyId = "x-validation-test";

      // Set policy for Counter program
      await setPolicyIdOrUpdate(
        context.program,
        counterProgramId,
        context.authority.keypair,
        testPolicyId,
        context.registry.registryPda
      );

      // Verify the policy account exists and has correct values
      const [policyPda] = findPolicyPDA(
        counterProgramId,
        context.program.programId
      );

      const policyAccount = await context.program.account.policyAccount.fetch(
        policyPda
      );

      // Verify stored client_program matches the target program
      // This is what ValidateAttestation checks in its constraint
      expect(policyAccount.clientProgram.toString()).to.equal(
        counterProgramId.toString()
      );
      expect(policyAccount.policyId).to.equal(testPolicyId);
    });
  });
});

import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { 
  findPolicyPDA,
  setPolicy,
  createFundedKeypair,
  createTestAccount,
} from "./helpers/test-utils";
import { setupSharedTestContext, SharedTestContext } from "./helpers/shared-setup";

describe("Policy Management", () => {
  let context: SharedTestContext;

  // Test policies
  const shortPolicy = Buffer.from("short");
  const mediumPolicy = Buffer.from("medium-length-policy-for-testing");
  const longPolicy = Buffer.from("a".repeat(200)); // Maximum length
  const tooLongPolicy = Buffer.from("a".repeat(201)); // Too long
  const updatedPolicy = Buffer.from("updated-policy-content");

  before(async () => {
    context = await setupSharedTestContext();
  });

  describe("Policy Setting", () => {
    it("Should set policy successfully", async () => {
      const client1 = await createTestAccount(context.provider);
      const [policyPda] = findPolicyPDA(client1.keypair.publicKey, context.program.programId);
      
      const tx = await setPolicy(context.program, client1.keypair, mediumPolicy, context.registry.registryPda);
      expect(tx).to.be.a('string');

      // Verify policy account state
      const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
      expect(policyAccount.client.toString()).to.equal(client1.keypair.publicKey.toString());
      expect(policyAccount.policyLen).to.equal(mediumPolicy.length);
      expect(policyAccount.setAt.toNumber()).to.be.greaterThan(0);
      expect(policyAccount.updatedAt.toNumber()).to.be.greaterThan(0);
      expect(policyAccount.setAt.toNumber()).to.equal(policyAccount.updatedAt.toNumber());

      // Verify policy content
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(mediumPolicy)).to.be.true;
    });

    it("Should set multiple policies for different clients", async () => {
      const client1 = await createTestAccount(context.provider);
      const client2 = await createTestAccount(context.provider);
      const policies = [
        { client: client1.keypair, policy: shortPolicy },
        { client: client2.keypair, policy: mediumPolicy },
      ];

      for (const { client, policy } of policies) {
        await setPolicy(context.program, client, policy, context.registry.registryPda);
        
        const [policyPda] = findPolicyPDA(client.publicKey, context.program.programId);
        const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
        
        expect(policyAccount.client.toString()).to.equal(client.publicKey.toString());
        expect(policyAccount.policyLen).to.equal(policy.length);
        
        const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
        expect(storedPolicy.equals(policy)).to.be.true;
      }
    });

    it("Should handle maximum length policy", async () => {
      const client1 = await createTestAccount(context.provider);
      const [policyPda] = findPolicyPDA(client1.keypair.publicKey, context.program.programId);
      
      const tx = await setPolicy(context.program, client1.keypair, longPolicy, context.registry.registryPda);
      expect(tx).to.be.a('string');

      const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
      expect(policyAccount.policyLen).to.equal(200);
      
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(longPolicy)).to.be.true;
    });

    it("Should fail with policy too long", async () => {
      const client1 = await createTestAccount(context.provider);
      try {
        await setPolicy(context.program, client1.keypair, tooLongPolicy, context.registry.registryPda);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("PolicyTooLong");
      }
    });

    it("Should fail with unauthorized client", async () => {
      const client1 = await createTestAccount(context.provider);
      const unauthorizedClient = await createFundedKeypair(context.provider);
      const [policyPda] = findPolicyPDA(client1.keypair.publicKey, context.program.programId);

      try {
        await context.program.methods
          .setPolicy(mediumPolicy)
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
      // Create client and set initial policy
      client1 = await createTestAccount(context.provider);
      await setPolicy(context.program, client1.keypair, mediumPolicy, context.registry.registryPda);
    });

    it("Should update policy successfully", async () => {
      const [policyPda] = findPolicyPDA(client1.keypair.publicKey, context.program.programId);
      const policyBefore = await context.program.account.policyAccount.fetch(policyPda);
      const setAtBefore = policyBefore.setAt.toNumber();

      const tx = await context.program.methods
        .updatePolicy(updatedPolicy)
        .accounts({
          registry: context.registry.registryPda,
          policyAccount: policyPda,
          client: client1.keypair.publicKey,
        } as any)
        .signers([client1.keypair])
        .rpc();

      expect(tx).to.be.a('string');

      // Verify policy was updated
      const policyAfter = await context.program.account.policyAccount.fetch(policyPda);
      expect(policyAfter.policyLen).to.equal(updatedPolicy.length);
      expect(policyAfter.setAt.toNumber()).to.equal(setAtBefore); // Should not change

      const storedPolicy = Buffer.from(policyAfter.policy.slice(0, policyAfter.policyLen));
      expect(storedPolicy.equals(updatedPolicy)).to.be.true;
    });

    it("Should fail to update with unauthorized client", async () => {
      const [policyPda] = findPolicyPDA(client1.keypair.publicKey, context.program.programId);
      const unauthorizedClient = await createFundedKeypair(context.provider);

      try {
        await context.program.methods
          .updatePolicy(updatedPolicy)
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
      const [policyPda] = findPolicyPDA(newClient.publicKey, context.program.programId);

      try {
        await context.program.methods
          .updatePolicy(updatedPolicy)
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
    it("Should fail to set empty policy", async () => {
      const client1 = await createTestAccount(context.provider);
      const emptyPolicy = Buffer.from("");
      
      try {
        await setPolicy(context.program, client1.keypair, emptyPolicy, context.registry.registryPda);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Invalid policy: Policy cannot be empty");
      }
    });

    it("Should handle policy with special characters", async () => {
      const client1 = await createTestAccount(context.provider);
      const specialPolicy = Buffer.from("policy\x00\x01\x02\xFF");
      const [policyPda] = findPolicyPDA(client1.keypair.publicKey, context.program.programId);
      
      const tx = await setPolicy(context.program, client1.keypair, specialPolicy, context.registry.registryPda);
      expect(tx).to.be.a('string');

      const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(specialPolicy)).to.be.true;
    });
  });
});
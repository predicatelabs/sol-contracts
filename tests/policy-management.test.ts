import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../target/types/predicate_registry";
import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { 
  createTestAccounts, 
  findRegistryPDAs, 
  findPolicyPDA,
  initializeRegistry,
  setPolicy,
  createFundedKeypair,
  TestAccounts, 
  TestPDAs 
} from "./helpers/test-utils";

describe("Policy Management", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  const provider = anchor.getProvider();

  let accounts: TestAccounts;
  let pdas: TestPDAs;

  // Test policies
  const shortPolicy = Buffer.from("short");
  const mediumPolicy = Buffer.from("medium-length-policy-for-testing");
  const longPolicy = Buffer.from("a".repeat(200)); // Maximum length
  const tooLongPolicy = Buffer.from("a".repeat(201)); // Too long
  const updatedPolicy = Buffer.from("updated-policy-content");

  beforeEach(async () => {
    accounts = await createTestAccounts(provider as anchor.AnchorProvider);
    pdas = findRegistryPDAs(program.programId);
    
    // Initialize registry for each test
    await initializeRegistry(program, accounts.authority, pdas.registryPda);
  });

  describe("Policy Setting", () => {
    it("Should set policy successfully", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      const tx = await setPolicy(program, accounts.client1, mediumPolicy, pdas.registryPda);
      expect(tx).to.be.a('string');

      // Verify policy account state
      const policyAccount = await program.account.policyAccount.fetch(policyPda);
      expect(policyAccount.client.toString()).to.equal(accounts.client1.publicKey.toString());
      expect(policyAccount.policyLen).to.equal(mediumPolicy.length);
      expect(policyAccount.setAt.toNumber()).to.be.greaterThan(0);
      expect(policyAccount.updatedAt.toNumber()).to.be.greaterThan(0);
      expect(policyAccount.setAt.toNumber()).to.equal(policyAccount.updatedAt.toNumber());

      // Verify policy content
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(mediumPolicy)).to.be.true;
    });

    it("Should set multiple policies for different clients", async () => {
      const policies = [
        { client: accounts.client1, policy: shortPolicy },
        { client: accounts.client2, policy: mediumPolicy },
      ];

      for (const { client, policy } of policies) {
        await setPolicy(program, client, policy, pdas.registryPda);
        
        const [policyPda] = findPolicyPDA(client.publicKey, program.programId);
        const policyAccount = await program.account.policyAccount.fetch(policyPda);
        
        const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
        expect(storedPolicy.equals(policy)).to.be.true;
      }
    });

    it("Should emit PolicySet event", async () => {
      let eventReceived = false;
      
      const listener = program.addEventListener("policySet", (event: any) => {
        expect(event.registry.toString()).to.equal(pdas.registryPda.toString());
        expect(event.client.toString()).to.equal(accounts.client1.publicKey.toString());
        expect(event.setter.toString()).to.equal(accounts.client1.publicKey.toString());
        expect(event.policy).to.equal(mediumPolicy.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
        eventReceived = true;
      });

      await setPolicy(program, accounts.client1, mediumPolicy, pdas.registryPda);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await program.removeEventListener(listener);
    });

    it("Should handle maximum length policy", async () => {
      await setPolicy(program, accounts.client1, longPolicy, pdas.registryPda);
      
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      const policyAccount = await program.account.policyAccount.fetch(policyPda);
      
      expect(policyAccount.policyLen).to.equal(200);
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(longPolicy)).to.be.true;
    });

    it("Should handle single character policy", async () => {
      const singleCharPolicy = Buffer.from("a");
      await setPolicy(program, accounts.client1, singleCharPolicy, pdas.registryPda);
      
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      const policyAccount = await program.account.policyAccount.fetch(policyPda);
      
      expect(policyAccount.policyLen).to.equal(1);
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(singleCharPolicy)).to.be.true;
    });

    it("Should fail to set empty policy", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      try {
        await program.methods
          .setPolicy(Buffer.from([]))
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: accounts.client1.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([accounts.client1])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("InvalidPolicy");
      }
    });

    it("Should fail to set policy that's too long", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      try {
        await program.methods
          .setPolicy(tooLongPolicy)
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: accounts.client1.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([accounts.client1])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("PolicyTooLong");
      }
    });

    it("Should fail to set same policy twice", async () => {
      // First policy set
      await setPolicy(program, accounts.client1, mediumPolicy, pdas.registryPda);
      
      // Second policy set should fail
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      try {
        await program.methods
          .setPolicy(shortPolicy)
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: accounts.client1.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([accounts.client1])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("Policy Updates", () => {
    beforeEach(async () => {
      // Set initial policies for update tests
      await setPolicy(program, accounts.client1, mediumPolicy, pdas.registryPda);
      await setPolicy(program, accounts.client2, shortPolicy, pdas.registryPda);
    });

    it("Should update policy successfully", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      const policyBefore = await program.account.policyAccount.fetch(policyPda);
      const updatedAtBefore = policyBefore.updatedAt.toNumber();

      await program.methods
        .updatePolicy(updatedPolicy)
        .accounts({
          registry: pdas.registryPda,
          policyAccount: policyPda,
          client: accounts.client1.publicKey,
        } as any)
        .signers([accounts.client1])
        .rpc();

      // Verify policy was updated
      const policyAfter = await program.account.policyAccount.fetch(policyPda);
      expect(policyAfter.policyLen).to.equal(updatedPolicy.length);
      expect(policyAfter.updatedAt.toNumber()).to.be.greaterThan(updatedAtBefore);
      expect(policyAfter.setAt.toNumber()).to.equal(policyBefore.setAt.toNumber()); // setAt should not change
      
      const storedPolicy = Buffer.from(policyAfter.policy.slice(0, policyAfter.policyLen));
      expect(storedPolicy.equals(updatedPolicy)).to.be.true;
    });

    it("Should emit PolicyUpdated event", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      let eventReceived = false;

      const listener = program.addEventListener("policyUpdated", (event: any) => {
        expect(event.registry.toString()).to.equal(pdas.registryPda.toString());
        expect(event.client.toString()).to.equal(accounts.client1.publicKey.toString());
        expect(event.previousPolicy).to.equal(mediumPolicy.toString());
        expect(event.newPolicy).to.equal(updatedPolicy.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
        eventReceived = true;
      });

      await program.methods
        .updatePolicy(updatedPolicy)
        .accounts({
          registry: pdas.registryPda,
          policyAccount: policyPda,
          client: accounts.client1.publicKey,
        } as any)
        .signers([accounts.client1])
        .rpc();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(eventReceived).to.be.true;

      await program.removeEventListener(listener);
    });

    it("Should update policy to maximum length", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      await program.methods
        .updatePolicy(longPolicy)
        .accounts({
          registry: pdas.registryPda,
          policyAccount: policyPda,
          client: accounts.client1.publicKey,
        } as any)
        .signers([accounts.client1])
        .rpc();

      const policyAccount = await program.account.policyAccount.fetch(policyPda);
      expect(policyAccount.policyLen).to.equal(200);
    });

    it("Should update policy to shorter length", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      await program.methods
        .updatePolicy(shortPolicy)
        .accounts({
          registry: pdas.registryPda,
          policyAccount: policyPda,
          client: accounts.client1.publicKey,
        } as any)
        .signers([accounts.client1])
        .rpc();

      const policyAccount = await program.account.policyAccount.fetch(policyPda);
      expect(policyAccount.policyLen).to.equal(shortPolicy.length);
      
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(shortPolicy)).to.be.true;
    });

    it("Should fail to update with wrong client", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      try {
        await program.methods
          .updatePolicy(updatedPolicy)
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: accounts.client2.publicKey, // Wrong client
          } as any)
          .signers([accounts.client2])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("Should fail to update non-existent policy", async () => {
      const nonExistentClient = await createFundedKeypair(provider as anchor.AnchorProvider);
      const [policyPda] = findPolicyPDA(nonExistentClient.publicKey, program.programId);

      try {
        await program.methods
          .updatePolicy(updatedPolicy)
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: nonExistentClient.publicKey,
          } as any)
          .signers([nonExistentClient])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("AccountNotInitialized");
      }
    });

    it("Should fail to update with empty policy", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      try {
        await program.methods
          .updatePolicy(Buffer.from([]))
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: accounts.client1.publicKey,
          } as any)
          .signers([accounts.client1])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("InvalidPolicy");
      }
    });

    it("Should fail to update with policy that's too long", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      
      try {
        await program.methods
          .updatePolicy(tooLongPolicy)
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: accounts.client1.publicKey,
          } as any)
          .signers([accounts.client1])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("PolicyTooLong");
      }
    });
  });

  describe("Policy Data Integrity", () => {
    it("Should properly pad and store policy data", async () => {
      const testPolicy = Buffer.from("test-policy-123");
      await setPolicy(program, accounts.client1, testPolicy, pdas.registryPda);
      
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      const policyAccount = await program.account.policyAccount.fetch(policyPda);
      
      // Check that unused bytes are zero
      for (let i = testPolicy.length; i < 200; i++) {
        expect(policyAccount.policy[i]).to.equal(0);
      }
    });

    it("Should handle binary data in policies", async () => {
      const binaryPolicy = Buffer.from([0, 1, 2, 3, 255, 254, 253, 252]);
      await setPolicy(program, accounts.client1, binaryPolicy, pdas.registryPda);
      
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      const policyAccount = await program.account.policyAccount.fetch(policyPda);
      
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(binaryPolicy)).to.be.true;
    });

    it("Should maintain policy length accuracy", async () => {
      const policies = [
        Buffer.from("a"),
        Buffer.from("ab"),
        Buffer.from("abc"),
        Buffer.from("a".repeat(100)),
        Buffer.from("a".repeat(199)),
        Buffer.from("a".repeat(200)),
      ];

      for (let i = 0; i < policies.length; i++) {
        const client = Keypair.generate();
        await provider.connection.requestAirdrop(client.publicKey, anchor.web3.LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await setPolicy(program, client, policies[i], pdas.registryPda);
        
        const [policyPda] = findPolicyPDA(client.publicKey, program.programId);
        const policyAccount = await program.account.policyAccount.fetch(policyPda);
        
        expect(policyAccount.policyLen).to.equal(policies[i].length);
      }
    });
  });

  describe("Multiple Updates", () => {
    it("Should handle multiple sequential updates", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      await setPolicy(program, accounts.client1, shortPolicy, pdas.registryPda);
      
      const updates = [
        Buffer.from("update-1"),
        Buffer.from("update-2-longer"),
        Buffer.from("u3"),
        Buffer.from("final-update-with-longer-content"),
      ];

      for (const update of updates) {
        await program.methods
          .updatePolicy(update)
          .accounts({
            registry: pdas.registryPda,
            policyAccount: policyPda,
            client: accounts.client1.publicKey,
          } as any)
          .signers([accounts.client1])
          .rpc();

        const policyAccount = await program.account.policyAccount.fetch(policyPda);
        const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
        expect(storedPolicy.equals(update)).to.be.true;
      }
    });

    it("Should maintain correct timestamps across updates", async () => {
      const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
      await setPolicy(program, accounts.client1, shortPolicy, pdas.registryPda);
      
      const policyBefore = await program.account.policyAccount.fetch(policyPda);
      const setAt = policyBefore.setAt.toNumber();
      let lastUpdatedAt = policyBefore.updatedAt.toNumber();

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));

      await program.methods
        .updatePolicy(updatedPolicy)
        .accounts({
          registry: pdas.registryPda,
          policyAccount: policyPda,
          client: accounts.client1.publicKey,
        } as any)
        .signers([accounts.client1])
        .rpc();

      const policyAfter = await program.account.policyAccount.fetch(policyPda);
      expect(policyAfter.setAt.toNumber()).to.equal(setAt); // Should not change
      expect(policyAfter.updatedAt.toNumber()).to.be.greaterThan(lastUpdatedAt);
    });
  });
});

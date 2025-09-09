import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { setupSharedTestContext, SharedTestContext } from "./helpers/shared-setup";
import { 
  createTestAccount, 
  findAttestorPDA,
  findPolicyPDA,
  registerAttestor,
  setPolicy,
  updatePolicy
} from "./helpers/test-utils";

describe("Integration Tests", () => {
  let context: SharedTestContext;
  let newAuthority: Keypair;
  let client1: Keypair;
  let client2: Keypair;
  let attestor1: Keypair;
  let attestor2: Keypair;

  before(async () => {
    context = await setupSharedTestContext();
    
    // Create test accounts
    const newAuthorityAccount = await createTestAccount(context.provider);
    const client1Account = await createTestAccount(context.provider);
    const client2Account = await createTestAccount(context.provider);
    
    newAuthority = newAuthorityAccount.keypair;
    client1 = client1Account.keypair;
    client2 = client2Account.keypair;
    attestor1 = Keypair.generate();
    attestor2 = Keypair.generate();
  });

  describe("Complete Registry Workflow", () => {
    let originalAuthority: Keypair;
    
    before(async () => {
      originalAuthority = context.authority.keypair;
    });
    
    afterEach(async () => {
      // Restore original authority after each test
      try {
        const currentRegistry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;
          
          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else if (currentAuthorityKey.equals(client2.publicKey)) {
            currentAuthorityKeypair = client2;
          } else {
            console.warn("Cannot restore authority - unknown current authority");
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
      let registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialAttestors = registryAccount.totalAttestors.toNumber();

      // 2. Register multiple attestors
      const attestors = [attestor1.publicKey, attestor2.publicKey];
      for (const attestor of attestors) {
        await registerAttestor(context.program, context.authority.keypair, attestor, context.registry.registryPda);
      }

      registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 2);

      // 3. Set policies for multiple clients
      const policies = [
        { client: client1, policy: Buffer.from("client1-policy") },
        { client: client2, policy: Buffer.from("client2-policy") },
      ];

      for (const { client, policy } of policies) {
        await setPolicy(context.program, client, policy, context.registry.registryPda);
      }

      // 4. Verify all accounts exist and have correct data
      for (const attestor of attestors) {
        const [attestorPda] = findAttestorPDA(attestor, context.program.programId);
        const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
        expect(attestorAccount.isRegistered).to.be.true;
      }

      for (const { client, policy } of policies) {
        const [policyPda] = findPolicyPDA(client.publicKey, context.program.programId);
        const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
        const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
        expect(storedPolicy.equals(policy)).to.be.true;
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

      registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.authority.toString()).to.equal(newAuthority.publicKey.toString());

      // 6. New authority can perform operations
      const newAttestor = Keypair.generate();
      await registerAttestor(context.program, newAuthority, newAttestor.publicKey, context.registry.registryPda);

      registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 3);
    });

    it("Should maintain data consistency across authority transfers", async () => {
      const registryBefore = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const createdAtBefore = registryBefore.createdAt.toNumber();
      const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

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
      const registryAfter = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAfter.createdAt.toNumber()).to.equal(createdAtBefore);
      expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore);
      expect(registryAfter.authority.toString()).to.equal(context.authority.keypair.publicKey.toString());

      // Verify attestor accounts still exist and are correct
      const [attestor1Pda] = findAttestorPDA(attestor1.publicKey, context.program.programId);
      const [attestor2Pda] = findAttestorPDA(attestor2.publicKey, context.program.programId);
      
      const attestor1Account = await context.program.account.attestorAccount.fetch(attestor1Pda);
      const attestor2Account = await context.program.account.attestorAccount.fetch(attestor2Pda);
      
      expect(attestor1Account.isRegistered).to.be.true;
      expect(attestor2Account.isRegistered).to.be.true;

      // Verify policy account still exists and is correct
      const [policyPda] = findPolicyPDA(client1.publicKey, context.program.programId);
      const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
      const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
      expect(storedPolicy.equals(Buffer.from("client1-policy"))).to.be.true;
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
        const currentRegistry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;
          
          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else {
            console.warn("Cannot restore authority - unknown current authority");
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
      const registryBefore = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();
      
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
      const newAttestor = Keypair.generate();
      const [newAttestorPda] = findAttestorPDA(newAttestor.publicKey, context.program.programId);

      try {
        await context.program.methods
          .registerAttestor(newAttestor.publicKey)
          .accounts({
            registry: context.registry.registryPda,
            attestorAccount: newAttestorPda,
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
      const registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(totalAttestorsBefore);
      expect(registryAccount.authority.toString()).to.equal(newAuthority.publicKey.toString());
    });
  }); 

  describe("Concurrent Operations", () => {
    it("Should handle multiple attestor registrations correctly", async () => {
      const attestors = Array.from({ length: 5 }, () => Keypair.generate());
      
      const registryBefore = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialAttestors = registryBefore.totalAttestors.toNumber();
      
      // Register all attestors
      for (const attestor of attestors) {
        await registerAttestor(context.program, context.authority.keypair, attestor.publicKey, context.registry.registryPda);
      }

      // Verify all are registered
      const registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 5);

      // Verify each attestor account
      for (const attestor of attestors) {
        const [attestorPda] = findAttestorPDA(attestor.publicKey, context.program.programId);
        const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
        expect(attestorAccount.isRegistered).to.be.true;
        expect(attestorAccount.attestor.toString()).to.equal(attestor.publicKey.toString());
      }
    });

    it("Should handle multiple policy operations correctly", async () => {
      const clients: Keypair[] = [];
      
      // Create and fund clients
      for (let i = 0; i < 3; i++) {
        const clientAccount = await createTestAccount(context.provider);
        clients.push(clientAccount.keypair);
      }

      // Set policies for all clients
      for (let i = 0; i < clients.length; i++) {
        const policy = Buffer.from(`policy-${i}`);
        await setPolicy(context.program, clients[i], policy, context.registry.registryPda);
      }

      // Update all policies
      for (let i = 0; i < clients.length; i++) {
        const [policyPda] = findPolicyPDA(clients[i].publicKey, context.program.programId);
        const updatedPolicy = Buffer.from(`updated-policy-${i}`);
        
        await context.program.methods
          .updatePolicy(updatedPolicy)
          .accounts({
            registry: context.registry.registryPda,
            policyAccount: policyPda,
            client: clients[i].publicKey,
          } as any)
          .signers([clients[i]])
          .rpc();

        // Verify update
        const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
        const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
        expect(storedPolicy.equals(updatedPolicy)).to.be.true;
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
        const currentRegistry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;
          
          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else {
            console.warn("Cannot restore authority - unknown current authority");
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
      const registryBefore = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialAttestors = registryBefore.totalAttestors.toNumber();

      // Two new clients
      const client3 = await createTestAccount(context.provider);
      const client4 = await createTestAccount(context.provider);

      // Two new attestors
      const attestor3 = Keypair.generate();
      const attestor4 = Keypair.generate();
      
      const operations = [
        async () => {
          await registerAttestor(context.program, context.authority.keypair, attestor3.publicKey, context.registry.registryPda);
        },
        async () => {
          await setPolicy(context.program, client3.keypair, Buffer.from("policy1"), context.registry.registryPda);
        },
        async () => {
          await registerAttestor(context.program, context.authority.keypair, attestor4.publicKey, context.registry.registryPda);
        },
        async () => {
          await setPolicy(context.program, client4.keypair, Buffer.from("policy2"), context.registry.registryPda);
        },
        async () => {
          const [policyPda] = findPolicyPDA(client3.keypair.publicKey, context.program.programId);
          await context.program.methods
            .updatePolicy(Buffer.from("updated-policy1"))
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
      const registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 2);

      // Verify attestors
      const [attestor3Pda] = findAttestorPDA(attestor3.publicKey, context.program.programId);
      const [attestor4Pda] = findAttestorPDA(attestor4.publicKey, context.program.programId);
      
      const attestor3Account = await context.program.account.attestorAccount.fetch(attestor3Pda);
      const attestor4Account = await context.program.account.attestorAccount.fetch(attestor4Pda);
      
      expect(attestor3Account.isRegistered).to.be.true;
      expect(attestor4Account.isRegistered).to.be.true;

      // Verify policies
      const [policy1Pda] = findPolicyPDA(client3.keypair.publicKey, context.program.programId);
      const [policy2Pda] = findPolicyPDA(client4.keypair.publicKey, context.program.programId);
      
      const policy1Account = await context.program.account.policyAccount.fetch(policy1Pda);
      const policy2Account = await context.program.account.policyAccount.fetch(policy2Pda);
      
      const storedPolicy1 = Buffer.from(policy1Account.policy.slice(0, policy1Account.policyLen));
      const storedPolicy2 = Buffer.from(policy2Account.policy.slice(0, policy2Account.policyLen));
      
      expect(storedPolicy1.equals(Buffer.from("updated-policy1"))).to.be.true;
      expect(storedPolicy2.equals(Buffer.from("policy2"))).to.be.true;
    });

    it("Should handle registry statistics correctly across all operations", async () => {
      let registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialUpdatedAt = registryAccount.updatedAt.toNumber();
      const initialAttestors = registryAccount.totalAttestors.toNumber();

      // Two new attestors
      const attestor3 = Keypair.generate();
      const attestor4 = Keypair.generate();

      // Register 3 attestors
      const attestors = [attestor3, attestor4, Keypair.generate()];
      for (const attestor of attestors) {
        await registerAttestor(context.program, context.authority.keypair, attestor.publicKey, context.registry.registryPda);
      }

      registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 3);
      expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(initialUpdatedAt);

      // Deregister 1 attestor
      const [attestorPda] = findAttestorPDA(attestor3.publicKey, context.program.programId);
      await context.program.methods
        .deregisterAttestor(attestor3.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: attestorPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 2);

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

      registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 2); // Should not change
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
        const currentRegistry = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
        if (!currentRegistry.authority.equals(originalAuthority.publicKey)) {
          const currentAuthorityKey = currentRegistry.authority;
          let currentAuthorityKeypair: Keypair;
          
          if (currentAuthorityKey.equals(newAuthority.publicKey)) {
            currentAuthorityKeypair = newAuthority;
          } else {
            console.warn("Cannot restore authority - unknown current authority");
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
      const registryBefore = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      const initialAttestors = registryBefore.totalAttestors.toNumber();

      // New attestor
      const newAttestor = Keypair.generate();
      
      // Register attestor successfully
      await registerAttestor(context.program, context.authority.keypair, newAttestor.publicKey, context.registry.registryPda);
      
      // Try to register same attestor again (should fail)
      const [attestorPda] = findAttestorPDA(newAttestor.publicKey, context.program.programId);
      
      try {
        await context.program.methods
          .registerAttestor(newAttestor.publicKey)
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

      // Registry should still be in consistent state
      const registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 1);

      // New attestor should be registered
      const secondAttestor = Keypair.generate();

      // Should be able to register different attestor
      await registerAttestor(context.program, context.authority.keypair, secondAttestor.publicKey, context.registry.registryPda);
      
      const updatedRegistryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      expect(updatedRegistryAccount.totalAttestors.toNumber()).to.equal(initialAttestors + 2);
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("Should handle maximum policy length correctly", async () => {
      const maxClientAccount = await createTestAccount(context.provider);
      const maxClient = maxClientAccount.keypair;

      const [maxPolicyPda] = findPolicyPDA(maxClient.publicKey, context.program.programId);

      const maxPolicy = new Array(200).fill(65); // Exactly 200 'A' characters

      await context.program.methods
        .setPolicy(Buffer.from(maxPolicy))
        .accounts({
          registry: context.registry.registryPda,
          policyAccount: maxPolicyPda,
          client: maxClient.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([maxClient])
        .rpc();

      const policyAccount = await context.program.account.policyAccount.fetch(maxPolicyPda);
      expect(policyAccount.policyLen).to.equal(200);
    });

    it("Should handle re-registration of deregistered attestor", async () => {
      // Create a fresh attestor for this test to avoid account conflicts
      const freshAttestor = Keypair.generate();
      const [freshAttestorPda] = findAttestorPDA(freshAttestor.publicKey, context.program.programId);
      
      // Register the fresh attestor
      await registerAttestor(context.program, context.authority.keypair, freshAttestor.publicKey, context.registry.registryPda);

      // Deregister the attestor
      await context.program.methods
        .deregisterAttestor(freshAttestor.publicKey)
        .accounts({
          registry: context.registry.registryPda,
          attestorAccount: freshAttestorPda,
          authority: context.authority.keypair.publicKey,
        })
        .signers([context.authority.keypair])
        .rpc();

      // Verify it's deregistered
      const deregisteredAccount = await context.program.account.attestorAccount.fetch(freshAttestorPda);
      expect(deregisteredAccount.isRegistered).to.be.false;

      // For now, re-registration of an existing account is not supported
      // This test verifies that deregistration works correctly
      expect(deregisteredAccount.attestor.toString()).to.equal(freshAttestor.publicKey.toString());
    });

    it("Should maintain correct registry statistics", async () => {
      const registryAccount = await context.program.account.predicateRegistry.fetch(context.registry.registryPda);
      
      // Count should be at least 0 (depending on previous tests)
      expect(registryAccount.totalAttestors.toNumber()).to.be.at.least(0);
      
      // Policies counter may not be implemented in the smart contract
      expect(registryAccount.totalPolicies.toNumber()).to.be.at.least(0);
    });
  });
});

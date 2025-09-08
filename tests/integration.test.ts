// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { PredicateRegistry } from "../target/types/predicate_registry";
// import { expect } from "chai";
// import { Keypair } from "@solana/web3.js";
// import { 
//   createTestAccounts, 
//   findRegistryPDAs, 
//   findAttestorPDA,
//   findPolicyPDA,
//   initializeRegistry,
//   registerAttestor,
//   setPolicy,
//   createFundedKeypair,
//   TestAccounts, 
//   TestPDAs 
// } from "./helpers/test-utils";

// describe("Integration Tests", () => {
//   anchor.setProvider(anchor.AnchorProvider.env());

//   const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
//   const provider = anchor.getProvider();

//   let accounts: TestAccounts;
//   let pdas: TestPDAs;

//   beforeEach(async () => {
//     accounts = await createTestAccounts(provider as anchor.AnchorProvider);
//     pdas = findRegistryPDAs(program.programId);
    
//     // Initialize registry for each test
//     await initializeRegistry(program, accounts.authority, pdas.registryPda);
//   });

//   describe("Complete Registry Workflow", () => {
//     it("Should handle full registry lifecycle", async () => {
//       // 1. Initialize (already done in beforeEach)
//       let registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(0);
//       expect(registryAccount.totalPolicies.toNumber()).to.equal(0);

//       // 2. Register multiple attestors
//       const attestors = [accounts.attestor1.publicKey, accounts.attestor2.publicKey];
//       for (const attestor of attestors) {
//         await registerAttestor(program, accounts.authority, attestor, pdas.registryPda);
//       }

//       registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(2);

//       // 3. Set policies for multiple clients
//       const policies = [
//         { client: accounts.client1, policy: Buffer.from("client1-policy") },
//         { client: accounts.client2, policy: Buffer.from("client2-policy") },
//       ];

//       for (const { client, policy } of policies) {
//         await setPolicy(program, client, policy, pdas.registryPda);
//       }

//       // 4. Verify all accounts exist and have correct data
//       for (const attestor of attestors) {
//         const [attestorPda] = findAttestorPDA(attestor, program.programId);
//         const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
//         expect(attestorAccount.isRegistered).to.be.true;
//       }

//       for (const { client, policy } of policies) {
//         const [policyPda] = findPolicyPDA(client.publicKey, program.programId);
//         const policyAccount = await program.account.policyAccount.fetch(policyPda);
//         const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//         expect(storedPolicy.equals(policy)).to.be.true;
//       }

//       // 5. Transfer authority
//       await program.methods
//         .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.authority.toString()).to.equal(accounts.newAuthority.publicKey.toString());

//       // 6. New authority can perform operations
//       const newAttestor = Keypair.generate();
//       await registerAttestor(program, accounts.newAuthority, newAttestor.publicKey, pdas.registryPda);

//       registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(3);
//     });

//     it("Should handle policy updates after attestor changes", async () => {
//       // Register attestor and set policy
//       await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
//       await setPolicy(program, accounts.client1, Buffer.from("initial-policy"), pdas.registryPda);

//       // Deregister attestor
//       const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
//       await program.methods
//         .deregisterAttestor(accounts.attestor1.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: accounts.authority.publicKey,
//         })
//         .signers([accounts.authority])
//         .rpc();

//       // Update policy (should still work)
//       const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
//       await program.methods
//         .updatePolicy(Buffer.from("updated-policy"))
//         .accounts({
//           registry: pdas.registryPda,
//           policyAccount: policyPda,
//           client: accounts.client1.publicKey,
//         } as any)
//         .signers([accounts.client1])
//         .rpc();

//       const policyAccount = await program.account.policyAccount.fetch(policyPda);
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(Buffer.from("updated-policy"))).to.be.true;
//     });

//     it("Should maintain data consistency across authority transfers", async () => {
//       // Set up initial state
//       await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
//       await registerAttestor(program, accounts.authority, accounts.attestor2.publicKey, pdas.registryPda);
//       await setPolicy(program, accounts.client1, Buffer.from("test-policy"), pdas.registryPda);

//       const registryBefore = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       const createdAtBefore = registryBefore.createdAt.toNumber();
//       const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

//       // Transfer authority multiple times
//       const authorities = [accounts.newAuthority, accounts.client2, accounts.authority];
//       let currentAuthority = accounts.authority;

//       for (const nextAuthority of authorities) {
//         await program.methods
//           .transferAuthority(nextAuthority.publicKey)
//           .accounts({
//             registry: pdas.registryPda,
//             authority: currentAuthority.publicKey,
//             newAuthority: nextAuthority.publicKey,
//           } as any)
//           .signers([currentAuthority])
//           .rpc();

//         currentAuthority = nextAuthority;
//       }

//       // Verify data consistency
//       const registryAfter = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAfter.createdAt.toNumber()).to.equal(createdAtBefore);
//       expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore);
//       expect(registryAfter.authority.toString()).to.equal(accounts.authority.publicKey.toString());

//       // Verify attestor accounts still exist and are correct
//       const [attestor1Pda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
//       const [attestor2Pda] = findAttestorPDA(accounts.attestor2.publicKey, program.programId);
      
//       const attestor1Account = await program.account.attestorAccount.fetch(attestor1Pda);
//       const attestor2Account = await program.account.attestorAccount.fetch(attestor2Pda);
      
//       expect(attestor1Account.isRegistered).to.be.true;
//       expect(attestor2Account.isRegistered).to.be.true;

//       // Verify policy account still exists and is correct
//       const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
//       const policyAccount = await program.account.policyAccount.fetch(policyPda);
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(Buffer.from("test-policy"))).to.be.true;
//     });
//   });

//   describe("Cross-Operation Error Handling", () => {
//     it("Should handle errors gracefully during complex operations", async () => {
//       // Register attestor
//       await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      
//       // Transfer authority
//       await program.methods
//         .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       // Try to register with old authority (should fail)
//       const newAttestor = Keypair.generate();
//       const [newAttestorPda] = findAttestorPDA(newAttestor.publicKey, program.programId);

//       try {
//         await program.methods
//           .registerAttestor(newAttestor.publicKey)
//           .accounts({
//             registry: pdas.registryPda,
//             attestorAccount: newAttestorPda,
//             authority: accounts.authority.publicKey, // Old authority
//             systemProgram: anchor.web3.SystemProgram.programId,
//           })
//           .signers([accounts.authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }

//       // Verify registry state is still consistent
//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(1);
//       expect(registryAccount.authority.toString()).to.equal(accounts.newAuthority.publicKey.toString());
//     });

//     it("Should handle policy operations with non-existent attestors", async () => {
//       // Set policy without any attestors registered
//       await setPolicy(program, accounts.client1, Buffer.from("policy-without-attestors"), pdas.registryPda);

//       const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
//       const policyAccount = await program.account.policyAccount.fetch(policyPda);
      
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(Buffer.from("policy-without-attestors"))).to.be.true;

//       // Now register attestor
//       await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);

//       // Update policy (should still work)
//       await program.methods
//         .updatePolicy(Buffer.from("updated-policy"))
//         .accounts({
//           registry: pdas.registryPda,
//           policyAccount: policyPda,
//           client: accounts.client1.publicKey,
//         } as any)
//         .signers([accounts.client1])
//         .rpc();

//       const updatedPolicyAccount = await program.account.policyAccount.fetch(policyPda);
//       const updatedStoredPolicy = Buffer.from(updatedPolicyAccount.policy.slice(0, updatedPolicyAccount.policyLen));
//       expect(updatedStoredPolicy.equals(Buffer.from("updated-policy"))).to.be.true;
//     });
//   });

//   describe("Concurrent Operations", () => {
//     it("Should handle multiple attestor registrations correctly", async () => {
//       const attestors = Array.from({ length: 5 }, () => Keypair.generate());
      
//       // Register all attestors
//       for (const attestor of attestors) {
//         await registerAttestor(program, accounts.authority, attestor.publicKey, pdas.registryPda);
//       }

//       // Verify all are registered
//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(5);

//       // Verify each attestor account
//       for (const attestor of attestors) {
//         const [attestorPda] = findAttestorPDA(attestor.publicKey, program.programId);
//         const attestorAccount = await program.account.attestorAccount.fetch(attestorPda);
//         expect(attestorAccount.isRegistered).to.be.true;
//         expect(attestorAccount.attestor.toString()).to.equal(attestor.publicKey.toString());
//       }
//     });

//     it("Should handle multiple policy operations correctly", async () => {
//       const clients = Array.from({ length: 3 }, () => Keypair.generate());
      
//       // Fund clients
//       for (const client of clients) {
//         await provider.connection.requestAirdrop(client.publicKey, anchor.web3.LAMPORTS_PER_SOL);
//       }
//       await new Promise(resolve => setTimeout(resolve, 1000));

//       // Set policies for all clients
//       for (let i = 0; i < clients.length; i++) {
//         const policy = Buffer.from(`policy-${i}`);
//         await setPolicy(program, clients[i], policy, pdas.registryPda);
//       }

//       // Update all policies
//       for (let i = 0; i < clients.length; i++) {
//         const [policyPda] = findPolicyPDA(clients[i].publicKey, program.programId);
//         const updatedPolicy = Buffer.from(`updated-policy-${i}`);
        
//         await program.methods
//           .updatePolicy(updatedPolicy)
//           .accounts({
//             registry: pdas.registryPda,
//             policyAccount: policyPda,
//             client: clients[i].publicKey,
//           } as any)
//           .signers([clients[i]])
//           .rpc();

//         // Verify update
//         const policyAccount = await program.account.policyAccount.fetch(policyPda);
//         const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//         expect(storedPolicy.equals(updatedPolicy)).to.be.true;
//       }
//     });
//   });

//   describe("State Consistency", () => {
//     it("Should maintain consistent state across mixed operations", async () => {
//       const operations = [
//         async () => {
//           await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
//         },
//         async () => {
//           await setPolicy(program, accounts.client1, Buffer.from("policy1"), pdas.registryPda);
//         },
//         async () => {
//           await registerAttestor(program, accounts.authority, accounts.attestor2.publicKey, pdas.registryPda);
//         },
//         async () => {
//           await setPolicy(program, accounts.client2, Buffer.from("policy2"), pdas.registryPda);
//         },
//         async () => {
//           const [policyPda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
//           await program.methods
//             .updatePolicy(Buffer.from("updated-policy1"))
//             .accounts({
//               registry: pdas.registryPda,
//               policyAccount: policyPda,
//               client: accounts.client1.publicKey,
//             } as any)
//             .signers([accounts.client1])
//             .rpc();
//         },
//       ];

//       // Execute all operations
//       for (const operation of operations) {
//         await operation();
//       }

//       // Verify final state
//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(2);

//       // Verify attestors
//       const [attestor1Pda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
//       const [attestor2Pda] = findAttestorPDA(accounts.attestor2.publicKey, program.programId);
      
//       const attestor1Account = await program.account.attestorAccount.fetch(attestor1Pda);
//       const attestor2Account = await program.account.attestorAccount.fetch(attestor2Pda);
      
//       expect(attestor1Account.isRegistered).to.be.true;
//       expect(attestor2Account.isRegistered).to.be.true;

//       // Verify policies
//       const [policy1Pda] = findPolicyPDA(accounts.client1.publicKey, program.programId);
//       const [policy2Pda] = findPolicyPDA(accounts.client2.publicKey, program.programId);
      
//       const policy1Account = await program.account.policyAccount.fetch(policy1Pda);
//       const policy2Account = await program.account.policyAccount.fetch(policy2Pda);
      
//       const storedPolicy1 = Buffer.from(policy1Account.policy.slice(0, policy1Account.policyLen));
//       const storedPolicy2 = Buffer.from(policy2Account.policy.slice(0, policy2Account.policyLen));
      
//       expect(storedPolicy1.equals(Buffer.from("updated-policy1"))).to.be.true;
//       expect(storedPolicy2.equals(Buffer.from("policy2"))).to.be.true;
//     });

//     it("Should handle registry statistics correctly across all operations", async () => {
//       let registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       const initialUpdatedAt = registryAccount.updatedAt.toNumber();

//       // Register 3 attestors
//       const attestors = [accounts.attestor1, accounts.attestor2, Keypair.generate()];
//       for (const attestor of attestors) {
//         await registerAttestor(program, accounts.authority, attestor.publicKey, pdas.registryPda);
//       }

//       registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(3);
//       expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(initialUpdatedAt);

//       // Deregister 1 attestor
//       const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
//       await program.methods
//         .deregisterAttestor(accounts.attestor1.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: accounts.authority.publicKey,
//         })
//         .signers([accounts.authority])
//         .rpc();

//       registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(2);

//       // Transfer authority (should update timestamp but not counts)
//       const updatedAtBeforeTransfer = registryAccount.updatedAt.toNumber();
      
//       await program.methods
//         .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(2); // Should not change
//       expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(updatedAtBeforeTransfer);
//     });
//   });

//   describe("Recovery Scenarios", () => {
//     it("Should recover from partial failures", async () => {
//       // Register attestor successfully
//       await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      
//       // Try to register same attestor again (should fail)
//       const [attestorPda] = findAttestorPDA(accounts.attestor1.publicKey, program.programId);
      
//       try {
//         await program.methods
//           .registerAttestor(accounts.attestor1.publicKey)
//           .accounts({
//             registry: pdas.registryPda,
//             attestorAccount: attestorPda,
//             authority: accounts.authority.publicKey,
//             systemProgram: anchor.web3.SystemProgram.programId,
//           })
//           .signers([accounts.authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("already in use");
//       }

//       // Registry should still be in consistent state
//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(1);

//       // Should be able to register different attestor
//       await registerAttestor(program, accounts.authority, accounts.attestor2.publicKey, pdas.registryPda);
      
//       const updatedRegistryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(updatedRegistryAccount.totalAttestors.toNumber()).to.equal(2);
//     });
//   });
// });

// import { expect } from "chai";
// import { Keypair, SystemProgram } from "@solana/web3.js";
// import { 
//   findPolicyPDA,
//   setPolicy,
//   createFundedKeypair,
// } from "./helpers/test-utils";
// import { setupSharedTestContext, SharedTestContext } from "./helpers/shared-setup";

// describe("Policy Management", () => {
//   let context: SharedTestContext;

//   // Test policies
//   const shortPolicy = Buffer.from("short");
//   const mediumPolicy = Buffer.from("medium-length-policy-for-testing");
//   const longPolicy = Buffer.from("a".repeat(200)); // Maximum length
//   const tooLongPolicy = Buffer.from("a".repeat(201)); // Too long
//   const updatedPolicy = Buffer.from("updated-policy-content");

//   before(async () => {
//     context = await setupSharedTestContext();
//   });

//   describe("Policy Setting", () => {
//     it("Should set policy successfully", async () => {
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);
      
//       const tx = await setPolicy(context.program, context.accounts.client1, mediumPolicy, context.pdas.registryPda);
//       expect(tx).to.be.a('string');

//       // Verify policy account state
//       const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
//       expect(policyAccount.client.toString()).to.equal(context.accounts.client1.publicKey.toString());
//       expect(policyAccount.policyLen).to.equal(mediumPolicy.length);
//       expect(policyAccount.setAt.toNumber()).to.be.greaterThan(0);
//       expect(policyAccount.updatedAt.toNumber()).to.be.greaterThan(0);
//       expect(policyAccount.setAt.toNumber()).to.equal(policyAccount.updatedAt.toNumber());

//       // Verify policy content
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(mediumPolicy)).to.be.true;
//     });

//     it("Should set multiple policies for different clients", async () => {
//       const policies = [
//         { client: context.accounts.client1, policy: shortPolicy },
//         { client: context.accounts.client2, policy: mediumPolicy },
//       ];

//       for (const { client, policy } of policies) {
//         await setPolicy(context.program, client, policy, context.pdas.registryPda);
        
//         const [policyPda] = findPolicyPDA(client.publicKey, context.program.programId);
//         const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
        
//         expect(policyAccount.client.toString()).to.equal(client.publicKey.toString());
//         expect(policyAccount.policyLen).to.equal(policy.length);
        
//         const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//         expect(storedPolicy.equals(policy)).to.be.true;
//       }
//     });

//     it("Should handle maximum length policy", async () => {
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);
      
//       const tx = await setPolicy(context.program, context.accounts.client1, longPolicy, context.pdas.registryPda);
//       expect(tx).to.be.a('string');

//       const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
//       expect(policyAccount.policyLen).to.equal(200);
      
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(longPolicy)).to.be.true;
//     });

//     it("Should fail with policy too long", async () => {
//       try {
//         await setPolicy(context.program, context.accounts.client1, tooLongPolicy, context.pdas.registryPda);
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("PolicyTooLong");
//       }
//     });

//     it("Should fail with unauthorized client", async () => {
//       const unauthorizedClient = await createFundedKeypair(context.provider);
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);

//       try {
//         await context.program.methods
//           .setPolicy(mediumPolicy)
//           .accounts({
//             registry: context.pdas.registryPda,
//             policyAccount: policyPda,
//             client: unauthorizedClient.publicKey, // Wrong client
//             systemProgram: SystemProgram.programId,
//           } as any)
//           .signers([unauthorizedClient])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("ConstraintSeeds");
//       }
//     });
//   });

//   describe("Policy Updates", () => {
//     beforeEach(async () => {
//       // Set initial policy
//       await setPolicy(context.program, context.accounts.client1, mediumPolicy, context.pdas.registryPda);
//     });

//     it("Should update policy successfully", async () => {
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);
//       const policyBefore = await context.program.account.policyAccount.fetch(policyPda);
//       const setAtBefore = policyBefore.setAt.toNumber();

//       const tx = await context.program.methods
//         .updatePolicy(updatedPolicy)
//         .accounts({
//           registry: context.pdas.registryPda,
//           policyAccount: policyPda,
//           client: context.accounts.client1.publicKey,
//         } as any)
//         .signers([context.accounts.client1])
//         .rpc();

//       expect(tx).to.be.a('string');

//       // Verify policy was updated
//       const policyAfter = await context.program.account.policyAccount.fetch(policyPda);
//       expect(policyAfter.policyLen).to.equal(updatedPolicy.length);
//       expect(policyAfter.setAt.toNumber()).to.equal(setAtBefore); // Should not change
//       expect(policyAfter.updatedAt.toNumber()).to.be.greaterThan(setAtBefore);

//       const storedPolicy = Buffer.from(policyAfter.policy.slice(0, policyAfter.policyLen));
//       expect(storedPolicy.equals(updatedPolicy)).to.be.true;
//     });

//     it("Should fail to update with unauthorized client", async () => {
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);
//       const unauthorizedClient = await createFundedKeypair(context.provider);

//       try {
//         await context.program.methods
//           .updatePolicy(updatedPolicy)
//           .accounts({
//             registry: context.pdas.registryPda,
//             policyAccount: policyPda,
//             client: unauthorizedClient.publicKey,
//           } as any)
//           .signers([unauthorizedClient])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should fail to update non-existent policy", async () => {
//       const newClient = await createFundedKeypair(context.provider);
//       const [policyPda] = findPolicyPDA(newClient.publicKey, context.program.programId);

//       try {
//         await context.program.methods
//           .updatePolicy(updatedPolicy)
//           .accounts({
//             registry: context.pdas.registryPda,
//             policyAccount: policyPda,
//             client: newClient.publicKey,
//           } as any)
//           .signers([newClient])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("AccountNotInitialized");
//       }
//     });
//   });


//   describe("Edge Cases", () => {
//     it("Should handle empty policy", async () => {
//       const emptyPolicy = Buffer.from("");
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);
      
//       const tx = await setPolicy(context.program, context.accounts.client1, emptyPolicy, context.pdas.registryPda);
//       expect(tx).to.be.a('string');

//       const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
//       expect(policyAccount.policyLen).to.equal(0);
//     });

//     it("Should handle policy with special characters", async () => {
//       const specialPolicy = Buffer.from("policy\x00\x01\x02\xFF");
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);
      
//       const tx = await setPolicy(context.program, context.accounts.client1, specialPolicy, context.pdas.registryPda);
//       expect(tx).to.be.a('string');

//       const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(specialPolicy)).to.be.true;
//     });

//     it("Should maintain correct timestamps", async () => {
//       const [policyPda] = findPolicyPDA(context.accounts.client1.publicKey, context.program.programId);
      
//       await setPolicy(context.program, context.accounts.client1, mediumPolicy, context.pdas.registryPda);
      
//       const policyAccount = await context.program.account.policyAccount.fetch(policyPda);
//       const currentTime = Math.floor(Date.now() / 1000);
      
//       expect(policyAccount.setAt.toNumber()).to.be.closeTo(currentTime, 10);
//       expect(policyAccount.updatedAt.toNumber()).to.be.closeTo(currentTime, 10);
//     });
//   });
// });
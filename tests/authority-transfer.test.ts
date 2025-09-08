// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { PredicateRegistry } from "../target/types/predicate_registry";
// import { expect } from "chai";
// import { Keypair } from "@solana/web3.js";
// import { 
//   createTestAccounts, 
//   findRegistryPDA, 
//   initializeRegistry,
//   registerAttestor,
//   createFundedKeypair,
//   TestAccounts, 
//   TestPDA
// } from "./helpers/test-utils";

// describe("Authority Transfer", () => {
//   anchor.setProvider(anchor.AnchorProvider.env());

//   const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
//   const provider = anchor.getProvider();

//   let accounts: TestAccounts;
//   let pdas: TestPDA;

//   beforeEach(async () => {
//     accounts = await createTestAccounts(provider as anchor.AnchorProvider);
//     pdas = findRegistryPDA(program.programId);
    
//     // Initialize registry for each test
//     await initializeRegistry(program, accounts.authority, pdas.registryPda);
//   });

//   describe("Successful Authority Transfer", () => {
//     it("Should transfer authority successfully", async () => {
//       const registryBefore = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       const previousAuthority = registryBefore.authority;
//       const updatedAtBefore = registryBefore.updatedAt.toNumber();

//       const tx = await program.methods
//         .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       expect(tx).to.be.a('string');

//       // Verify authority was transferred
//       const registryAfter = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAfter.authority.toString()).to.equal(accounts.newAuthority.publicKey.toString());
//       expect(registryAfter.authority.toString()).to.not.equal(previousAuthority.toString());
//       expect(registryAfter.updatedAt.toNumber()).to.be.greaterThan(updatedAtBefore);
//     });

//     it("Should emit AuthorityTransferred event", async () => {
//       let eventReceived = false;
      
//       const listener = program.addEventListener("authorityTransferred", (event: any) => {
//         expect(event.registry.toString()).to.equal(pdas.registryPda.toString());
//         expect(event.previousAuthority.toString()).to.equal(accounts.authority.publicKey.toString());
//         expect(event.newAuthority.toString()).to.equal(accounts.newAuthority.publicKey.toString());
//         expect(event.timestamp.toNumber()).to.be.greaterThan(0);
//         eventReceived = true;
//       });

//       await program.methods
//         .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       await new Promise(resolve => setTimeout(resolve, 100));
//       expect(eventReceived).to.be.true;

//       await program.removeEventListener(listener);
//     });

//     it("Should allow transfer to same address (no-op)", async () => {
//       await program.methods
//         .transferAuthority(accounts.authority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.authority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.authority.toString()).to.equal(accounts.authority.publicKey.toString());
//     });

//     it("Should preserve other registry data during transfer", async () => {
//       // Add some data to the registry first
//       await registerAttestor(program, accounts.authority, accounts.attestor1.publicKey, pdas.registryPda);
      
//       const registryBefore = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();
//       const totalPoliciesBefore = registryBefore.totalPolicies.toNumber();
//       const createdAtBefore = registryBefore.createdAt.toNumber();

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

//       // Verify other data is preserved
//       const registryAfter = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore);
//       expect(registryAfter.totalPolicies.toNumber()).to.equal(totalPoliciesBefore);
//       expect(registryAfter.createdAt.toNumber()).to.equal(createdAtBefore);
//       expect(registryAfter.authority.toString()).to.equal(accounts.newAuthority.publicKey.toString());
//     });
//   });

//   describe("Authority Transfer Failures", () => {
//     it("Should fail with unauthorized current authority", async () => {
//       const unauthorizedAuthority = await createFundedKeypair(provider as anchor.AnchorProvider);

//       try {
//         await program.methods
//           .transferAuthority(accounts.newAuthority.publicKey)
//           .accounts({
//             registry: pdas.registryPda,
//             authority: unauthorizedAuthority.publicKey,
//             newAuthority: accounts.newAuthority.publicKey,
//           } as any)
//           .signers([unauthorizedAuthority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should fail after authority has been transferred", async () => {
//       // First transfer
//       await program.methods
//         .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       // Try to transfer again with old authority
//       try {
//         await program.methods
//           .transferAuthority(accounts.client1.publicKey)
//           .accounts({
//             registry: pdas.registryPda,
//             authority: accounts.authority.publicKey, // Old authority
//             newAuthority: accounts.client1.publicKey,
//           } as any)
//           .signers([accounts.authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should fail with missing signature", async () => {
//       try {
//         await program.methods
//           .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([]) // No signers
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Signature verification failed");
//       }
//     });

//     it("Should fail with wrong signer", async () => {
//       try {
//         await program.methods
//           .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.client1]) // Wrong signer
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("unknown signer");
//       }
//     });
//   });

//   describe("New Authority Operations", () => {
//     beforeEach(async () => {
//       // Transfer authority for these tests
//       await program.methods
//         .transferAuthority(accounts.newAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();
//     });

//     it("Should allow new authority to register attestors", async () => {
//       await registerAttestor(program, accounts.newAuthority, accounts.attestor1.publicKey, pdas.registryPda);

//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(1);
//     });

//     it("Should allow new authority to deregister attestors", async () => {
//       // Register first
//       await registerAttestor(program, accounts.newAuthority, accounts.attestor1.publicKey, pdas.registryPda);
      
//       // Then deregister
//       const [attestorPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), accounts.attestor1.publicKey.toBuffer()],
//         program.programId
//       );

//       await program.methods
//         .deregisterAttestor(accounts.attestor1.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.newAuthority])
//         .rpc();

//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(0);
//     });

//     it("Should allow new authority to transfer authority again", async () => {
//       const thirdAuthority = await createFundedKeypair(provider as anchor.AnchorProvider);

//       await program.methods
//         .transferAuthority(thirdAuthority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.newAuthority.publicKey,
//           newAuthority: thirdAuthority.publicKey,
//         } as any)
//         .signers([accounts.newAuthority])
//         .rpc();

//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.authority.toString()).to.equal(thirdAuthority.publicKey.toString());
//     });

//     it("Should prevent old authority from performing admin operations", async () => {
//       const [attestorPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), accounts.attestor1.publicKey.toBuffer()],
//         program.programId
//       );

//       try {
//         await program.methods
//           .registerAttestor(accounts.attestor1.publicKey)
//           .accounts({
//             registry: pdas.registryPda,
//             attestorAccount: attestorPda,
//             authority: accounts.authority.publicKey, // Old authority
//             systemProgram: anchor.web3.SystemProgram.programId,
//           } as any)
//           .signers([accounts.authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });
//   });

//   describe("Authority Transfer Chain", () => {
//     it("Should handle multiple authority transfers", async () => {
//       const authorities = [
//         accounts.newAuthority,
//         accounts.client1,
//         accounts.client2,
//         accounts.validator,
//       ];

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

//         const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//         expect(registryAccount.authority.toString()).to.equal(nextAuthority.publicKey.toString());

//         currentAuthority = nextAuthority;
//       }
//     });

//     it("Should maintain correct timestamps during multiple transfers", async () => {
//       const registryBefore = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       let lastUpdatedAt = registryBefore.updatedAt.toNumber();

//       const authorities = [accounts.newAuthority, accounts.client1];

//       let currentAuthority = accounts.authority;

//       for (const nextAuthority of authorities) {
//         // Wait to ensure timestamp difference
//         await new Promise(resolve => setTimeout(resolve, 1000));

//         await program.methods
//           .transferAuthority(nextAuthority.publicKey)
//           .accounts({
//             registry: pdas.registryPda,
//             authority: currentAuthority.publicKey,
//             newAuthority: nextAuthority.publicKey,
//           } as any)
//           .signers([currentAuthority])
//           .rpc();

//         const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//         expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(lastUpdatedAt);
        
//         lastUpdatedAt = registryAccount.updatedAt.toNumber();
//         currentAuthority = nextAuthority;
//       }
//     });
//   });

//   describe("Edge Cases", () => {
//     it("Should handle transfer to system program (edge case)", async () => {
//       // This is an edge case - transferring to system program
//       await program.methods
//         .transferAuthority(anchor.web3.SystemProgram.programId)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: anchor.web3.SystemProgram.programId,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.authority.toString()).to.equal(anchor.web3.SystemProgram.programId.toString());
//     });

//     it("Should handle transfer to program ID (edge case)", async () => {
//       await program.methods
//         .transferAuthority(program.programId)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.authority.publicKey,
//           newAuthority: program.programId,
//         } as any)
//         .signers([accounts.authority])
//         .rpc();

//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.authority.toString()).to.equal(program.programId.toString());
//     });

//     it("Should handle rapid successive transfers", async () => {
//       const authorities = [
//         accounts.newAuthority,
//         accounts.client1,
//         accounts.authority, // Back to original
//       ];

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

//       // Verify final state
//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.authority.toString()).to.equal(accounts.authority.publicKey.toString());
//     });

//     it("Should maintain registry functionality after authority transfer", async () => {
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

//       // Test that all admin functions still work with new authority
//       await registerAttestor(program, accounts.newAuthority, accounts.attestor1.publicKey, pdas.registryPda);
      
//       const [attestorPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), accounts.attestor1.publicKey.toBuffer()],
//         program.programId
//       );

//       await program.methods
//         .deregisterAttestor(accounts.attestor1.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: accounts.newAuthority.publicKey,
//         } as any)
//         .signers([accounts.newAuthority])
//         .rpc();

//       // Transfer back
//       await program.methods
//         .transferAuthority(accounts.authority.publicKey)
//         .accounts({
//           registry: pdas.registryPda,
//           authority: accounts.newAuthority.publicKey,
//           newAuthority: accounts.authority.publicKey,
//         } as any)
//         .signers([accounts.newAuthority])
//         .rpc();

//       const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
//       expect(registryAccount.authority.toString()).to.equal(accounts.authority.publicKey.toString());
//     });
//   });
// });

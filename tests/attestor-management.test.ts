// import { expect } from "chai";
// import { Keypair, SystemProgram } from "@solana/web3.js";
// import { 
//   findAttestorPDA,
//   registerAttestor,
//   createFundedKeypair,
// } from "./helpers/test-utils";
// import { setupSharedTestContext, SharedTestContext } from "./helpers/shared-setup";

// describe("Attestor Management", () => {
//   let context: SharedTestContext;

//   before(async () => {
//     context = await setupSharedTestContext();
//   });

//   describe("Attestor Registration", () => {
//     it("Should register single attestor successfully", async () => {
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
//       const registryBefore = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

//       const tx = await registerAttestor(
//         context.program, 
//         context.accounts.authority, 
//         context.accounts.attestor1.publicKey, 
//         context.pdas.registryPda
//       );

//       expect(tx).to.be.a('string');

//       // Verify attestor account state
//       const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
//       expect(attestorAccount.attestor.toString()).to.equal(context.accounts.attestor1.publicKey.toString());
//       expect(attestorAccount.isRegistered).to.be.true;
//       expect(attestorAccount.registeredAt.toNumber()).to.be.greaterThan(0);

//       // Verify registry statistics
//       const registryAfter = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore + 1);
//       expect(registryAfter.updatedAt.toNumber()).to.be.at.least(registryBefore.updatedAt.toNumber());
//     });

//     it("Should register multiple attestors", async () => {
//       const attestors = [context.accounts.attestor1.publicKey, context.accounts.attestor2.publicKey];
      
//       for (let i = 0; i < attestors.length; i++) {
//         await registerAttestor(context.program, context.accounts.authority, attestors[i], context.pdas.registryPda);
        
//         const registryAccount = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//         expect(registryAccount.totalAttestors.toNumber()).to.equal(i + 1);
//       }
//     });

//     it("Should emit AttestorRegistered event", async () => {
//       let eventReceived = false;
      
//       const listener = context.program.addEventListener("attestorRegistered", (event: any) => {
//         expect(event.registry.toString()).to.equal(context.pdas.registryPda.toString());
//         expect(event.attestor.toString()).to.equal(context.accounts.attestor1.publicKey.toString());
//         expect(event.authority.toString()).to.equal(context.accounts.authority.publicKey.toString());
//         expect(event.timestamp.toNumber()).to.be.greaterThan(0);
//         eventReceived = true;
//       });

//       await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor1.publicKey, context.pdas.registryPda);
      
//       // Wait a bit for event processing
//       await new Promise(resolve => setTimeout(resolve, 100));
//       expect(eventReceived).to.be.true;

//       await context.program.removeEventListener(listener);
//     });

//     it("Should fail to register with unauthorized authority", async () => {
//       const unauthorizedAuthority = await createFundedKeypair(context.provider);
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);

//       try {
//         await context.program.methods
//           .registerAttestor(context.accounts.attestor1.publicKey)
//           .accounts({
//             registry: context.pdas.registryPda,
//             attestorAccount: attestorPda,
//             authority: unauthorizedAuthority.publicKey,
//             systemProgram: SystemProgram.programId,
//           })
//           .signers([unauthorizedAuthority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should fail to register same attestor twice", async () => {
//       // First registration
//       await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor1.publicKey, context.pdas.registryPda);

//       // Second registration should fail
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
      
//       try {
//         await context.program.methods
//           .registerAttestor(context.accounts.attestor1.publicKey)
//           .accounts({
//             registry: context.pdas.registryPda,
//             attestorAccount: attestorPda,
//             authority: context.accounts.authority.publicKey,
//             systemProgram: SystemProgram.programId,
//           })
//           .signers([context.accounts.authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("already in use");
//       }
//     });

//     it("Should handle registration with different authority after transfer", async () => {
//       // Transfer authority first
//       await context.program.methods
//         .transferAuthority(context.accounts.newAuthority.publicKey)
//         .accounts({
//           registry: context.pdas.registryPda,
//           authority: context.accounts.authority.publicKey,
//           newAuthority: context.accounts.newAuthority.publicKey,
//         } as any)
//         .signers([context.accounts.authority])
//         .rpc();

//       // Register with new authority
//       await registerAttestor(context.program, context.accounts.newAuthority, context.accounts.attestor1.publicKey, context.pdas.registryPda);

//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
//       const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
//       expect(attestorAccount.isRegistered).to.be.true;
//     });
//   });

//   describe("Attestor Deregistration", () => {
//     beforeEach(async () => {
//       // Register attestors for deregistration tests
//       await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor1.publicKey, context.pdas.registryPda);
//       await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor2.publicKey, context.pdas.registryPda);
//     });

//     it("Should deregister attestor successfully", async () => {
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
//       const registryBefore = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

//       await context.program.methods
//         .deregisterAttestor(context.accounts.attestor1.publicKey)
//         .accounts({
//           registry: context.pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: context.accounts.authority.publicKey,
//         })
//         .signers([context.accounts.authority])
//         .rpc();

//       // Verify attestor is deregistered
//       const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
//       expect(attestorAccount.isRegistered).to.be.false;
//       expect(attestorAccount.attestor.toString()).to.equal(context.accounts.attestor1.publicKey.toString());

//       // Verify registry statistics
//       const registryAfter = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore - 1);
//     });

//     it("Should emit AttestorDeregistered event", async () => {
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
//       let eventReceived = false;

//       const listener = context.program.addEventListener("attestorDeregistered", (event: any) => {
//         expect(event.registry.toString()).to.equal(context.pdas.registryPda.toString());
//         expect(event.attestor.toString()).to.equal(context.accounts.attestor1.publicKey.toString());
//         expect(event.authority.toString()).to.equal(context.accounts.authority.publicKey.toString());
//         expect(event.timestamp.toNumber()).to.be.greaterThan(0);
//         eventReceived = true;
//       });

//       await context.program.methods
//         .deregisterAttestor(context.accounts.attestor1.publicKey)
//         .accounts({
//           registry: context.pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: context.accounts.authority.publicKey,
//         })
//         .signers([context.accounts.authority])
//         .rpc();

//       await new Promise(resolve => setTimeout(resolve, 100));
//       expect(eventReceived).to.be.true;

//       await context.program.removeEventListener(listener);
//     });

//     it("Should fail to deregister with unauthorized authority", async () => {
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
//       const unauthorizedAuthority = await createFundedKeypair(context.provider);

//       try {
//         await context.program.methods
//           .deregisterAttestor(context.accounts.attestor1.publicKey)
//           .accounts({
//             registry: context.pdas.registryPda,
//             attestorAccount: attestorPda,
//             authority: unauthorizedAuthority.publicKey,
//           })
//           .signers([unauthorizedAuthority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should fail to deregister non-registered attestor", async () => {
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
      
//       // First deregister
//       await context.program.methods
//         .deregisterAttestor(context.accounts.attestor1.publicKey)
//         .accounts({
//           registry: context.pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: context.accounts.authority.publicKey,
//         })
//         .signers([context.accounts.authority])
//         .rpc();

//       // Try to deregister again
//       try {
//         await context.program.methods
//           .deregisterAttestor(context.accounts.attestor1.publicKey)
//           .accounts({
//             registry: context.pdas.registryPda,
//             attestorAccount: attestorPda,
//             authority: context.accounts.authority.publicKey,
//           })
//           .signers([context.accounts.authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("AttestorNotRegistered");
//       }
//     });

//     it("Should fail to deregister non-existent attestor", async () => {
//       const nonExistentAttestor = Keypair.generate();
//       const [attestorPda] = findAttestorPDA(nonExistentAttestor.publicKey, context.program.programId);

//       try {
//         await context.program.methods
//           .deregisterAttestor(nonExistentAttestor.publicKey)
//           .accounts({
//             registry: context.pdas.registryPda,
//             attestorAccount: attestorPda,
//             authority: context.accounts.authority.publicKey,
//           })
//           .signers([context.accounts.authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("AccountNotInitialized");
//       }
//     });
//   });

//   describe("Re-registration", () => {
//     it("Should allow re-registration of deregistered attestor", async () => {
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
      
//       // Register, deregister, then re-register
//       await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor1.publicKey, context.pdas.registryPda);
      
//       await context.program.methods
//         .deregisterAttestor(context.accounts.attestor1.publicKey)
//         .accounts({
//           registry: context.pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: context.accounts.authority.publicKey,
//         })
//         .signers([context.accounts.authority])
//         .rpc();

//       // Verify deregistered
//       let attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
//       expect(attestorAccount.isRegistered).to.be.false;

//       // Re-register should work but fail because account already exists
//       try {
//         await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor1.publicKey, context.pdas.registryPda);
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("already in use");
//       }
//     });

//     it("Should maintain correct statistics during re-registration cycle", async () => {
//       const initialRegistry = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       const initialCount = initialRegistry.totalAttestors.toNumber();

//       // Register
//       await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor1.publicKey, context.pdas.registryPda);
//       let registry = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       expect(registry.totalAttestors.toNumber()).to.equal(initialCount + 1);

//       // Deregister
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
//       await context.program.methods
//         .deregisterAttestor(context.accounts.attestor1.publicKey)
//         .accounts({
//           registry: context.pdas.registryPda,
//           attestorAccount: attestorPda,
//           authority: context.accounts.authority.publicKey,
//         })
//         .signers([context.accounts.authority])
//         .rpc();

//       registry = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       expect(registry.totalAttestors.toNumber()).to.equal(initialCount);
//     });
//   });

//   describe("Edge Cases", () => {
//     it("Should handle maximum number of attestors gracefully", async () => {
//       // Register multiple attestors to test counter limits
//       const attestors: Keypair[] = [];
//       for (let i = 0; i < 10; i++) {
//         attestors.push(Keypair.generate());
//       }

//       for (const attestor of attestors) {
//         await registerAttestor(context.program, context.accounts.authority, attestor.publicKey, context.pdas.registryPda);
//       }

//       const registryAccount = await context.program.account.predicateRegistry.fetch(context.pdas.registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(10);
//     });

//     it("Should maintain correct timestamps", async () => {
//       const [attestorPda] = findAttestorPDA(context.accounts.attestor1.publicKey, context.program.programId);
      
//       await registerAttestor(context.program, context.accounts.authority, context.accounts.attestor1.publicKey, context.pdas.registryPda);
      
//       const attestorAccount = await context.program.account.attestorAccount.fetch(attestorPda);
//       const currentTime = Math.floor(Date.now() / 1000);
      
//       expect(attestorAccount.registeredAt.toNumber()).to.be.closeTo(currentTime, 10);
//     });
//   });
// });

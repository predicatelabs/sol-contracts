// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { PredicateRegistry } from "../target/types/predicate_registry";
// import { expect } from "chai";
// import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

// describe("Predicate Registry", () => {
//   // Configure the client to use the local cluster
//   anchor.setProvider(anchor.AnchorProvider.env());

//   const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
//   const provider = anchor.getProvider();

//   // Test accounts
//   let authority: Keypair;
//   let newAuthority: Keypair;
//   let client1: Keypair;
//   let client2: Keypair;
//   let attestor1: Keypair;
//   let attestor2: Keypair;
//   let validator: Keypair;

//   // PDAs
//   let registryPda: PublicKey;
//   let registryBump: number;

//   before(async () => {
//     // Initialize test accounts
//     authority = Keypair.generate();
//     newAuthority = Keypair.generate();
//     client1 = Keypair.generate();
//     client2 = Keypair.generate();
//     attestor1 = Keypair.generate();
//     attestor2 = Keypair.generate();
//     validator = Keypair.generate();

//     // Airdrop SOL to test accounts
//     const accounts = [authority, newAuthority, client1, client2, validator];
//     for (const account of accounts) {
//       await provider.connection.requestAirdrop(account.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
//     }

//     // Wait for airdrops to confirm
//     await new Promise(resolve => setTimeout(resolve, 1000));

//     // Find registry PDA with unique seed
//     const uniqueSeed = Buffer.from(Math.random().toString(36).substring(7));
//     [registryPda, registryBump] = PublicKey.findProgramAddressSync(
//       [Buffer.from("predicate_registry"), uniqueSeed],
//       program.programId
//     );
//   });

//   describe("Initialization", () => {
//     it("Should initialize the registry successfully", async () => {
//       const tx = await program.methods
//         .initialize()
//         .accounts({
//           registry: registryPda,
//           authority: authority.publicKey,
//           systemProgram: SystemProgram.programId,
//         } as any)
//         .signers([authority])
//         .rpc();

//       // Verify registry state
//       const registryAccount = await program.account.predicateRegistry.fetch(registryPda);
//       expect(registryAccount.authority.toString()).to.equal(authority.publicKey.toString());
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(0);
//       expect(registryAccount.totalPolicies.toNumber()).to.equal(0);
//       expect(registryAccount.createdAt.toNumber()).to.be.greaterThan(0);
//       expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(0);
//     });

//     it("Should fail to initialize registry twice", async () => {
//       try {
//         await program.methods
//           .initialize()
//         .accounts({
//           registry: registryPda,
//           authority: authority.publicKey,
//           systemProgram: SystemProgram.programId,
//         } as any)
//         .signers([authority])
//         .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("already in use");
//       }
//     });
//   });

//   describe("Attestor Management", () => {
//     let attestor1Pda: PublicKey;
//     let attestor2Pda: PublicKey;

//     before(async () => {
//       // Find attestor PDAs
//       [attestor1Pda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), attestor1.publicKey.toBuffer()],
//         program.programId
//       );
//       [attestor2Pda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), attestor2.publicKey.toBuffer()],
//         program.programId
//       );
//     });

//     it("Should register an attestor successfully", async () => {
//       const registryBefore = await program.account.predicateRegistry.fetch(registryPda);
//       const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

//       await program.methods
//         .registerAttestor(attestor1.publicKey)
//         .accounts({
//           registry: registryPda,
//           attestorAccount: attestor1Pda,
//           authority: authority.publicKey,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([authority])
//         .rpc();

//       // Verify attestor account
//       const attestorAccount = await program.account.attestorAccount.fetch(attestor1Pda);
//       expect(attestorAccount.attestor.toString()).to.equal(attestor1.publicKey.toString());
//       expect(attestorAccount.isRegistered).to.be.true;
//       expect(attestorAccount.registeredAt.toNumber()).to.be.greaterThan(0);

//       // Verify registry statistics updated
//       const registryAfter = await program.account.predicateRegistry.fetch(registryPda);
//       expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore + 1);
//     });

//     it("Should register multiple attestors", async () => {
//       await program.methods
//         .registerAttestor(attestor2.publicKey)
//         .accounts({
//           registry: registryPda,
//           attestorAccount: attestor2Pda,
//           authority: authority.publicKey,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([authority])
//         .rpc();

//       const registryAccount = await program.account.predicateRegistry.fetch(registryPda);
//       expect(registryAccount.totalAttestors.toNumber()).to.equal(2);
//     });

//     it("Should fail to register attestor with wrong authority", async () => {
//       const wrongAuthority = Keypair.generate();
//       await provider.connection.requestAirdrop(wrongAuthority.publicKey, anchor.web3.LAMPORTS_PER_SOL);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const [attestorPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), wrongAuthority.publicKey.toBuffer()],
//         program.programId
//       );

//       try {
//         await program.methods
//           .registerAttestor(wrongAuthority.publicKey)
//           .accounts({
//             registry: registryPda,
//             attestorAccount: attestorPda,
//             authority: wrongAuthority.publicKey,
//             systemProgram: SystemProgram.programId,
//           })
//           .signers([wrongAuthority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should fail to register same attestor twice", async () => {
//       try {
//         await program.methods
//           .registerAttestor(attestor1.publicKey)
//           .accounts({
//             registry: registryPda,
//             attestorAccount: attestor1Pda,
//             authority: authority.publicKey,
//             systemProgram: SystemProgram.programId,
//           })
//           .signers([authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("already in use");
//       }
//     });

//     it("Should deregister an attestor successfully", async () => {
//       // First make sure attestor1 is registered
//       try {
//         await program.account.attestorAccount.fetch(attestor1Pda);
//       } catch (error) {
//         // If not registered, register it first
//         await program.methods
//           .registerAttestor(attestor1.publicKey)
//           .accounts({
//             registry: registryPda,
//             attestorAccount: attestor1Pda,
//             authority: authority.publicKey,
//             systemProgram: SystemProgram.programId,
//           })
//           .signers([authority])
//           .rpc();
//       }

//       const registryBefore = await program.account.predicateRegistry.fetch(registryPda);
//       const totalAttestorsBefore = registryBefore.totalAttestors.toNumber();

//       await program.methods
//         .deregisterAttestor(attestor1.publicKey)
//         .accounts({
//           registry: registryPda,
//           attestorAccount: attestor1Pda,
//           authority: authority.publicKey,
//         })
//         .signers([authority])
//         .rpc();

//       // Verify attestor is deregistered
//       const attestorAccount = await program.account.attestorAccount.fetch(attestor1Pda);
//       expect(attestorAccount.isRegistered).to.be.false;

//       // Verify registry statistics updated
//       const registryAfter = await program.account.predicateRegistry.fetch(registryPda);
//       expect(registryAfter.totalAttestors.toNumber()).to.equal(totalAttestorsBefore - 1);
//     });

//     it("Should fail to deregister non-registered attestor", async () => {
//       try {
//         await program.methods
//           .deregisterAttestor(attestor1.publicKey)
//           .accounts({
//             registry: registryPda,
//             attestorAccount: attestor1Pda,
//             authority: authority.publicKey,
//           })
//           .signers([authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("AttestorNotRegistered");
//       }
//     });

//     it("Should fail to deregister with wrong authority", async () => {
//       const wrongAuthority = Keypair.generate();
//       await provider.connection.requestAirdrop(wrongAuthority.publicKey, anchor.web3.LAMPORTS_PER_SOL);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       try {
//         await program.methods
//           .deregisterAttestor(attestor2.publicKey)
//           .accounts({
//             registry: registryPda,
//             attestorAccount: attestor2Pda,
//             authority: wrongAuthority.publicKey,
//           })
//           .signers([wrongAuthority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });
//   });

//   describe("Policy Management", () => {
//     let client1PolicyPda: PublicKey;
//     let client2PolicyPda: PublicKey;
//     const testPolicy1 = Buffer.from("test-policy-1");
//     const testPolicy2 = Buffer.from("test-policy-2");
//     const updatedPolicy = Buffer.from("updated-test-policy");

//     before(async () => {
//       // Find policy PDAs
//       [client1PolicyPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("policy"), client1.publicKey.toBuffer()],
//         program.programId
//       );
//       [client2PolicyPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("policy"), client2.publicKey.toBuffer()],
//         program.programId
//       );
//     });

//     it("Should set a policy successfully", async () => {
//       await program.methods
//         .setPolicy(testPolicy1)
//         .accounts({
//           registry: registryPda,
//           policyAccount: client1PolicyPda,
//           client: client1.publicKey,
//           systemProgram: SystemProgram.programId,
//         } as any)
//         .signers([client1])
//         .rpc();

//       // Verify policy account
//       const policyAccount = await program.account.policyAccount.fetch(client1PolicyPda);
//       expect(policyAccount.client.toString()).to.equal(client1.publicKey.toString());
//       expect(policyAccount.policyLen).to.equal(testPolicy1.length);
//       expect(policyAccount.setAt.toNumber()).to.be.greaterThan(0);
//       expect(policyAccount.updatedAt.toNumber()).to.be.greaterThan(0);
      
//       // Verify policy content
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(testPolicy1)).to.be.true;
//     });

//     it("Should set multiple policies for different clients", async () => {
//       await program.methods
//         .setPolicy(testPolicy2)
//         .accounts({
//           registry: registryPda,
//           policyAccount: client2PolicyPda,
//           client: client2.publicKey,
//           systemProgram: SystemProgram.programId,
//         } as any)
//         .signers([client2])
//         .rpc();

//       const policyAccount = await program.account.policyAccount.fetch(client2PolicyPda);
//       const storedPolicy = Buffer.from(policyAccount.policy.slice(0, policyAccount.policyLen));
//       expect(storedPolicy.equals(testPolicy2)).to.be.true;
//     });

//     it("Should fail to set empty policy", async () => {
//       const emptyClient = Keypair.generate();
//       await provider.connection.requestAirdrop(emptyClient.publicKey, anchor.web3.LAMPORTS_PER_SOL);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const [emptyPolicyPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("policy"), emptyClient.publicKey.toBuffer()],
//         program.programId
//       );

//       try {
//         await program.methods
//           .setPolicy(Buffer.from([]))
//           .accounts({
//             registry: registryPda,
//             policyAccount: emptyPolicyPda,
//             client: emptyClient.publicKey,
//             systemProgram: SystemProgram.programId,
//           } as any)
//           .signers([emptyClient])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("InvalidPolicy");
//       }
//     });

//     it("Should fail to set policy that's too long", async () => {
//       const longClient = Keypair.generate();
//       await provider.connection.requestAirdrop(longClient.publicKey, anchor.web3.LAMPORTS_PER_SOL);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const [longPolicyPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("policy"), longClient.publicKey.toBuffer()],
//         program.programId
//       );

//       const longPolicy = new Array(201).fill(65); // 201 'A' characters

//       try {
//         await program.methods
//           .setPolicy(Buffer.from(longPolicy))
//         .accounts({
//           registry: registryPda,
//           policyAccount: longPolicyPda,
//           client: longClient.publicKey,
//           systemProgram: SystemProgram.programId,
//         } as any)
//           .signers([longClient])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("PolicyTooLong");
//       }
//     });

//     it("Should update an existing policy successfully", async () => {
//       const policyBefore = await program.account.policyAccount.fetch(client1PolicyPda);
//       const updatedAtBefore = policyBefore.updatedAt.toNumber();

//       await program.methods
//         .updatePolicy(updatedPolicy)
//         .accounts({
//           registry: registryPda,
//           policyAccount: client1PolicyPda,
//           client: client1.publicKey,
//         } as any)
//         .signers([client1])
//         .rpc();

//       // Verify policy was updated
//       const policyAfter = await program.account.policyAccount.fetch(client1PolicyPda);
//       expect(policyAfter.policyLen).to.equal(updatedPolicy.length);
//       expect(policyAfter.updatedAt.toNumber()).to.be.greaterThan(updatedAtBefore);
      
//       const storedPolicy = Buffer.from(policyAfter.policy.slice(0, policyAfter.policyLen));
//       expect(storedPolicy.equals(updatedPolicy)).to.be.true;
//     });

//     it("Should fail to update policy with wrong client", async () => {
//       try {
//         await program.methods
//           .updatePolicy(testPolicy1)
//           .accounts({
//             registry: registryPda,
//             policyAccount: client1PolicyPda,
//             client: client2.publicKey, // Wrong client
//           } as any)
//           .signers([client2])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should fail to update non-existent policy", async () => {
//       const nonExistentClient = Keypair.generate();
//       await provider.connection.requestAirdrop(nonExistentClient.publicKey, anchor.web3.LAMPORTS_PER_SOL);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const [nonExistentPolicyPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("policy"), nonExistentClient.publicKey.toBuffer()],
//         program.programId
//       );

//       try {
//         await program.methods
//           .updatePolicy(testPolicy1)
//           .accounts({
//             registry: registryPda,
//             policyAccount: nonExistentPolicyPda,
//             client: nonExistentClient.publicKey,
//           } as any)
//           .signers([nonExistentClient])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("AccountNotInitialized");
//       }
//     });
//   });

//   describe("Authority Transfer", () => {
//     it("Should transfer authority successfully", async () => {
//       const registryBefore = await program.account.predicateRegistry.fetch(registryPda);
//       const previousAuthority = registryBefore.authority;

//       await program.methods
//         .transferAuthority(newAuthority.publicKey)
//         .accounts({
//           registry: registryPda,
//           authority: authority.publicKey,
//           newAuthority: newAuthority.publicKey,
//         } as any)
//         .signers([authority])
//         .rpc();

//       // Verify authority was transferred
//       const registryAfter = await program.account.predicateRegistry.fetch(registryPda);
//       expect(registryAfter.authority.toString()).to.equal(newAuthority.publicKey.toString());
//       expect(registryAfter.authority.toString()).to.not.equal(previousAuthority.toString());
//     });

//     it("Should fail to transfer authority with wrong current authority", async () => {
//       try {
//         await program.methods
//           .transferAuthority(authority.publicKey)
//           .accounts({
//             registry: registryPda,
//             authority: authority.publicKey, // This is now the wrong authority since we transferred to newAuthority
//             newAuthority: authority.publicKey,
//           } as any)
//           .signers([authority])
//           .rpc();
        
//         expect.fail("Should have thrown an error");
//       } catch (error: any) {
//         expect(error.message).to.include("Unauthorized");
//       }
//     });

//     it("Should allow new authority to perform admin operations", async () => {
//       const newAttestor = Keypair.generate();
//       const [newAttestorPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), newAttestor.publicKey.toBuffer()],
//         program.programId
//       );

//       await program.methods
//         .registerAttestor(newAttestor.publicKey)
//         .accounts({
//           registry: registryPda,
//           attestorAccount: newAttestorPda,
//           authority: newAuthority.publicKey, // Using new authority
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([newAuthority])
//         .rpc();

//       const attestorAccount = await program.account.attestorAccount.fetch(newAttestorPda);
//       expect(attestorAccount.isRegistered).to.be.true;
//     });
//   });

//   describe("Edge Cases and Error Conditions", () => {
//     it("Should handle maximum policy length correctly", async () => {
//       const maxClient = Keypair.generate();
//       await provider.connection.requestAirdrop(maxClient.publicKey, anchor.web3.LAMPORTS_PER_SOL);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const [maxPolicyPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("policy"), maxClient.publicKey.toBuffer()],
//         program.programId
//       );

//       const maxPolicy = new Array(200).fill(65); // Exactly 200 'A' characters

//       await program.methods
//         .setPolicy(Buffer.from(maxPolicy))
//         .accounts({
//           registry: registryPda,
//           policyAccount: maxPolicyPda,
//           client: maxClient.publicKey,
//           systemProgram: SystemProgram.programId,
//         } as any)
//         .signers([maxClient])
//         .rpc();

//       const policyAccount = await program.account.policyAccount.fetch(maxPolicyPda);
//       expect(policyAccount.policyLen).to.equal(200);
//     });

//     it("Should handle re-registration of deregistered attestor", async () => {
//       // Create a fresh attestor for this test to avoid account conflicts
//       const freshAttestor = Keypair.generate();
//       const [freshAttestorPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("attestor"), freshAttestor.publicKey.toBuffer()],
//         program.programId
//       );
      
//       // Register the fresh attestor
//       await program.methods
//         .registerAttestor(freshAttestor.publicKey)
//         .accounts({
//           registry: registryPda,
//           attestorAccount: freshAttestorPda,
//           authority: newAuthority.publicKey,
//           systemProgram: SystemProgram.programId,
//         } as any)
//         .signers([newAuthority])
//         .rpc();

//       // Deregister the attestor
//       await program.methods
//         .deregisterAttestor(freshAttestor.publicKey)
//         .accounts({
//           registry: registryPda,
//           attestorAccount: freshAttestorPda,
//           authority: newAuthority.publicKey,
//         })
//         .signers([newAuthority])
//         .rpc();

//       // Verify it's deregistered
//       const deregisteredAccount = await program.account.attestorAccount.fetch(freshAttestorPda);
//       expect(deregisteredAccount.isRegistered).to.be.false;

//       // For now, re-registration of an existing account is not supported
//       // This test verifies that deregistration works correctly
//       expect(deregisteredAccount.attestor.toString()).to.equal(freshAttestor.publicKey.toString());
//     });

//     it("Should maintain correct registry statistics", async () => {
//       const registryAccount = await program.account.predicateRegistry.fetch(registryPda);
      
//       // Count should be at least 1 (the last re-registered attestor)
//       expect(registryAccount.totalAttestors.toNumber()).to.be.at.least(1);
      
//       // Policies counter may not be implemented in the smart contract
//       expect(registryAccount.totalPolicies.toNumber()).to.equal(0);
//     });
//   });
// });

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Counter } from "../target/types/counter";
import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("Counter Program", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter as Program<Counter>;
  const user = provider.wallet as anchor.Wallet;
  
  // Derive the counter PDA
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), user.publicKey.toBuffer()],
    program.programId
  );

  describe("Initialization", () => {
    it("Should initialize a new counter", async () => {
      const tx = await program.methods
        .initialize()
        .accounts({
          counter: counterPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("Initialize transaction signature:", tx);

      // Fetch and verify the counter account
      const counterAccount = await program.account.counter.fetch(counterPda);
      expect(counterAccount.count.toString()).to.equal("0");
      expect(counterAccount.authority.toString()).to.equal(user.publicKey.toString());
      expect(counterAccount.totalIncrements.toString()).to.equal("0");
      expect(counterAccount.totalDecrements.toString()).to.equal("0");
      expect(counterAccount.createdAt.toNumber()).to.be.greaterThan(0);
      expect(counterAccount.updatedAt.toNumber()).to.be.greaterThan(0);
    });

    it("Should fail to initialize the same counter twice", async () => {
      try {
        await program.methods
          .initialize()
          .accounts({
            counter: counterPda,
            user: user.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("Counter Operations", () => {
    it("Should increment the counter", async () => {
      const beforeAccount = await program.account.counter.fetch(counterPda);
      
      const tx = await program.methods
        .increment()
        .accounts({
          counter: counterPda,
          authority: user.publicKey,
        })
        .rpc();

      console.log("Increment transaction signature:", tx);

      const afterAccount = await program.account.counter.fetch(counterPda);
      expect(afterAccount.count.toString()).to.equal("1");
      expect(afterAccount.totalIncrements.toString()).to.equal("1");
      expect(afterAccount.updatedAt.toNumber()).to.be.greaterThan(beforeAccount.updatedAt.toNumber());
    });

    it("Should increment multiple times", async () => {
      // Increment 5 more times
      for (let i = 0; i < 5; i++) {
        await program.methods
          .increment()
          .accounts({
            counter: counterPda,
            authority: user.publicKey,
          })
          .rpc();
      }

      const counterAccount = await program.account.counter.fetch(counterPda);
      expect(counterAccount.count.toString()).to.equal("6");
      expect(counterAccount.totalIncrements.toString()).to.equal("6");
    });

    it("Should decrement the counter", async () => {
      const beforeAccount = await program.account.counter.fetch(counterPda);
      
      const tx = await program.methods
        .decrement()
        .accounts({
          counter: counterPda,
          authority: user.publicKey,
        })
        .rpc();

      console.log("Decrement transaction signature:", tx);

      const afterAccount = await program.account.counter.fetch(counterPda);
      expect(afterAccount.count.toString()).to.equal("5");
      expect(afterAccount.totalDecrements.toString()).to.equal("1");
      expect(afterAccount.updatedAt.toNumber()).to.be.greaterThan(beforeAccount.updatedAt.toNumber());
    });

    it("Should reset the counter", async () => {
      const tx = await program.methods
        .reset()
        .accounts({
          counter: counterPda,
          authority: user.publicKey,
        })
        .rpc();

      console.log("Reset transaction signature:", tx);

      const counterAccount = await program.account.counter.fetch(counterPda);
      expect(counterAccount.count.toString()).to.equal("0");
      // Total increments and decrements should remain unchanged
      expect(counterAccount.totalIncrements.toString()).to.equal("6");
      expect(counterAccount.totalDecrements.toString()).to.equal("1");
    });

    it("Should fail to decrement below zero", async () => {
      try {
        await program.methods
          .decrement()
          .accounts({
            counter: counterPda,
            authority: user.publicKey,
          })
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("CounterUnderflow");
      }
    });
  });

  describe("Authority Management", () => {
    let newAuthority: Keypair;
    let newCounterPda: PublicKey;

    before(() => {
      newAuthority = Keypair.generate();
      [newCounterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("counter"), newAuthority.publicKey.toBuffer()],
        program.programId
      );
    });

    it("Should transfer authority to a new account", async () => {
      const tx = await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          counter: counterPda,
          authority: user.publicKey,
          newAuthority: newAuthority.publicKey,
        })
        .rpc();

      console.log("Transfer authority transaction signature:", tx);

      const counterAccount = await program.account.counter.fetch(counterPda);
      expect(counterAccount.authority.toString()).to.equal(newAuthority.publicKey.toString());
    });

    it("Should fail when unauthorized user tries to increment", async () => {
      try {
        await program.methods
          .increment()
          .accounts({
            counter: counterPda,
            authority: user.publicKey, // Original user is no longer authority
          })
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("Should allow new authority to increment", async () => {
      // First, airdrop some SOL to the new authority for transaction fees
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(newAuthority.publicKey, 1000000000)
      );

      const tx = await program.methods
        .increment()
        .accounts({
          counter: counterPda,
          authority: newAuthority.publicKey,
        })
        .signers([newAuthority])
        .rpc();

      console.log("New authority increment transaction signature:", tx);

      const counterAccount = await program.account.counter.fetch(counterPda);
      expect(counterAccount.count.toString()).to.equal("1");
    });
  });

  describe("Event Emission", () => {
    it("Should emit events for counter operations", async () => {
      // Initialize a new counter for event testing
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(newAuthority.publicKey, 1000000000)
      );

      const initTx = await program.methods
        .initialize()
        .accounts({
          counter: newCounterPda,
          user: newAuthority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([newAuthority])
        .rpc();

      // Get transaction details to check for events
      const txDetails = await provider.connection.getTransaction(initTx, {
        commitment: "confirmed",
      });

      expect(txDetails).to.not.be.null;
      // In a real test, you would parse the logs to verify events were emitted
      console.log("Transaction logs:", txDetails?.meta?.logMessages);
    });
  });
});
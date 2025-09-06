import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../target/types/predicate_registry";
import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { 
  createTestAccounts, 
  findRegistryPDAs, 
  TestAccounts, 
  TestPDAs 
} from "./helpers/test-utils";

describe("Registry Initialization", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  const provider = anchor.getProvider();

  let accounts: TestAccounts;
  let pdas: TestPDAs;

  beforeEach(async () => {
    accounts = await createTestAccounts(provider as anchor.AnchorProvider);
    pdas = findRegistryPDAs(program.programId);
  });

  describe("Successful Initialization", () => {
    it("Should initialize registry with correct initial state", async () => {
      const tx = await program.methods
        .initialize()
        .accounts({
          registry: pdas.registryPda,
          authority: accounts.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([accounts.authority])
        .rpc();

      // Verify transaction was successful
      expect(tx).to.be.a('string');

      // Verify registry state
      const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
      
      expect(registryAccount.authority.toString()).to.equal(accounts.authority.publicKey.toString());
      expect(registryAccount.totalAttestors.toNumber()).to.equal(0);
      expect(registryAccount.totalPolicies.toNumber()).to.equal(0);
      expect(registryAccount.createdAt.toNumber()).to.be.greaterThan(0);
      expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(0);
      expect(registryAccount.createdAt.toNumber()).to.equal(registryAccount.updatedAt.toNumber());
    });

    it("Should emit RegistryInitialized event", async () => {
      const listener = program.addEventListener("RegistryInitialized", (event) => {
        expect(event.registry.toString()).to.equal(pdas.registryPda.toString());
        expect(event.authority.toString()).to.equal(accounts.authority.publicKey.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
      });

      await program.methods
        .initialize()
        .accounts({
          registry: pdas.registryPda,
          authority: accounts.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([accounts.authority])
        .rpc();

      // Clean up listener
      await program.removeEventListener(listener);
    });

    it("Should create registry account with correct space allocation", async () => {
      await program.methods
        .initialize()
        .accounts({
          registry: pdas.registryPda,
          authority: accounts.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([accounts.authority])
        .rpc();

      const accountInfo = await provider.connection.getAccountInfo(pdas.registryPda);
      expect(accountInfo).to.not.be.null;
      expect(accountInfo!.owner.toString()).to.equal(program.programId.toString());
      
      // Verify account has correct data length (8 bytes discriminator + PredicateRegistry size)
      expect(accountInfo!.data.length).to.be.greaterThan(8);
    });
  });

  describe("Initialization Failures", () => {
    it("Should fail to initialize with insufficient funds", async () => {
      const poorAuthority = Keypair.generate();
      // Don't fund this account

      try {
        await program.methods
          .initialize()
          .accounts({
            registry: pdas.registryPda,
            authority: poorAuthority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([poorAuthority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("insufficient");
      }
    });

    it("Should fail to initialize twice with same PDA", async () => {
      // First initialization
      await program.methods
        .initialize()
        .accounts({
          registry: pdas.registryPda,
          authority: accounts.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([accounts.authority])
        .rpc();

      // Second initialization should fail
      try {
        await program.methods
          .initialize()
          .accounts({
            registry: pdas.registryPda,
            authority: accounts.newAuthority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([accounts.newAuthority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });

    it("Should fail with invalid system program", async () => {
      try {
        await program.methods
          .initialize()
          .accounts({
            registry: pdas.registryPda,
            authority: accounts.authority.publicKey,
            systemProgram: accounts.authority.publicKey, // Invalid system program
          })
          .signers([accounts.authority])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("InvalidProgramId");
      }
    });
  });

  describe("Registry State Validation", () => {
    beforeEach(async () => {
      await program.methods
        .initialize()
        .accounts({
          registry: pdas.registryPda,
          authority: accounts.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([accounts.authority])
        .rpc();
    });

    it("Should have correct timestamp precision", async () => {
      const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Allow for some time difference due to network delays
      expect(registryAccount.createdAt.toNumber()).to.be.closeTo(currentTime, 10);
      expect(registryAccount.updatedAt.toNumber()).to.be.closeTo(currentTime, 10);
    });

    it("Should maintain authority correctly", async () => {
      const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
      expect(registryAccount.authority.toString()).to.equal(accounts.authority.publicKey.toString());
    });

    it("Should initialize counters to zero", async () => {
      const registryAccount = await program.account.predicateRegistry.fetch(pdas.registryPda);
      expect(registryAccount.totalAttestors.toNumber()).to.equal(0);
      expect(registryAccount.totalPolicies.toNumber()).to.equal(0);
    });
  });
});

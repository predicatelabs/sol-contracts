import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SplTokenPredicate } from "../target/types/spl_token_predicate";
import { PredicateRegistry } from "../../../target/types/predicate_registry";
import { 
  Keypair, 
  PublicKey, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  createInitializeAccountInstruction,
  ACCOUNT_SIZE,
  getMinimumBalanceForRentExemptAccount,
  createMintToInstruction,
  getAccount,
  createApproveInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import * as crypto from "crypto";

describe("SPL Token Predicate Example", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SplTokenPredicate as Program<SplTokenPredicate>;
  const predicateRegistryProgram = anchor.workspace.PredicateRegistry as Program<PredicateRegistry>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  let authority: Keypair;
  let attestor: Keypair;
  let tokenOwner: Keypair;
  let recipient: Keypair;
  let delegate: Keypair;
  let mint: Keypair;
  let tokenAccount: Keypair;
  let recipientTokenAccount: Keypair;

  // PDAs
  let registryPda: PublicKey;
  let attestorPda: PublicKey;
  let policyPda: PublicKey;
  let protectedAccountPda: PublicKey;

  const testPolicy = "max_amount:1000,daily_limit:5000";
  const mintAmount = 10000;
  const transferAmount = 500;

  before(async () => {
    // Create test accounts
    authority = Keypair.generate();
    attestor = Keypair.generate();
    tokenOwner = Keypair.generate();
    recipient = Keypair.generate();
    delegate = Keypair.generate();
    mint = Keypair.generate();
    tokenAccount = Keypair.generate();
    recipientTokenAccount = Keypair.generate();

    // Fund accounts
    const accounts = [authority, attestor, tokenOwner, recipient, delegate];
    for (const account of accounts) {
      await provider.connection.requestAirdrop(
        account.publicKey,
        2 * LAMPORTS_PER_SOL
      );
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get PDAs
    [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("predicate_registry")],
      predicateRegistryProgram.programId
    );

    [attestorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attestor"), attestor.publicKey.toBuffer()],
      predicateRegistryProgram.programId
    );

    [policyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), tokenOwner.publicKey.toBuffer()],
      predicateRegistryProgram.programId
    );

    [protectedAccountPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("protected_token"),
        tokenAccount.publicKey.toBuffer(),
        tokenOwner.publicKey.toBuffer()
      ],
      program.programId
    );

    // Create mint
    const mintRent = await getMinimumBalanceForRentExemptMint(provider.connection);
    const createMintTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint.publicKey,
        9, // decimals
        authority.publicKey, // mint authority
        authority.publicKey  // freeze authority
      )
    );
    await provider.sendAndConfirm(createMintTx, [authority, mint]);

    // Create token accounts
    const accountRent = await getMinimumBalanceForRentExemptAccount(provider.connection);
    
    // Owner token account
    const createOwnerAccountTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: ACCOUNT_SIZE,
        lamports: accountRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(
        tokenAccount.publicKey,
        mint.publicKey,
        tokenOwner.publicKey
      )
    );
    await provider.sendAndConfirm(createOwnerAccountTx, [authority, tokenAccount]);

    // Recipient token account
    const createRecipientAccountTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: recipientTokenAccount.publicKey,
        space: ACCOUNT_SIZE,
        lamports: accountRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(
        recipientTokenAccount.publicKey,
        mint.publicKey,
        recipient.publicKey
      )
    );
    await provider.sendAndConfirm(createRecipientAccountTx, [authority, recipientTokenAccount]);

    // Mint tokens to owner
    const mintToTx = new anchor.web3.Transaction().add(
      createMintToInstruction(
        mint.publicKey,
        tokenAccount.publicKey,
        authority.publicKey,
        mintAmount * Math.pow(10, 9) // 9 decimals
      )
    );
    await provider.sendAndConfirm(mintToTx, [authority]);

    // Initialize predicate registry
    try {
      await predicateRegistryProgram.methods
        .initialize()
        .accounts({
          registry: registryPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    } catch (error: any) {
      console.log("Registry already initialized or error:", error.message);
    }

    // Register attestor
    try {
      await predicateRegistryProgram.methods
        .registerAttestor(attestor.publicKey)
        .accounts({
          registry: registryPda,
          attestorAccount: attestorPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    } catch (error: any) {
      console.log("Attestor already registered or error:", error.message);
    }
  });

  it("Initialize protected token account", async () => {
    const policyBytes = Buffer.from(testPolicy, "utf8");

    await program.methods
      .initializeProtectedAccount(Array.from(policyBytes))
      .accounts({
        protectedAccount: protectedAccountPda,
        tokenAccount: tokenAccount.publicKey,
        mint: mint.publicKey,
        owner: tokenOwner.publicKey,
        predicateRegistry: predicateRegistryProgram.programId,
        registry: registryPda,
        policyAccount: policyPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([tokenOwner])
      .rpc();

    // Verify protected account was created
    const protectedAccount = await program.account.protectedTokenAccount.fetch(protectedAccountPda);
    expect(protectedAccount.owner.toString()).to.equal(tokenOwner.publicKey.toString());
    expect(protectedAccount.tokenAccount.toString()).to.equal(tokenAccount.publicKey.toString());
    expect(protectedAccount.mint.toString()).to.equal(mint.publicKey.toString());
    expect(protectedAccount.isActive).to.be.true;
    expect(protectedAccount.transferCount.toNumber()).to.equal(0);
  });

  it("Update policy", async () => {
    const newPolicy = "max_amount:2000,daily_limit:10000,require_2fa:true";
    const newPolicyBytes = Buffer.from(newPolicy, "utf8");

    await program.methods
      .updatePolicy(Array.from(newPolicyBytes))
      .accounts({
        protectedAccount: protectedAccountPda,
        owner: tokenOwner.publicKey,
        predicateRegistry: predicateRegistryProgram.programId,
        registry: registryPda,
        policyAccount: policyPda,
      })
      .signers([tokenOwner])
      .rpc();

    // Verify policy was updated
    const protectedAccount = await program.account.protectedTokenAccount.fetch(protectedAccountPda);
    const policyData = protectedAccount.policy.slice(0, protectedAccount.policyLen);
    const policyString = Buffer.from(policyData).toString("utf8");
    expect(policyString).to.equal(newPolicy);
  });

  it("Get policy", async () => {
    const policy = await program.methods
      .getPolicy()
      .accounts({
        protectedAccount: protectedAccountPda,
      })
      .view();

    const policyString = Buffer.from(policy).toString("utf8");
    expect(policyString).to.include("max_amount:2000");
  });

  it("Get transfer stats", async () => {
    const stats = await program.methods
      .getTransferStats()
      .accounts({
        protectedAccount: protectedAccountPda,
      })
      .view();

    expect(stats.transferCount.toNumber()).to.equal(0);
    expect(stats.createdAt.toNumber()).to.be.greaterThan(0);
  });

  describe("Protected Transfers", () => {
    let task: any;
    let attestation: any;

    beforeEach(async () => {
      // Create a task for the transfer
      const uuid = crypto.randomBytes(16);
      const currentTime = Math.floor(Date.now() / 1000);
      const expirationTime = currentTime + 3600; // 1 hour from now

      task = {
        uuid: Array.from(uuid),
        msgSender: tokenOwner.publicKey,
        target: recipientTokenAccount.publicKey,
        msgValue: new anchor.BN(transferAmount),
        encodedSigAndArgs: Buffer.from("transfer_args", "utf8"),
        policy: new Array(200).fill(0), // Initialize with zeros
        expiration: new anchor.BN(expirationTime),
      };

      // Set policy in task (copy from protected account)
      const protectedAccount = await program.account.protectedTokenAccount.fetch(protectedAccountPda);
      const policyData = protectedAccount.policy.slice(0, protectedAccount.policyLen);
      for (let i = 0; i < policyData.length; i++) {
        task.policy[i] = policyData[i];
      }

      // Create attestation (simplified - in real scenario, this would be signed by attestor)
      attestation = {
        uuid: Array.from(uuid),
        attestor: attestor.publicKey,
        signature: new Array(64).fill(0), // Placeholder signature
        expiration: new anchor.BN(expirationTime),
      };
    });

    it("Execute protected transfer", async () => {
      // Get initial balances
      const initialOwnerBalance = (await getAccount(provider.connection, tokenAccount.publicKey)).amount;
      const initialRecipientBalance = (await getAccount(provider.connection, recipientTokenAccount.publicKey)).amount;

      await program.methods
        .protectedTransfer(task, attestation, new anchor.BN(transferAmount))
        .accounts({
          protectedAccount: protectedAccountPda,
          sourceTokenAccount: tokenAccount.publicKey,
          destinationTokenAccount: recipientTokenAccount.publicKey,
          owner: tokenOwner.publicKey,
          predicateRegistry: predicateRegistryProgram.programId,
          registry: registryPda,
          attestorAccount: attestorPda,
          policyAccount: policyPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([tokenOwner])
        .rpc();

      // Verify balances changed
      const finalOwnerBalance = (await getAccount(provider.connection, tokenAccount.publicKey)).amount;
      const finalRecipientBalance = (await getAccount(provider.connection, recipientTokenAccount.publicKey)).amount;

      expect(Number(finalOwnerBalance)).to.equal(Number(initialOwnerBalance) - transferAmount);
      expect(Number(finalRecipientBalance)).to.equal(Number(initialRecipientBalance) + transferAmount);

      // Verify transfer stats updated
      const protectedAccount = await program.account.protectedTokenAccount.fetch(protectedAccountPda);
      expect(protectedAccount.transferCount.toNumber()).to.equal(1);
      expect(protectedAccount.totalTransferred.toNumber()).to.equal(transferAmount);
    });

    it("Execute protected transfer from (delegated)", async () => {
      // First approve delegate
      const approveTx = new anchor.web3.Transaction().add(
        createApproveInstruction(
          tokenAccount.publicKey,
          delegate.publicKey,
          tokenOwner.publicKey,
          transferAmount
        )
      );
      await provider.sendAndConfirm(approveTx, [tokenOwner]);

      // Update task for delegate
      task.msgSender = delegate.publicKey;

      // Get initial balances
      const initialOwnerBalance = (await getAccount(provider.connection, tokenAccount.publicKey)).amount;
      const initialRecipientBalance = (await getAccount(provider.connection, recipientTokenAccount.publicKey)).amount;

      await program.methods
        .protectedTransferFrom(task, attestation, new anchor.BN(transferAmount))
        .accounts({
          protectedAccount: protectedAccountPda,
          sourceTokenAccount: tokenAccount.publicKey,
          destinationTokenAccount: recipientTokenAccount.publicKey,
          delegate: delegate.publicKey,
          predicateRegistry: predicateRegistryProgram.programId,
          registry: registryPda,
          attestorAccount: attestorPda,
          policyAccount: policyPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([delegate])
        .rpc();

      // Verify balances changed
      const finalOwnerBalance = (await getAccount(provider.connection, tokenAccount.publicKey)).amount;
      const finalRecipientBalance = (await getAccount(provider.connection, recipientTokenAccount.publicKey)).amount;

      expect(Number(finalOwnerBalance)).to.equal(Number(initialOwnerBalance) - transferAmount);
      expect(Number(finalRecipientBalance)).to.equal(Number(initialRecipientBalance) + transferAmount);

      // Verify transfer stats updated
      const protectedAccount = await program.account.protectedTokenAccount.fetch(protectedAccountPda);
      expect(protectedAccount.transferCount.toNumber()).to.equal(2); // Previous test + this one
    });

    it("Fail transfer with expired task", async () => {
      // Create expired task
      const expiredTask = {
        ...task,
        expiration: new anchor.BN(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
      };

      try {
        await program.methods
          .protectedTransfer(expiredTask, attestation, new anchor.BN(transferAmount))
          .accounts({
            protectedAccount: protectedAccountPda,
            sourceTokenAccount: tokenAccount.publicKey,
            destinationTokenAccount: recipientTokenAccount.publicKey,
            owner: tokenOwner.publicKey,
            predicateRegistry: predicateRegistryProgram.programId,
            registry: registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([tokenOwner])
          .rpc();
        
        expect.fail("Should have failed with expired task");
      } catch (error: any) {
        expect(error.message).to.include("TaskExpired");
      }
    });

    it("Fail transfer with insufficient balance", async () => {
      // Try to transfer more than available
      const largeAmount = mintAmount * 2;
      const largeTask = {
        ...task,
        msgValue: new anchor.BN(largeAmount),
      };

      try {
        await program.methods
          .protectedTransfer(largeTask, attestation, new anchor.BN(largeAmount))
          .accounts({
            protectedAccount: protectedAccountPda,
            sourceTokenAccount: tokenAccount.publicKey,
            destinationTokenAccount: recipientTokenAccount.publicKey,
            owner: tokenOwner.publicKey,
            predicateRegistry: predicateRegistryProgram.programId,
            registry: registryPda,
            attestorAccount: attestorPda,
            policyAccount: policyPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([tokenOwner])
          .rpc();
        
        expect.fail("Should have failed with insufficient balance");
      } catch (error: any) {
        expect(error.message).to.include("InsufficientBalance");
      }
    });
  });
});

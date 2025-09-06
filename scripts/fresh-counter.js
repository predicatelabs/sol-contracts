const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");

async function main() {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter;
  const user = provider.wallet;
  
  console.log(`User: ${user.publicKey.toString()}`);
  console.log(`Program ID: ${program.programId.toString()}`);

  // Create a new keypair for a fresh counter
  const newUser = Keypair.generate();
  console.log(`New User: ${newUser.publicKey.toString()}`);
  
  // Airdrop some SOL to the new user for transaction fees
  console.log("\nAirdropping SOL to new user...");
  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(newUser.publicKey, 1000000000) // 1 SOL
  );
  
  // Derive the counter PDA for the new user
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), newUser.publicKey.toBuffer()],
    program.programId
  );

  console.log(`Counter PDA: ${counterPda.toString()}`);

  try {
    // Initialize the counter
    console.log("\nInitializing counter...");
    const initTx = await program.methods
      .initialize()
      .accounts({
        counter: counterPda,
        user: newUser.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([newUser])
      .rpc();

    console.log(`Initialize transaction signature: ${initTx}`);

    // Fetch the initial counter value
    let counterAccount = await program.account.counter.fetch(counterPda);
    console.log(`Initial counter value: ${counterAccount.count.toString()}`);
    console.log(`Authority: ${counterAccount.authority.toString()}`);

    // Now increment the counter
    console.log("\nIncrementing counter...");
    const incrementTx = await program.methods
      .increment()
      .accounts({
        counter: counterPda,
        authority: newUser.publicKey,
      })
      .signers([newUser])
      .rpc();

    console.log(`Increment transaction signature: ${incrementTx}`);

    // Fetch the updated counter value
    counterAccount = await program.account.counter.fetch(counterPda);
    console.log(`\nFinal counter value: ${counterAccount.count.toString()}`);
    console.log(`Total increments: ${counterAccount.totalIncrements.toString()}`);
    console.log(`Total decrements: ${counterAccount.totalDecrements.toString()}`);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().catch(console.error);
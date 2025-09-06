const anchor = require("@coral-xyz/anchor");
const { PublicKey } = require("@solana/web3.js");

async function main() {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter;
  const user = provider.wallet;
  
  // Derive the counter PDA
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), user.publicKey.toBuffer()],
    program.programId
  );

  console.log(`Counter PDA: ${counterPda.toString()}`);
  console.log(`User: ${user.publicKey.toString()}`);
  console.log(`Program ID: ${program.programId.toString()}`);

  try {
    // First, try to fetch the current counter value
    console.log("\nFetching current counter value...");
    const counterAccount = await program.account.counter.fetch(counterPda);
    console.log(`Current counter value: ${counterAccount.count.toString()}`);
    console.log(`Total increments: ${counterAccount.totalIncrements.toString()}`);
    console.log(`Total decrements: ${counterAccount.totalDecrements.toString()}`);
    console.log(`Authority: ${counterAccount.authority.toString()}`);

    // Now increment the counter
    console.log("\nIncrementing counter...");
    const tx = await program.methods
      .increment()
      .accounts({
        counter: counterPda,
        authority: user.publicKey,
      })
      .rpc();

    console.log(`Increment transaction signature: ${tx}`);

    // Fetch the updated counter value
    const updatedAccount = await program.account.counter.fetch(counterPda);
    console.log(`\nUpdated counter value: ${updatedAccount.count.toString()}`);
    console.log(`Total increments: ${updatedAccount.totalIncrements.toString()}`);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().catch(console.error);
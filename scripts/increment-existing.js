const anchor = require("@coral-xyz/anchor");
const { PublicKey } = require("@solana/web3.js");

async function main() {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter;
  
  // Use the counter PDA from our previous successful transaction
  const counterPda = new PublicKey("6wTTwrpLbpyQC6qzBj9wC3Zc4eDU4YkXQa2nVfpxqSkx");
  const authority = new PublicKey("AbFJTKGqKc3i2mhE2M27BscQpzcsN8AMqgWoKpugmXKC");

  console.log(`Counter PDA: ${counterPda.toString()}`);
  console.log(`Authority: ${authority.toString()}`);

  try {
    // First, fetch the current counter value
    console.log("\nFetching current counter value...");
    const counterAccount = await program.account.counter.fetch(counterPda);
    console.log(`Current counter value: ${counterAccount.count.toString()}`);
    console.log(`Total increments: ${counterAccount.totalIncrements.toString()}`);
    console.log(`Total decrements: ${counterAccount.totalDecrements.toString()}`);

    // Since we can't use the private key of the generated keypair from the previous run,
    // let's check if we can create our own counter instead
    console.log("\nTrying to create a new counter with current wallet...");
    
    const user = provider.wallet;
    const [myCounterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter"), user.publicKey.toBuffer()],
      program.programId
    );

    console.log(`My Counter PDA: ${myCounterPda.toString()}`);

    // Check if this counter already exists
    let myCounterExists = false;
    try {
      await program.account.counter.fetch(myCounterPda);
      myCounterExists = true;
      console.log("Counter already exists for current wallet");
    } catch (e) {
      console.log("Counter doesn't exist, will initialize");
    }

    if (!myCounterExists) {
      // Initialize counter for current wallet
      console.log("\nInitializing counter for current wallet...");
      const initTx = await program.methods
        .initialize()
        .accounts({
          counter: myCounterPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`Initialize transaction signature: ${initTx}`);
    }

    // Fetch current state of my counter
    let myCounter = await program.account.counter.fetch(myCounterPda);
    console.log(`\nMy counter current value: ${myCounter.count.toString()}`);

    // Now increment my counter
    console.log("\nIncrementing my counter...");
    const incrementTx = await program.methods
      .increment()
      .accounts({
        counter: myCounterPda,
        authority: user.publicKey,
      })
      .rpc();

    console.log(`Increment transaction signature: ${incrementTx}`);

    // Fetch the updated counter value
    myCounter = await program.account.counter.fetch(myCounterPda);
    console.log(`\nUpdated counter value: ${myCounter.count.toString()}`);
    console.log(`Total increments: ${myCounter.totalIncrements.toString()}`);
    console.log(`Total decrements: ${myCounter.totalDecrements.toString()}`);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().catch(console.error);
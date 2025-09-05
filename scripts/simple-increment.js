const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");

async function main() {
  // Configure the client to use devnet  
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter;
  
  // Generate a new keypair for this session
  const sessionKey = Keypair.generate();
  console.log(`Session User: ${sessionKey.publicKey.toString()}`);
  
  // Derive counter PDA for session user
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), sessionKey.publicKey.toBuffer()],
    program.programId
  );
  
  console.log(`Counter PDA: ${counterPda.toString()}`);

  try {
    // Check if counter exists
    let counterExists = false;
    let currentValue = 0;
    
    try {
      const counterAccount = await program.account.counter.fetch(counterPda);
      counterExists = true;
      currentValue = parseInt(counterAccount.count.toString());
      console.log(`Existing counter value: ${currentValue}`);
    } catch (e) {
      console.log("Counter doesn't exist yet");
    }

    if (!counterExists) {
      console.log("\nInitializing new counter...");
      
      // Need to fund the session key first
      const user = provider.wallet;
      const fundTx = await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: user.publicKey,
            toPubkey: sessionKey.publicKey,
            lamports: 10000000, // 0.01 SOL
          })
        ),
        [user.payer]
      );
      
      console.log(`Funding transaction: ${fundTx}`);
      
      const initTx = await program.methods
        .initialize()
        .accounts({
          counter: counterPda,
          user: sessionKey.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([sessionKey])
        .rpc();

      console.log(`Initialize transaction: ${initTx}`);
      currentValue = 0;
    }

    // Increment the counter
    console.log(`\nIncrementing counter from ${currentValue} to ${currentValue + 1}...`);
    const incrementTx = await program.methods
      .increment()
      .accounts({
        counter: counterPda,
        authority: sessionKey.publicKey,
      })
      .signers([sessionKey])
      .rpc();

    console.log(`Increment transaction: ${incrementTx}`);

    // Fetch final value
    const finalAccount = await program.account.counter.fetch(counterPda);
    console.log(`\n✅ Counter incremented!`);
    console.log(`Final value: ${finalAccount.count.toString()}`);
    console.log(`Total increments: ${finalAccount.totalIncrements.toString()}`);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().catch(console.error);
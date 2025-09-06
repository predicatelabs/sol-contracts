import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Counter } from "../target/types/counter";
import { PublicKey } from "@solana/web3.js";

async function main() {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter as Program<Counter>;
  const user = provider.wallet as anchor.Wallet;
  
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

  } catch (error: any) {
    if (error?.message?.includes("Account does not exist")) {
      console.log("Counter not initialized. Initializing now...");
      
      const tx = await program.methods
        .initialize()
        .accounts({
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`Initialize transaction signature: ${tx}`);

      // Fetch and display the initialized counter
      const counterAccount = await program.account.counter.fetch(counterPda);
      console.log(`Initial counter value: ${counterAccount.count.toString()}`);
    } else {
      console.error("Error:", error);
    }
  }
}

main().catch(console.error);
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../../target/types/predicate_registry";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

export interface TestRegistryPDA {
  registryPda: PublicKey;
  registryBump: number;
}

export interface TestAuthority {
  keypair: Keypair;
}

export interface TestAccount {
  keypair: Keypair;
}

/**
 * Path to the persistent test authority keypair
 */
const TEST_AUTHORITY_KEYPAIR_PATH = path.join(
  __dirname,
  "test-authority-keypair.json"
);

/**
 * Loads the persistent test authority keypair from disk
 */
export function loadTestAuthorityKeypair(): Keypair {
  try {
    const keypairData = JSON.parse(
      fs.readFileSync(TEST_AUTHORITY_KEYPAIR_PATH, "utf8")
    );
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  } catch (error) {
    throw new Error(
      `Failed to load test authority keypair from ${TEST_AUTHORITY_KEYPAIR_PATH}: ${error}`
    );
  }
}

/**
 * Gets the public key of the persistent test authority without loading the full keypair
 */
export function getTestAuthorityPublicKey(): PublicKey {
  return loadTestAuthorityKeypair().publicKey;
}

/**
 * Creates a test authority using the persistent keypair and funds it with SOL
 */
export async function createTestAuthority(
  provider: anchor.AnchorProvider
): Promise<TestAuthority> {
  const keypair = loadTestAuthorityKeypair();

  // Check current balance
  const balance = await provider.connection.getBalance(keypair.publicKey);
  const minBalance = anchor.web3.LAMPORTS_PER_SOL; // 1 SOL minimum

  // Fund if balance is low
  if (balance < minBalance) {
    console.log(
      `Funding test authority ${keypair.publicKey.toString()} with SOL...`
    );
    const signature = await provider.connection.requestAirdrop(
      keypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    // Wait for airdrop to confirm
    await provider.connection.confirmTransaction(signature);
    console.log(`Airdrop confirmed with signature: ${signature}`);
  }

  return {
    keypair: keypair,
  };
}

/**
 * Creates and funds test accounts with SOL (for non-authority accounts)
 */
export async function createTestAccount(
  provider: anchor.AnchorProvider
): Promise<TestAccount> {
  const account: TestAccount = {
    keypair: Keypair.generate(),
  };

  // Airdrop SOL to all accounts
  const signature = await provider.connection.requestAirdrop(
    account.keypair.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL
  );

  // Wait for airdrops to confirm
  await provider.connection.confirmTransaction(signature);

  return account;
}

/**
 * Finds program-derived addresses for the registry
 */
export function findRegistryPDA(programId: PublicKey): TestRegistryPDA {
  const [registryPda, registryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    programId
  );

  return {
    registryPda: registryPda,
    registryBump: registryBump,
  };
}

/**
 * Finds attester PDA for a given attester public key
 */
export function findAttesterPDA(
  attester: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("attester"), attester.toBuffer()],
    programId
  );
}

/**
 * Finds policy PDA for a given client public key
 */
export function findPolicyPDA(
  client: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), client.toBuffer()],
    programId
  );
}

/**
 * Finds used UUID PDA for a given UUID
 */
export function findUsedUuidPDA(
  uuid: number[],
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("used_uuid"), Buffer.from(uuid)],
    programId
  );
}

/**
 * Initializes the predicate registry with the given authority
 */
export async function initializeRegistry(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  registryPda: PublicKey
): Promise<anchor.web3.TransactionSignature> {
  console.log(
    "Initializing registry with authority:",
    authority.publicKey.toString()
  );
  console.log("Registry PDA:", registryPda.toString());
  console.log("System Program:", SystemProgram.programId.toString());
  console.log("Program ID:", program.programId.toString());

  return await program.methods
    .initialize()
    .accounts({
      registry: registryPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([authority])
    .rpc();
}

/**
 * Initializes the predicate registry with the given authority if it does not exist
 */
export async function initializeRegistryIfNotExists(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  registryPda: PublicKey
): Promise<anchor.web3.TransactionSignature> {
  try {
    await program.account.predicateRegistry.fetch(registryPda);
    console.log("Registry already exists");
    return "";
  } catch (error) {
    console.log("Registry does not exist");
  }
  return await initializeRegistry(program, authority, registryPda);
}

/**
 * Registers an attester with the registry
 */
export async function registerAttester(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  attester: PublicKey,
  registryPda: PublicKey
): Promise<string> {
  const [attesterPda] = findAttesterPDA(attester, program.programId);

  return await program.methods
    .registerAttester(attester)
    .accounts({
      registry: registryPda,
      attesterAccount: attesterPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
}

export async function registerAttesterIfNotExists(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  attester: PublicKey,
  registryPda: PublicKey
): Promise<string> {
  try {
    await program.account.attesterAccount.fetch(
      findAttesterPDA(attester, program.programId)[0]
    );
    console.log("Attester already exists");
    return "";
  } catch (error) {
    console.log("Attester does not exist");
  }
  return await registerAttester(program, authority, attester, registryPda);
}

/**
 * Sets a policy ID for a client
 */
export async function setPolicyId(
  program: Program<PredicateRegistry>,
  client: Keypair,
  policyId: string,
  registryPda: PublicKey
): Promise<string> {
  const [policyPda] = findPolicyPDA(client.publicKey, program.programId);

  return await program.methods
    .setPolicyId(policyId)
    .accounts({
      registry: registryPda,
      policyAccount: policyPda,
      client: client.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([client])
    .rpc();
}

/**
 * Updates a policy ID for a client
 */
export async function updatePolicyId(
  program: Program<PredicateRegistry>,
  client: Keypair,
  policyId: string,
  registryPda: PublicKey
): Promise<string> {
  const [policyPda] = findPolicyPDA(client.publicKey, program.programId);

  return await program.methods
    .updatePolicyId(policyId)
    .accounts({
      registry: registryPda,
      policyAccount: policyPda,
      client: client.publicKey,
    } as any)
    .signers([client])
    .rpc();
}

/**
 * Creates a test statement structure
 */
export function createTestStatement(
  uuid: Buffer,
  msgSender: PublicKey,
  target: PublicKey,
  msgValue: number,
  encodedSigAndArgs: Buffer,
  policyId: string,
  expiration: number
): any {
  return {
    uuid: Array.from(uuid),
    msgSender,
    target,
    msgValue: new anchor.BN(msgValue),
    encodedSigAndArgs: Array.from(encodedSigAndArgs),
    policyId: policyId,
    expiration: new anchor.BN(expiration),
  };
}

/**
 * Creates a test attestation structure
 */
export function createTestAttestation(
  uuid: Buffer,
  attester: PublicKey,
  signature: Buffer,
  expiration: number
): any {
  return {
    uuid: Array.from(uuid),
    attester,
    signature: Array.from(signature),
    expiration: new anchor.BN(expiration),
  };
}

/**
 * Generates a random UUID as 16 bytes
 */
export function generateUUID(): Buffer {
  return Buffer.from(
    Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  );
}

/**
 * Generates a random signature as 64 bytes (for testing purposes only)
 */
export function generateTestSignature(): Buffer {
  return Buffer.from(
    Array.from({ length: 64 }, () => Math.floor(Math.random() * 256))
  );
}

/**
 * Gets current timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Gets future timestamp (current + seconds)
 */
export function getFutureTimestamp(secondsFromNow: number): number {
  return getCurrentTimestamp() + secondsFromNow;
}

/**
 * Gets past timestamp (current - seconds)
 */
export function getPastTimestamp(secondsAgo: number): number {
  return getCurrentTimestamp() - secondsAgo;
}

/**
 * Waits for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asserts that an error contains a specific message
 */
export function expectError(error: any, expectedMessage: string): void {
  if (!error || !error.message) {
    throw new Error(
      `Expected error with message containing "${expectedMessage}", but no error was thrown`
    );
  }

  if (!error.message.includes(expectedMessage)) {
    throw new Error(
      `Expected error message to contain "${expectedMessage}", but got: ${error.message}`
    );
  }
}

/**
 * Creates a funded keypair for testing
 */
export async function createFundedKeypair(
  provider: anchor.AnchorProvider
): Promise<Keypair> {
  const keypair = Keypair.generate();
  await provider.connection.requestAirdrop(
    keypair.publicKey,
    anchor.web3.LAMPORTS_PER_SOL
  );
  await sleep(500);
  return keypair;
}

/**
 * Wrapper for findRegistryPDA to match expected interface
 */
export function getRegistryPDA(programId: PublicKey) {
  const result = findRegistryPDA(programId);
  return {
    registryPda: result.registryPda,
    registryBump: result.registryBump,
  };
}

/**
 * Wrapper for findAttesterPDA to match expected interface
 */
export function getAttesterPDA(programId: PublicKey, attester: PublicKey) {
  const [attesterPda, attesterBump] = findAttesterPDA(attester, programId);
  return {
    attesterPda,
    attesterBump,
  };
}

/**
 * Wrapper for findPolicyPDA to match expected interface
 */
export function getPolicyPDA(programId: PublicKey, client: PublicKey) {
  const [policyPda, policyBump] = findPolicyPDA(client, programId);
  return {
    policyPda,
    policyBump,
  };
}

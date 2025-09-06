import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../../target/types/predicate_registry";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

export interface TestAccounts {
  authority: Keypair;
  newAuthority: Keypair;
  client1: Keypair;
  client2: Keypair;
  attestor1: Keypair;
  attestor2: Keypair;
  validator: Keypair;
}

export interface TestPDAs {
  registryPda: PublicKey;
  registryBump: number;
}

/**
 * Creates and funds test accounts with SOL
 */
export async function createTestAccounts(provider: anchor.AnchorProvider): Promise<TestAccounts> {
  const accounts: TestAccounts = {
    authority: Keypair.generate(),
    newAuthority: Keypair.generate(),
    client1: Keypair.generate(),
    client2: Keypair.generate(),
    attestor1: Keypair.generate(),
    attestor2: Keypair.generate(),
    validator: Keypair.generate(),
  };

  // Airdrop SOL to all accounts
  const accountKeys = Object.values(accounts);
  for (const account of accountKeys) {
    await provider.connection.requestAirdrop(account.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
  }

  // Wait for airdrops to confirm
  await new Promise(resolve => setTimeout(resolve, 1000));

  return accounts;
}

/**
 * Finds program-derived addresses for the registry
 */
export function findRegistryPDAs(programId: PublicKey): TestPDAs {
  const [registryPda, registryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("predicate_registry")],
    programId
  );

  return {
    registryPda,
    registryBump,
  };
}

/**
 * Finds attestor PDA for a given attestor public key
 */
export function findAttestorPDA(attestor: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("attestor"), attestor.toBuffer()],
    programId
  );
}

/**
 * Finds policy PDA for a given client public key
 */
export function findPolicyPDA(client: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), client.toBuffer()],
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
): Promise<string> {
  return await program.methods
    .initialize()
    .accounts({
      registry: registryPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
}

/**
 * Registers an attestor with the registry
 */
export async function registerAttestor(
  program: Program<PredicateRegistry>,
  authority: Keypair,
  attestor: PublicKey,
  registryPda: PublicKey
): Promise<string> {
  const [attestorPda] = findAttestorPDA(attestor, program.programId);

  return await program.methods
    .registerAttestor(attestor)
    .accounts({
      registry: registryPda,
      attestorAccount: attestorPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
}

/**
 * Sets a policy for a client
 */
export async function setPolicy(
  program: Program<PredicateRegistry>,
  client: Keypair,
  policy: Buffer,
  registryPda: PublicKey
): Promise<string> {
  const [policyPda] = findPolicyPDA(client.publicKey, program.programId);

  return await program.methods
    .setPolicy(policy)
    .accounts({
      registry: registryPda,
      policyAccount: policyPda,
      client: client.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([client])
    .rpc();
}

/**
 * Creates a test task structure
 */
export function createTestTask(
  uuid: Buffer,
  msgSender: PublicKey,
  target: PublicKey,
  msgValue: number,
  encodedSigAndArgs: Buffer,
  policy: Buffer,
  expiration: number
): any {
  // Pad policy to 200 bytes
  const paddedPolicy = Buffer.alloc(200);
  policy.copy(paddedPolicy);

  return {
    uuid: Array.from(uuid),
    msgSender,
    target,
    msgValue: new anchor.BN(msgValue),
    encodedSigAndArgs: Array.from(encodedSigAndArgs),
    policy: Array.from(paddedPolicy),
    expiration: new anchor.BN(expiration),
  };
}

/**
 * Creates a test attestation structure
 */
export function createTestAttestation(
  uuid: Buffer,
  attestor: PublicKey,
  signature: Buffer,
  expiration: number
): any {
  return {
    uuid: Array.from(uuid),
    attestor,
    signature: Array.from(signature),
    expiration: new anchor.BN(expiration),
  };
}

/**
 * Generates a random UUID as 16 bytes
 */
export function generateUUID(): Buffer {
  return Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
}

/**
 * Generates a random signature as 64 bytes (for testing purposes only)
 */
export function generateTestSignature(): Buffer {
  return Buffer.from(Array.from({ length: 64 }, () => Math.floor(Math.random() * 256)));
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
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Asserts that an error contains a specific message
 */
export function expectError(error: any, expectedMessage: string): void {
  if (!error || !error.message) {
    throw new Error(`Expected error with message containing "${expectedMessage}", but no error was thrown`);
  }
  
  if (!error.message.includes(expectedMessage)) {
    throw new Error(`Expected error message to contain "${expectedMessage}", but got: ${error.message}`);
  }
}

/**
 * Creates a funded keypair for testing
 */
export async function createFundedKeypair(provider: anchor.AnchorProvider): Promise<Keypair> {
  const keypair = Keypair.generate();
  await provider.connection.requestAirdrop(keypair.publicKey, anchor.web3.LAMPORTS_PER_SOL);
  await sleep(500);
  return keypair;
}

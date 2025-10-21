import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../../target/types/predicate_registry";
import {
  createTestAccount,
  createTestAuthority,
  findRegistryPDA,
  initializeRegistryIfNotExists,
  TestAccount,
  TestRegistryPDA,
} from "./test-utils";

export interface SharedTestContext {
  program: Program<PredicateRegistry>;
  provider: anchor.AnchorProvider;
  authority: TestAccount;
  registry: TestRegistryPDA;
}

let sharedContext: SharedTestContext | null = null;

/**
 * Gets or creates the shared test context
 * This ensures all tests use the same accounts and initialized registry
 */
export async function getSharedTestContext(): Promise<SharedTestContext> {
  if (sharedContext) {
    return sharedContext;
  }

  // Set up provider and program
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace
    .PredicateRegistry as Program<PredicateRegistry>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const pda = findRegistryPDA(program.programId);

  // Create test authority using persistent keypair
  const authority = await createTestAuthority(provider);

  // Initialize registry
  const tx = await initializeRegistryIfNotExists(
    program,
    authority.keypair,
    pda.registryPda
  );
  console.log("Registry initialized with tx:", tx);

  sharedContext = {
    program,
    provider,
    authority,
    registry: pda,
  };

  return sharedContext;
}

/**
 * Helper function to set up shared context in test files
 * Call this in your describe block's before() hook
 */
export async function setupSharedTestContext(): Promise<SharedTestContext> {
  return await getSharedTestContext();
}

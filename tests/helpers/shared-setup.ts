import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredicateRegistry } from "../../target/types/predicate_registry";
import {
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
  originalAuthority: TestAccount; // Store original authority for restoration
}

let sharedContext: SharedTestContext | null = null;

/**
 * Verifies that the registry authority is set to the expected authority
 * Throws a descriptive error if not, to help debug test cleanup issues
 */
export async function verifyAuthorityState(
  context: SharedTestContext,
  options: {
    when: "before" | "after";
    suiteName?: string;
  } = { when: "before" }
): Promise<void> {
  try {
    const registryAccount =
      await context.program.account.predicateRegistry.fetch(
        context.registry.registryPda
      );

    if (
      !registryAccount.authority.equals(
        context.originalAuthority.keypair.publicKey
      )
    ) {
      const isBefore = options.when === "before";
      const errorTitle = isBefore
        ? "❌ AUTHORITY MISMATCH DETECTED ❌"
        : "❌ AUTHORITY NOT RESTORED ❌";
      const errorContext = isBefore
        ? "A previous test suite failed to restore authority properly.\n" +
          "This test suite cannot run until that issue is fixed.\n" +
          "\n" +
          "Likely culprit: The test suite that ran before this one.\n" +
          "Check the test execution order and ensure cleanup hooks are working."
        : `The ${
            options.suiteName || "test suite"
          } failed to restore authority.\n` +
          "This will cause subsequent test suites to fail.\n" +
          "\n" +
          "Check the cleanup hooks (afterEach/finally blocks) to ensure they properly restore authority.";

      throw new Error(
        `\n\n` +
          `${errorTitle}\n` +
          `\n` +
          `Registry authority: ${registryAccount.authority.toString()}\n` +
          `Expected authority: ${context.originalAuthority.keypair.publicKey.toString()}\n` +
          `\n` +
          `${errorContext}\n`
      );
    }

    // Success message only for 'after' checks
    if (options.when === "after") {
      console.log("\n✓ Authority correctly restored for subsequent tests\n");
    }
  } catch (error: any) {
    // If it's our authority verification error, re-throw it
    if (
      error.message?.includes("AUTHORITY MISMATCH") ||
      error.message?.includes("AUTHORITY NOT RESTORED")
    ) {
      throw error;
    }
    // Otherwise, log and continue (might be a transient network error)
    console.warn("Failed to verify authority state:", error);
  }
}

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
    originalAuthority: authority, // Keep reference to original
  };

  return sharedContext;
}

/**
 * Helper function to set up shared context in test files
 * Call this in your describe block's before() hook
 *
 * This checks that authority is in the correct state. If not, it throws an error
 * to immediately fail the test suite, making it clear that a previous test failed cleanup.
 */
export async function setupSharedTestContext(): Promise<SharedTestContext> {
  const context = await getSharedTestContext();

  // Fail fast if authority is not at the original
  await verifyAuthorityState(context, { when: "before" });

  return context;
}

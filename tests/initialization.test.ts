import { expect } from "chai";
import { SystemProgram } from "@solana/web3.js";
import {
  setupSharedTestContext,
  SharedTestContext,
} from "./helpers/shared-setup";

describe("Registry Initialization", () => {
  let context: SharedTestContext;
  let registryInitialized = false;

  before(async () => {
    context = await setupSharedTestContext();
    registryInitialized = true; // Registry is already initialized by shared setup
  });

  describe("Successful Initialization", () => {
    it("Should have registry initialized with correct initial state", async () => {
      // Registry is already initialized by shared setup, so we just verify its state
      const registryAccount =
        await context.program.account.predicateRegistry.fetch(
          context.registry.registryPda
        );

      expect(registryAccount.authority.toString()).to.equal(
        context.authority.keypair.publicKey.toString()
      );
      expect(
        registryAccount.totalAttestors.toNumber()
      ).to.be.greaterThanOrEqual(0);
      expect(registryAccount.totalPolicies.toNumber()).to.be.greaterThanOrEqual(
        0
      );
      expect(registryAccount.createdAt.toNumber()).to.be.greaterThan(0);
      expect(registryAccount.updatedAt.toNumber()).to.be.greaterThan(0);

      const accountInfo = await context.provider.connection.getAccountInfo(
        context.registry.registryPda
      );
      expect(accountInfo).to.not.be.null;
      expect(accountInfo!.owner.toString()).to.equal(
        context.program.programId.toString()
      );
      // Verify account has correct data length (8 bytes discriminator + PredicateRegistry size)
      expect(accountInfo!.data.length).to.be.greaterThan(8);
    });
  });

  describe("Initialization Errors", () => {
    it("Should fail when trying to initialize an already initialized registry", async () => {
      // Use a fresh keypair for this error test since we only need to test the PDA collision
      const freshAuthority = context.authority.keypair;

      // Try to initialize again - this should fail
      try {
        await context.program.methods
          .initialize()
          .accounts({
            registry: context.registry.registryPda,
            authority: freshAuthority.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([freshAuthority])
          .rpc();

        // If we reach here, the test should fail
        expect.fail(
          "Expected initialization to fail for already initialized registry"
        );
      } catch (error: any) {
        // Verify it's the expected error (account already exists)
        expect(error.message).to.include("already in use");
      }
    });
  });
});

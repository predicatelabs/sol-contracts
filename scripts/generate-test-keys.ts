#!/usr/bin/env ts-node

/**
 * Generate Test Keys Script
 * 
 * This script generates test keypairs and saves them to the test-keys folder.
 * It creates:
 * - 1 authority keypair (authority)
 * - 3 attestor keypairs (attestor-1, attestor-2, attestor-3)
 */

import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

interface KeyInfo {
  name: string;
  type: 'authority' | 'attestor';
  keypair: Keypair;
  publicKey: string;
  filePath: string;
}

/**
 * Generate a single test key
 */
function generateKey(name: string, type: 'authority' | 'attestor', outputDir: string): KeyInfo {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toString();
  const fileName = `${name}.json`;
  const filePath = path.join(outputDir, fileName);
  
  // Save keypair to file
  const secretKeyArray = Array.from(keypair.secretKey);
  fs.writeFileSync(filePath, JSON.stringify(secretKeyArray, null, 2));
  
  return {
    name,
    type,
    keypair,
    publicKey,
    filePath,
  };
}

/**
 * Generate all test keys
 */
function generateAllKeys(): KeyInfo[] {
  const scriptsDir = path.dirname(__filename);
  const testKeysDir = path.join(scriptsDir, "test-keys");
  
  // Ensure directory exists
  if (!fs.existsSync(testKeysDir)) {
    fs.mkdirSync(testKeysDir, { recursive: true });
  }
  
  const keys: KeyInfo[] = [];
  
  // Generate authority key
  const authority = generateKey("authority", "authority", testKeysDir);
  keys.push(authority);
  
  // Generate attestor keys
  const attestorNames = ["attestor-1", "attestor-2", "attestor-3"];
  for (const name of attestorNames) {
    const attestor = generateKey(name, "attestor", testKeysDir);
    keys.push(attestor);
  }
  
  return keys;
}

/**
 * Create a summary file with all public keys
 */
function createSummaryFile(keys: KeyInfo[], outputDir: string): void {
  const summaryPath = path.join(outputDir, "README.md");
  
  let content = "# Test Keys\n\n";
  content += "This directory contains test keypairs for development and testing purposes.\n\n";
  
  // Authority section
  const authority = keys.find(k => k.type === 'authority');
  if (authority) {
    content += "## Authority Key\n\n";
    content += `### ${authority.name}\n`;
    content += `- **Public Key**: \`${authority.publicKey}\`\n`;
    content += `- **File**: \`${authority.name}.json\`\n`;
    content += `- **Usage**: Use this as the authority for initializing the predicate registry\n`;
    content += `- **Environment Variable**: \`export ANCHOR_WALLET=scripts/test-keys/${authority.name}.json\`\n\n`;
  }
  
  // Attestors section
  const attestors = keys.filter(k => k.type === 'attestor');
  content += "## Attestor Keys\n\n";
  
  attestors.forEach((attestor, index) => {
    content += `### ${attestor.name}\n`;
    content += `- **Public Key**: \`${attestor.publicKey}\`\n`;
    content += `- **File**: \`${attestor.name}.json\`\n`;
    content += `- **Register Command**: \`export ATTESTOR_PUBKEY=${attestor.publicKey} && npx ts-node scripts/register-attestor.ts\`\n\n`;
  });
  
  content += "## Usage Examples\n\n";
  content += "### Using the Authority Key\n\n";
  content += "```bash\n";
  content += "# Set the authority wallet for initialization scripts\n";
  if (authority) {
    content += `export ANCHOR_WALLET=scripts/test-keys/${authority.name}.json\n`;
  }
  content += "npx ts-node scripts/initialize-predicate-registry.ts\n";
  content += "```\n\n";
  
  content += "### Registering Attestors\n\n";
  content += "```bash\n";
  content += "# Choose one of the attestors above and set the environment variable\n";
  content += "export ATTESTOR_PUBKEY=<public-key-from-above>\n";
  content += "npx ts-node scripts/register-attestor.ts\n";
  content += "```\n\n";
  
  content += "## Security Notice\n\n";
  content += "⚠️ **These are test keypairs for development only!**\n";
  content += "- Do not use these in production\n";
  content += "- Do not send real funds to these addresses\n";
  content += "- Generate new keypairs for production use\n";
  
  fs.writeFileSync(summaryPath, content);
}

/**
 * Main execution function
 */
function main(): void {
  console.log("🔑 Test Keys Generator");
  console.log("=" .repeat(50));
  console.log("Generating test keys (1 authority + 3 attestors)...\n");

  try {
    const keys = generateAllKeys();
    
    console.log("✅ Successfully generated test keys:");
    
    // Display authority
    const authority = keys.find(k => k.type === 'authority');
    if (authority) {
      console.log(`\n🏛️  Authority Key:`);
      console.log(`   Name: ${authority.name}`);
      console.log(`   Public Key: ${authority.publicKey}`);
      console.log(`   File: ${authority.filePath}`);
    }
    
    // Display attestors
    const attestors = keys.filter(k => k.type === 'attestor');
    console.log(`\n👥 Attestor Keys:`);
    attestors.forEach((attestor, index) => {
      console.log(`\n${index + 1}. ${attestor.name}`);
      console.log(`   Public Key: ${attestor.publicKey}`);
      console.log(`   File: ${attestor.filePath}`);
    });
    
    // Create summary file
    const outputDir = path.dirname(keys[0].filePath);
    createSummaryFile(keys, outputDir);
    
    console.log(`\n💾 All files saved to: ${outputDir}`);
    console.log("📄 Summary file created: README.md");
    
    console.log("\n📋 Quick Setup Commands:");
    if (authority) {
      console.log(`   Authority: export ANCHOR_WALLET=scripts/test-keys/${authority.name}.json`);
    }
    console.log("\n📋 Quick Registration Commands:");
    attestors.forEach((attestor) => {
      console.log(`   ${attestor.name}: export ATTESTOR_PUBKEY=${attestor.publicKey}`);
    });
    
    console.log("\n🎉 Test keys ready for use!");
    console.log("\n⚠️  Remember: These are for testing only!");
    
  } catch (error) {
    console.error("❌ Error generating test keys:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { generateAllKeys, KeyInfo };

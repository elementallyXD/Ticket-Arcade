/**
 * Deploy Mock USDC Token
 *
 * Deploys a MockUSDC token contract for testing on Arc L1 Testnet.
 * After deployment, the script mints initial tokens to the deployer.
 *
 * @usage pnpm hardhat run scripts/deploy-mock-usdc.ts --network arc_testnet
 *
 * @description
 *   This script is useful when:
 *   - Arc testnet doesn't have a USDC faucet
 *   - You need a controlled token supply for testing
 *   - You want to mint tokens to multiple test addresses
 *
 * @security
 *   ⚠️ MockUSDC is for TESTING ONLY - never use in production!
 *   ⚠️ Anyone can call mint() on this contract
 *
 * @output
 *   After successful deployment, add the address to your .env:
 *   USDC_ADDRESS=<deployed_address>
 */

import { network } from "hardhat";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Initial mint amount in USDC (human-readable). Deployer receives this amount. */
const INITIAL_MINT_AMOUNT = "1000000"; // 1 million USDC

/** USDC uses 6 decimals */
const USDC_DECIMALS = 6;

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const log = {
  header: (title: string): void => {
    const border = "═".repeat(60);
    console.log(`\n${border}`);
    console.log(`  ${title}`);
    console.log(border);
  },
  info: (message: string): void => console.log(`ℹ️  ${message}`),
  success: (message: string): void => console.log(`✅ ${message}`),
  warn: (message: string): void => console.warn(`⚠️  ${message}`),
  divider: (): void => console.log("-".repeat(60)),
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DEPLOYMENT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function deployMockUSDC(): Promise<void> {
  log.header("DEPLOY MOCK USDC TOKEN");

  // Connect to network and get signer
  const connection = await network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  // Get network name from config
  const networkName = (connection as any).networkName || "unknown";

  log.info(`Network: ${networkName}`);
  log.info(`Deployer: ${deployerAddress}`);

  // Check deployer balance
  const ethBalance = await ethers.provider.getBalance(deployerAddress);
  const ethBalanceFormatted = ethers.formatEther(ethBalance);
  log.info(`ETH Balance: ${ethBalanceFormatted} ETH`);

  if (ethBalance === 0n) {
    log.warn("Deployer has no ETH! Transaction will fail.");
    log.warn("Get testnet ETH from a faucet first.");
    process.exitCode = 1;
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 1: Deploy MockUSDC Contract
  // ─────────────────────────────────────────────────────────────────────────────

  log.info("\n📦 Deploying MockUSDC contract...");

  const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDCFactory.deploy();

  // Wait for deployment confirmation
  await mockUSDC.waitForDeployment();
  const contractAddress = await mockUSDC.getAddress();

  log.success(`MockUSDC deployed to: ${contractAddress}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 2: Mint Initial Tokens to Deployer
  // ─────────────────────────────────────────────────────────────────────────────

  log.info("\n💰 Minting initial USDC to deployer...");

  const mintAmountInUnits = ethers.parseUnits(INITIAL_MINT_AMOUNT, USDC_DECIMALS);

  const mintTx = await mockUSDC.mint(deployerAddress, mintAmountInUnits);
  await mintTx.wait();

  const deployerBalance = await mockUSDC.balanceOf(deployerAddress);
  const balanceFormatted = ethers.formatUnits(deployerBalance, USDC_DECIMALS);

  log.success(`Minted ${balanceFormatted} USDC to deployer`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Deployment Summary
  // ─────────────────────────────────────────────────────────────────────────────

  log.header("DEPLOYMENT SUMMARY");

  log.info(`Contract Address:   ${contractAddress}`);
  log.info(`Token Name:         ${await mockUSDC.name()}`);
  log.info(`Token Symbol:       ${await mockUSDC.symbol()}`);
  log.info(`Token Decimals:     ${await mockUSDC.decimals()}`);
  log.info(`Your Balance:       ${balanceFormatted} USDC`);

  log.divider();

  // Output for .env configuration
  console.log("\n📋 Add this to your .env file:\n");
  console.log(`USDC_ADDRESS=${contractAddress}`);
  console.log("");

  log.warn("This is a MOCK token for TESTING ONLY!");
  log.warn("Anyone can mint tokens on this contract.");
  log.info("\n🎉 Deployment complete!\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

deployMockUSDC()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error.message || error);
    process.exit(1);
  });

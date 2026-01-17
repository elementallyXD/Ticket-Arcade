/**
 * Create Test Raffle
 *
 * Creates a new raffle on Arc L1 Testnet for testing purposes.
 * The raffle will be deployed with configurable parameters.
 *
 * @usage pnpm hardhat run scripts/create-test-raffle.ts --network arc_testnet
 *
 * @environment
 *   - PRIVATE_KEY: Your wallet private key
 *   - RAFFLE_FACTORY_ADDRESS: RaffleFactory contract address
 *
 * @security Never commit private keys. Use .env file or environment variables.
 */

import { parseUnits } from "ethers";
import {
  CONFIG,
  log,
  loadContracts,
  waitForTransaction,
  extractEvent,
  getCurrentTimestamp,
  formatTimestamp,
  shortAddress,
} from "./test-helpers.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Raffle creation parameters */
interface RaffleCreationParams {
  /** Duration in seconds until raffle closes */
  readonly durationSeconds: number;
  /** Ticket price in USDC (human-readable, e.g., "1.00") */
  readonly ticketPriceUsdc: string;
  /** Maximum number of tickets available */
  readonly maxTickets: number;
  /** Fee in basis points (100 = 1%) */
  readonly feeBps: number;
}

/**
 * Default raffle parameters for testing.
 * Modify these values to customize your test raffle.
 */
const DEFAULT_RAFFLE_PARAMS: RaffleCreationParams = {
  durationSeconds: 3600, // 1 hour
  ticketPriceUsdc: "1", // 1 USDC per ticket
  maxTickets: 100, // Max 100 tickets
  feeBps: 500, // 5% fee
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function createTestRaffle(): Promise<void> {
  log.header("CREATE TEST RAFFLE");

  // Step 1: Load contracts
  log.step(1, "Loading contracts...");
  const { factory, signerAddress } = await loadContracts();

  log.info(`Factory: ${CONFIG.RAFFLE_FACTORY}`);
  log.info(`Signer: ${signerAddress}`);

  const nextRaffleId = await factory.nextRaffleId();
  log.info(`Next raffle ID: ${nextRaffleId}`);

  // Step 2: Prepare raffle parameters
  log.step(2, "Preparing raffle parameters...");

  const raffleEndTime = getCurrentTimestamp() + DEFAULT_RAFFLE_PARAMS.durationSeconds;
  const ticketPriceInSmallestUnits = parseUnits(DEFAULT_RAFFLE_PARAMS.ticketPriceUsdc, 6);
  const { maxTickets, feeBps } = DEFAULT_RAFFLE_PARAMS;
  const feeRecipientAddress = signerAddress; // Fees go to raffle creator

  log.info(`End Time: ${formatTimestamp(raffleEndTime)} (in ${DEFAULT_RAFFLE_PARAMS.durationSeconds}s)`);
  log.info(`Ticket Price: ${DEFAULT_RAFFLE_PARAMS.ticketPriceUsdc} USDC`);
  log.info(`Max Tickets: ${maxTickets}`);
  log.info(`Fee: ${feeBps / 100}%`);
  log.info(`Fee Recipient: ${shortAddress(feeRecipientAddress)}`);

  // Step 3: Create the raffle on-chain
  log.step(3, "Creating raffle on-chain...");

  const transactionReceipt = await waitForTransaction(
    factory.createRaffle(
      raffleEndTime,
      ticketPriceInSmallestUnits,
      maxTickets,
      feeBps,
      feeRecipientAddress
    ),
    "createRaffle"
  );

  // Extract raffle details from RaffleCreated event
  const raffleCreatedEvent = extractEvent(transactionReceipt, factory, "RaffleCreated");

  if (!raffleCreatedEvent) {
    log.error("RaffleCreated event not found in transaction!");
    process.exitCode = 1;
    return;
  }

  const createdRaffleId = raffleCreatedEvent.args.raffleId;
  const createdRaffleAddress = raffleCreatedEvent.args.raffleAddress;

  // Display results
  log.divider();
  log.success("RAFFLE CREATED SUCCESSFULLY!");
  log.divider();
  log.info(`Raffle ID:      ${createdRaffleId}`);
  log.info(`Raffle Address: ${createdRaffleAddress}`);
  log.info(`Transaction:    ${transactionReceipt.hash}`);
  log.info(`Block:          ${transactionReceipt.blockNumber}`);
  log.divider();

  // Next steps instructions
  log.info("\n📋 NEXT STEPS:");
  log.info("1. Wait 3-10 seconds for the backend indexer to process");
  log.info("2. Check the API:");
  log.info(`   curl ${CONFIG.BACKEND_URL}/v1/raffles`);
  log.info(`   curl ${CONFIG.BACKEND_URL}/v1/raffles/${createdRaffleId}`);
  log.info("3. Buy tickets:");
  log.info(`   Set LAST_RAFFLE_ADDRESS=${createdRaffleAddress} in .env`);
  log.info(`   pnpm hardhat run scripts/buy-tickets.ts --network arc_testnet`);
  log.info("");

  // Output for .env configuration
  console.log("\n# Add to your .env or use directly:");
  console.log(`LAST_RAFFLE_ID=${createdRaffleId}`);
  console.log(`LAST_RAFFLE_ADDRESS=${createdRaffleAddress}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

createTestRaffle().catch((error) => {
  log.error(error.message || String(error));
  process.exitCode = 1;
});

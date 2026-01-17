/**
 * Full Integration Test
 *
 * Complete end-to-end test that validates the entire system:
 * 1. Creates a new raffle on-chain
 * 2. Buys tickets for the raffle
 * 3. Verifies data appears in backend API
 * 4. Tests all relevant API endpoints
 *
 * This is the primary test script for validating the complete flow.
 *
 * @usage pnpm hardhat run scripts/full-integration-test.ts --network arc_testnet
 *
 * @environment
 *   - PRIVATE_KEY: Your wallet private key
 *   - RAFFLE_FACTORY_ADDRESS: RaffleFactory contract address
 *   - USDC_ADDRESS: USDC token contract address
 *
 * @security Never commit private keys. Use .env file or environment variables.
 */

import { parseUnits } from "ethers";
import {
  CONFIG,
  log,
  loadContracts,
  loadRaffle,
  waitForTransaction,
  extractEvent,
  formatUSDC,
  approveUSDCIfNeeded,
  getUSDCBalance,
  apiGet,
  waitForRaffleIndexed,
  sleep,
  getCurrentTimestamp,
  shortAddress,
  USDC_DECIMALS,
} from "./test-helpers.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Integration test parameters */
interface IntegrationTestConfig {
  /** Duration in seconds until raffle closes */
  readonly raffleDurationSeconds: number;
  /** Ticket price in USDC (human-readable) */
  readonly ticketPriceUsdc: string;
  /** Maximum number of tickets */
  readonly maxTicketsCount: number;
  /** Fee in basis points (100 = 1%) */
  readonly feeBasisPoints: number;
  /** Number of tickets to buy in test */
  readonly ticketsToPurchase: number;
  /** Time to wait for indexer (milliseconds) */
  readonly indexerWaitTimeMs: number;
}

/**
 * Test configuration with conservative values for quick testing.
 * Uses small ticket price and count to minimize gas and USDC usage.
 */
const TEST_PARAMS: IntegrationTestConfig = {
  raffleDurationSeconds: 3600, // 1 hour
  ticketPriceUsdc: "0.01", // 0.01 USDC per ticket (cheap for testing)
  maxTicketsCount: 10, // Small for faster testing
  feeBasisPoints: 500, // 5%
  ticketsToPurchase: 3, // Buy 3 tickets
  indexerWaitTimeMs: 10000, // Wait 10s for indexer
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST STATE
// ═══════════════════════════════════════════════════════════════════════════════

/** Track test results */
let passedTestCount = 0;
let failedTestCount = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function runIntegrationTest(): Promise<void> {
  log.header("FULL INTEGRATION TEST");

  const testStartTimestamp = Date.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: SETUP - Load contracts and check balances
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(1, "Loading contracts and checking balances...");

  const { factory, usdc, signer, signerAddress } = await loadContracts();

  log.info(`Factory: ${shortAddress(CONFIG.RAFFLE_FACTORY)}`);
  log.info(`USDC: ${shortAddress(CONFIG.USDC)}`);
  log.info(`Signer: ${signerAddress}`);

  // Check USDC balance
  const currentUsdcBalance = await getUSDCBalance(usdc, signerAddress);
  const requiredUsdcAmount =
    parseUnits(TEST_PARAMS.ticketPriceUsdc, USDC_DECIMALS) *
    BigInt(TEST_PARAMS.ticketsToPurchase);

  log.info(`USDC Balance: ${formatUSDC(currentUsdcBalance)} USDC`);
  log.info(`Required for test: ${formatUSDC(requiredUsdcAmount)} USDC`);

  if (currentUsdcBalance < requiredUsdcAmount) {
    log.error("Insufficient USDC for test!");
    log.info("Please get test USDC tokens first.");
    process.exitCode = 1;
    return;
  }

  log.success("Setup complete");
  passedTestCount++;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: CREATE RAFFLE
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(2, "Creating test raffle...");

  const raffleEndTime = getCurrentTimestamp() + TEST_PARAMS.raffleDurationSeconds;
  const ticketPriceInUnits = parseUnits(TEST_PARAMS.ticketPriceUsdc, USDC_DECIMALS);

  // Variables to store created raffle info
  let createdRaffleId: number;
  let createdRaffleAddress: string;

  try {
    const createReceipt = await waitForTransaction(
      factory.createRaffle(
        raffleEndTime,
        ticketPriceInUnits,
        TEST_PARAMS.maxTicketsCount,
        TEST_PARAMS.feeBasisPoints,
        signerAddress
      ),
      "createRaffle"
    );

    const raffleCreatedEvent = extractEvent(createReceipt, factory, "RaffleCreated");
    if (!raffleCreatedEvent) {
      throw new Error("RaffleCreated event not found");
    }

    createdRaffleId = Number(raffleCreatedEvent.args.raffleId);
    createdRaffleAddress = raffleCreatedEvent.args.raffleAddress;

    log.success(`Raffle created: ID=${createdRaffleId}, Address=${shortAddress(createdRaffleAddress)}`);
    passedTestCount++;
  } catch (error: any) {
    log.error(`Failed to create raffle: ${error.message}`);
    failedTestCount++;
    process.exitCode = 1;
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: WAIT FOR INDEXER
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(3, "Waiting for backend to index raffle...");

  try {
    const indexedRaffleData = await waitForRaffleIndexed(
      createdRaffleId,
      TEST_PARAMS.indexerWaitTimeMs
    );
    log.success(`Raffle indexed: status=${indexedRaffleData.status}`);
    passedTestCount++;
  } catch (error: any) {
    log.error(`Raffle not indexed: ${error.message}`);
    log.warn("Continuing with remaining tests...");
    failedTestCount++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: BUY TICKETS
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(4, "Buying tickets...");

  const raffleContract = await loadRaffle(createdRaffleAddress, signer);
  const totalPurchaseCost = ticketPriceInUnits * BigInt(TEST_PARAMS.ticketsToPurchase);

  try {
    // Approve USDC spending
    await approveUSDCIfNeeded(usdc, createdRaffleAddress, totalPurchaseCost);

    // Execute ticket purchase
    const purchaseReceipt = await waitForTransaction(
      raffleContract.buyTickets(TEST_PARAMS.ticketsToPurchase),
      `buyTickets(${TEST_PARAMS.ticketsToPurchase})`
    );

    const ticketsBoughtEvent = extractEvent(purchaseReceipt, raffleContract, "TicketsBought");
    if (!ticketsBoughtEvent) {
      throw new Error("TicketsBought event not found");
    }

    const ticketCount = ticketsBoughtEvent.args.count;
    const startIndex = ticketsBoughtEvent.args.startIndex;
    const endIndex = ticketsBoughtEvent.args.endIndex;

    log.success(`Tickets purchased: ${ticketCount} tickets (range ${startIndex}-${endIndex})`);
    passedTestCount++;
  } catch (error: any) {
    log.error(`Failed to buy tickets: ${error.message}`);
    failedTestCount++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: WAIT FOR PURCHASE INDEXING
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(5, "Waiting for purchases to be indexed...");
  const purchaseIndexWaitMs = 5000;
  await sleep(purchaseIndexWaitMs);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: VERIFY DATA IN BACKEND API
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(6, "Verifying data in backend API...");

  // Test: Raffle details match
  try {
    const apiRaffleData = await apiGet(`/v1/raffles/${createdRaffleId}`);
    if (apiRaffleData.raffle_id !== createdRaffleId) {
      throw new Error(`Wrong raffle ID: ${apiRaffleData.raffle_id}`);
    }
    if (apiRaffleData.total_tickets !== TEST_PARAMS.ticketsToPurchase) {
      throw new Error(
        `Wrong ticket count: ${apiRaffleData.total_tickets} (expected ${TEST_PARAMS.ticketsToPurchase})`
      );
    }
    log.success(`Raffle details verified: ${apiRaffleData.total_tickets} tickets`);
    passedTestCount++;
  } catch (error: any) {
    log.error(`Raffle details check failed: ${error.message}`);
    failedTestCount++;
  }

  // Test: Purchases endpoint
  try {
    const apiPurchases = await apiGet(`/v1/raffles/${createdRaffleId}/purchases`);
    if (!Array.isArray(apiPurchases)) {
      throw new Error("Purchases response is not an array");
    }
    if (apiPurchases.length === 0) {
      throw new Error("No purchases found");
    }

    const totalTicketsPurchased = apiPurchases.reduce(
      (sum: number, purchase: any) => sum + purchase.count,
      0
    );
    if (totalTicketsPurchased !== TEST_PARAMS.ticketsToPurchase) {
      throw new Error(
        `Wrong total tickets: ${totalTicketsPurchased} (expected ${TEST_PARAMS.ticketsToPurchase})`
      );
    }

    log.success(`Purchases verified: ${apiPurchases.length} purchase(s), ${totalTicketsPurchased} tickets`);
    passedTestCount++;
  } catch (error: any) {
    log.error(`Purchases check failed: ${error.message}`);
    failedTestCount++;
  }

  // Test: Raffle appears in list
  try {
    const allRaffles = await apiGet("/v1/raffles");
    const ourRaffle = allRaffles.find((r: any) => r.raffle_id === createdRaffleId);
    if (!ourRaffle) {
      throw new Error("Our raffle not found in list");
    }
    log.success(`Raffle list verified: found raffle ${createdRaffleId} in list of ${allRaffles.length}`);
    passedTestCount++;
  } catch (error: any) {
    log.error(`Raffle list check failed: ${error.message}`);
    failedTestCount++;
  }

  // Test: Health endpoint
  try {
    const healthResponse = await apiGet("/health");
    if (healthResponse.status !== "ok") {
      throw new Error(`Health status not ok: ${healthResponse.status}`);
    }
    log.success("Health endpoint verified");
    passedTestCount++;
  } catch (error: any) {
    log.error(`Health check failed: ${error.message}`);
    failedTestCount++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTS SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  printIntegrationTestResults(testStartTimestamp, createdRaffleId, createdRaffleAddress);
}

/**
 * Print final test results summary.
 */
function printIntegrationTestResults(
  startTimestamp: number,
  raffleId: number,
  raffleAddress: string
): void {
  const testDurationSeconds = ((Date.now() - startTimestamp) / 1000).toFixed(1);

  log.header("TEST RESULTS");

  log.info(`Duration: ${testDurationSeconds}s`);
  log.info(`Tests Passed: ${passedTestCount}`);
  if (failedTestCount > 0) {
    log.error(`Tests Failed: ${failedTestCount}`);
  } else {
    log.info(`Tests Failed: ${failedTestCount}`);
  }

  log.divider();

  log.info("\n📋 TEST DATA CREATED:");
  log.info(`Raffle ID: ${raffleId}`);
  log.info(`Raffle Address: ${raffleAddress}`);
  log.info(`Tickets Purchased: ${TEST_PARAMS.ticketsToPurchase}`);

  log.divider();

  if (failedTestCount === 0) {
    log.success("\n🎉 ALL TESTS PASSED!");
    log.info("\nYou can now test manually:");
    log.info(`  curl ${CONFIG.BACKEND_URL}/v1/raffles`);
    log.info(`  curl ${CONFIG.BACKEND_URL}/v1/raffles/${raffleId}`);
    log.info(`  curl ${CONFIG.BACKEND_URL}/v1/raffles/${raffleId}/purchases`);
  } else {
    log.error(`\n${failedTestCount} TEST(S) FAILED`);
    process.exitCode = 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

runIntegrationTest().catch((error) => {
  log.error(error.message || String(error));
  process.exitCode = 1;
});

/**
 * Check Raffle Status
 *
 * Query and compare raffle status from both blockchain and backend API.
 * Useful for debugging and verifying the indexer is working correctly.
 *
 * @usage pnpm hardhat run scripts/check-raffle.ts --network arc_testnet
 *
 * @environment
 *   - LAST_RAFFLE_ADDRESS: Raffle contract address to check
 *
 * @security This script only reads data; no private key is needed for read-only operations.
 */

import {
  CONFIG,
  log,
  loadRaffle,
  apiGet,
  formatUSDC,
  formatTimestamp,
  shortAddress,
  assertValidAddress,
  RAFFLE_STATUS_NAMES,
} from "./test-helpers.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Raffle address to check (from environment) */
const RAFFLE_ADDRESS = process.env.LAST_RAFFLE_ADDRESS || "";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** On-chain raffle data structure */
interface OnChainRaffleData {
  raffleId: number;
  address: string;
  status: string;
  creator: string;
  endTime: string;
  ticketPrice: string;
  maxTickets: number;
  totalTickets: number;
  pot: string;
  feeBps: number;
  feeRecipient: string;
  randomnessProvider: string;
  requestId?: string;
  randomness?: string;
  winningIndex?: number;
  winner?: string;
}

/** Data comparison result */
interface ComparisonCheck {
  readonly field: string;
  readonly chainValue: string | number;
  readonly apiValue: string | number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function checkRaffleStatus(): Promise<void> {
  log.header("CHECK RAFFLE STATUS");

  // Validate raffle address
  if (!RAFFLE_ADDRESS) {
    log.error("RAFFLE_ADDRESS not set!");
    log.info("Set LAST_RAFFLE_ADDRESS in .env");
    process.exitCode = 1;
    return;
  }

  try {
    assertValidAddress(RAFFLE_ADDRESS, "LAST_RAFFLE_ADDRESS");
  } catch (error: any) {
    log.error(error.message);
    process.exitCode = 1;
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: READ BLOCKCHAIN DATA
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(1, "Reading from blockchain...");

  const raffleContract = await loadRaffle(RAFFLE_ADDRESS);
  const raffleId = await raffleContract.raffleId();
  const currentStatus = Number(await raffleContract.status());

  const onChainData: OnChainRaffleData = {
    raffleId: Number(raffleId),
    address: RAFFLE_ADDRESS,
    status: RAFFLE_STATUS_NAMES[currentStatus] ?? `UNKNOWN(${currentStatus})`,
    creator: await raffleContract.creator(),
    endTime: formatTimestamp(Number(await raffleContract.endTime())),
    ticketPrice: formatUSDC(await raffleContract.ticketPrice()) + " USDC",
    maxTickets: Number(await raffleContract.maxTickets()),
    totalTickets: Number(await raffleContract.totalTickets()),
    pot: formatUSDC(await raffleContract.pot()) + " USDC",
    feeBps: Number(await raffleContract.feeBps()),
    feeRecipient: shortAddress(await raffleContract.feeRecipient()),
    randomnessProvider: shortAddress(await raffleContract.randomnessProvider()),
  };

  // Add randomness data based on lifecycle stage
  if (currentStatus >= 2) {
    // RANDOM_REQUESTED or later
    onChainData.requestId = String(await raffleContract.requestId());
  }
  if (currentStatus >= 3) {
    // RANDOM_FULFILLED or later
    onChainData.randomness = String(await raffleContract.randomness());
    onChainData.winningIndex = Number(await raffleContract.winningIndex());
  }
  if (currentStatus >= 4) {
    // FINALIZED
    onChainData.winner = await raffleContract.winner();
  }

  log.json("📦 On-Chain Data", onChainData);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: READ BACKEND API DATA
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(2, "Reading from backend API...");

  try {
    const apiRaffleData = await apiGet(`/v1/raffles/${raffleId}`);
    log.json("🌐 Backend API Data", apiRaffleData);

    // Step 3: Compare key fields
    log.step(3, "Comparing on-chain vs API data...");

    const comparisonChecks: ComparisonCheck[] = [
      {
        field: "status",
        chainValue: onChainData.status,
        apiValue: apiRaffleData.status,
      },
      {
        field: "totalTickets",
        chainValue: onChainData.totalTickets,
        apiValue: apiRaffleData.total_tickets,
      },
      {
        field: "pot",
        chainValue: onChainData.pot,
        apiValue: formatUSDC(BigInt(apiRaffleData.pot)) + " USDC",
      },
    ];

    let allFieldsMatch = true;
    for (const check of comparisonChecks) {
      const valuesMatch = String(check.chainValue) === String(check.apiValue);
      const statusIcon = valuesMatch ? "✅" : "❌";
      log.info(
        `${statusIcon} ${check.field}: chain="${check.chainValue}", api="${check.apiValue}"`
      );
      if (!valuesMatch) allFieldsMatch = false;
    }

    if (allFieldsMatch) {
      log.success("\nAll data matches between chain and API!");
    } else {
      log.warn("\nSome data differs - indexer may still be catching up");
    }
  } catch (error: any) {
    log.warn(`Backend API error: ${error.message}`);
    log.info("The raffle may not be indexed yet. Wait and try again.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: CHECK PURCHASES
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(4, "Checking purchases...");

  const purchaseRangeCount = await raffleContract.rangesCount();
  log.info(`Purchase ranges on-chain: ${purchaseRangeCount}`);

  try {
    const apiPurchases = await apiGet(`/v1/raffles/${raffleId}/purchases`);
    log.info(`Purchases in API: ${apiPurchases.length}`);

    if (apiPurchases.length > 0) {
      log.info("\nRecent purchases:");
      const displayLimit = 5;
      for (const purchase of apiPurchases.slice(0, displayLimit)) {
        const buyerShort = shortAddress(purchase.buyer);
        const ticketRange = `${purchase.start_index}-${purchase.end_index}`;
        log.info(`  ${buyerShort}: tickets ${ticketRange} (${purchase.count} tickets)`);
      }
      if (apiPurchases.length > displayLimit) {
        log.info(`  ... and ${apiPurchases.length - displayLimit} more`);
      }
    }
  } catch {
    log.warn("Could not fetch purchases from API");
  }

  // Summary
  log.divider();
  log.info("\n📊 SUMMARY");
  log.info(`Raffle ID: ${onChainData.raffleId}`);
  log.info(`Status: ${onChainData.status}`);
  log.info(`Tickets: ${onChainData.totalTickets}/${onChainData.maxTickets}`);
  log.info(`Pot: ${onChainData.pot}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

checkRaffleStatus().catch((error) => {
  log.error(error.message || String(error));
  process.exitCode = 1;
});

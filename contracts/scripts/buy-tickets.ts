/**
 * Buy Tickets
 *
 * Purchase tickets for a specific raffle on Arc L1 Testnet.
 * Handles USDC approval and ticket purchase in a single flow.
 *
 * @usage pnpm hardhat run scripts/buy-tickets.ts --network arc_testnet
 *
 * @environment
 *   - PRIVATE_KEY: Your wallet private key
 *   - LAST_RAFFLE_ADDRESS: Raffle contract address to buy tickets for
 *   - TICKET_COUNT: (optional) Number of tickets to buy (default: 5)
 *
 * @security Never commit private keys. Use .env file or environment variables.
 */

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
  shortAddress,
  assertValidAddress,
  getRaffleStatusName,
  RaffleStatus,
} from "./test-helpers.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Raffle address to buy tickets for (from environment) */
const RAFFLE_ADDRESS = process.env.LAST_RAFFLE_ADDRESS || "";

/** Number of tickets to purchase (from environment or default) */
const TICKETS_TO_BUY = parseInt(process.env.TICKET_COUNT || "5", 10);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function buyTickets(): Promise<void> {
  log.header("BUY TICKETS");

  // Validate raffle address
  if (!RAFFLE_ADDRESS) {
    log.error("RAFFLE_ADDRESS not set!");
    log.info("Set LAST_RAFFLE_ADDRESS in .env or modify this script");
    log.info("Or run: create-test-raffle.ts first to create a raffle");
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

  // Step 1: Load contracts
  log.step(1, "Loading contracts...");
  const { usdc, signer, signerAddress } = await loadContracts();
  const raffleContract = await loadRaffle(RAFFLE_ADDRESS, signer);

  log.info(`Raffle: ${RAFFLE_ADDRESS}`);
  log.info(`Buyer: ${signerAddress}`);
  log.info(`Tickets to Buy: ${TICKETS_TO_BUY}`);

  // Step 2: Check raffle status
  log.step(2, "Checking raffle status...");

  const currentStatus = await raffleContract.status();
  const statusName = getRaffleStatusName(currentStatus);
  log.info(`Status: ${statusName}`);

  if (currentStatus !== RaffleStatus.ACTIVE) {
    log.error("Raffle is not ACTIVE! Cannot buy tickets.");
    process.exitCode = 1;
    return;
  }

  // Get raffle details
  const ticketPricePerTicket = await raffleContract.ticketPrice();
  const totalPurchaseCost = ticketPricePerTicket * BigInt(TICKETS_TO_BUY);
  const maxTicketsAvailable = await raffleContract.maxTickets();
  const ticketsSoldSoFar = await raffleContract.totalTickets();
  const ticketsRemaining = Number(maxTicketsAvailable) - Number(ticketsSoldSoFar);

  log.info(`Ticket Price: ${formatUSDC(ticketPricePerTicket)} USDC`);
  log.info(`Total Cost: ${formatUSDC(totalPurchaseCost)} USDC`);
  log.info(`Tickets Sold: ${ticketsSoldSoFar}/${maxTicketsAvailable} (${ticketsRemaining} remaining)`);

  if (TICKETS_TO_BUY > ticketsRemaining) {
    log.error(`Not enough tickets remaining! Only ${ticketsRemaining} available.`);
    process.exitCode = 1;
    return;
  }

  // Step 3: Check USDC balance
  log.step(3, "Checking USDC balance...");

  const buyerUsdcBalance = await getUSDCBalance(usdc, signerAddress);
  log.info(`Your USDC Balance: ${formatUSDC(buyerUsdcBalance)} USDC`);

  if (buyerUsdcBalance < totalPurchaseCost) {
    log.error(
      `Insufficient USDC! Need ${formatUSDC(totalPurchaseCost)} but have ${formatUSDC(buyerUsdcBalance)}`
    );
    process.exitCode = 1;
    return;
  }

  // Step 4: Approve USDC spending
  log.step(4, "Approving USDC...");
  await approveUSDCIfNeeded(usdc, RAFFLE_ADDRESS, totalPurchaseCost);

  // Step 5: Buy tickets
  log.step(5, "Buying tickets...");

  const purchaseReceipt = await waitForTransaction(
    raffleContract.buyTickets(TICKETS_TO_BUY),
    `buyTickets(${TICKETS_TO_BUY})`
  );

  // Extract purchase details from TicketsBought event
  const ticketsBoughtEvent = extractEvent(purchaseReceipt, raffleContract, "TicketsBought");

  if (!ticketsBoughtEvent) {
    log.error("TicketsBought event not found!");
    process.exitCode = 1;
    return;
  }

  const purchasedStartIndex = ticketsBoughtEvent.args.startIndex;
  const purchasedEndIndex = ticketsBoughtEvent.args.endIndex;
  const amountPaidInUsdc = ticketsBoughtEvent.args.amountPaid;

  // Display results
  log.divider();
  log.success("TICKETS PURCHASED SUCCESSFULLY!");
  log.divider();
  log.info(`Tickets: ${TICKETS_TO_BUY}`);
  log.info(`Ticket Range: ${purchasedStartIndex} - ${purchasedEndIndex}`);
  log.info(`Amount Paid: ${formatUSDC(amountPaidInUsdc)} USDC`);
  log.info(`Transaction: ${purchaseReceipt.hash}`);
  log.divider();

  // Show updated raffle stats
  const updatedTotalTickets = await raffleContract.totalTickets();
  const currentPot = await raffleContract.pot();
  log.info("\nRaffle Stats (Updated):");
  log.info(`Total Tickets Sold: ${updatedTotalTickets}/${maxTicketsAvailable}`);
  log.info(`Pot: ${formatUSDC(currentPot)} USDC`);

  // Next steps instructions
  const raffleId = await raffleContract.raffleId();
  log.info("\n📋 NEXT STEPS:");
  log.info("1. Wait for backend to index the purchase");
  log.info(`2. Check purchases API:`);
  log.info(`   curl ${CONFIG.BACKEND_URL}/v1/raffles/${raffleId}/purchases`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

buyTickets().catch((error) => {
  log.error(error.message || String(error));
  process.exitCode = 1;
});

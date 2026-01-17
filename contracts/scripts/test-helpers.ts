/**
 * Test Helper Utilities
 *
 * Shared utilities for all test scripts.
 * Provides consistent logging, contract loading, and error handling.
 *
 * @module test-helpers
 * @security This module uses environment variables for sensitive configuration.
 *           Never hardcode private keys or commit .env files.
 */

import { network } from "hardhat";
import { config as dotenvConfig } from "dotenv";
import { Contract, Signer, formatUnits, parseUnits, isAddress } from "ethers";

dotenvConfig();

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Ethereum address string (0x-prefixed, 40 hex chars) */
export type Address = `0x${string}`;

/** Configuration object for test scripts */
export interface TestConfig {
  readonly RAFFLE_FACTORY: string;
  USDC: string; // Mutable - may be loaded from factory
  readonly RANDOMNESS_PROVIDER: string;
  readonly BACKEND_URL: string;
  readonly DEFAULT_TICKET_PRICE: bigint;
  readonly DEFAULT_MAX_TICKETS: number;
  readonly DEFAULT_FEE_BPS: number;
  readonly DEFAULT_DURATION_SECONDS: number;
}

/** USDC token decimals (6 for USDC) */
export const USDC_DECIMALS = 6;

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Global configuration loaded from environment variables.
 * @security Never log or expose sensitive values from this config.
 */
export const CONFIG: TestConfig = {
  // Contract addresses (from .env or defaults for Arc testnet)
  RAFFLE_FACTORY:
    process.env.RAFFLE_FACTORY_ADDRESS ||
    "0x8895f9297570B6199BC617885973F5790Fa773A4",
  USDC: process.env.USDC_ADDRESS || "",
  RANDOMNESS_PROVIDER:
    process.env.RANDOMNESS_PROVIDER_ADDRESS ||
    "0x4af4721E1339DAb5C2484045d401C4A4290320C6",

  // Backend API URL
  BACKEND_URL: process.env.BACKEND_URL || "http://localhost:8081",

  // Default raffle parameters
  DEFAULT_TICKET_PRICE: parseUnits("1", USDC_DECIMALS), // 1 USDC
  DEFAULT_MAX_TICKETS: 100,
  DEFAULT_FEE_BPS: 500, // 5% fee
  DEFAULT_DURATION_SECONDS: 3600, // 1 hour
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Consistent logging utilities with emoji prefixes */
export const log = {
  /** Log informational message */
  info: (message: string): void => console.log(`ℹ️  ${message}`),

  /** Log success message */
  success: (message: string): void => console.log(`✅ ${message}`),

  /** Log error message to stderr */
  error: (message: string): void => console.error(`❌ ${message}`),

  /** Log warning message */
  warn: (message: string): void => console.warn(`⚠️  ${message}`),

  /** Log numbered step with description */
  step: (stepNumber: number, description: string): void =>
    console.log(`\n📍 Step ${stepNumber}: ${description}`),

  /** Log section header with decorative border */
  header: (title: string): void => {
    const border = "═".repeat(60);
    console.log(`\n${border}`);
    console.log(`  ${title}`);
    console.log(border);
  },

  /** Log visual divider line */
  divider: (): void => console.log("-".repeat(60)),

  /** Pretty-print JSON object with label */
  json: (label: string, data: object): void => {
    console.log(`\n${label}:`);
    console.log(JSON.stringify(data, null, 2));
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/** Loaded contract instances with signer */
export interface ContractInstances {
  readonly factory: Contract;
  readonly usdc: Contract;
  readonly signer: Signer;
  readonly signerAddress: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADDRESS VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate an Ethereum address format.
 * @param address - Address string to validate
 * @returns True if valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Assert that a value is a valid Ethereum address.
 * @param address - Address to validate
 * @param label - Description for error messages
 * @throws Error if address is invalid
 */
export function assertValidAddress(address: string, label: string): void {
  if (!address) {
    throw new Error(`${label} is not set`);
  }
  if (!isValidAddress(address)) {
    throw new Error(`${label} is not a valid Ethereum address: ${address}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT LOADING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load all required contracts and return instances.
 * @returns Contract instances with signer
 * @throws Error if contracts cannot be loaded
 */
export async function loadContracts(): Promise<ContractInstances> {
  const { ethers } = await network.connect();
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  assertValidAddress(CONFIG.RAFFLE_FACTORY, "RAFFLE_FACTORY_ADDRESS");

  // Load RaffleFactory
  const factory = await ethers.getContractAt(
    "RaffleFactory",
    CONFIG.RAFFLE_FACTORY,
    signer
  );

  // Load USDC - fetch from factory if not configured
  if (!CONFIG.USDC) {
    const usdcAddressFromFactory = await factory.usdc();
    CONFIG.USDC = usdcAddressFromFactory;
    log.info(`USDC address loaded from factory: ${shortAddress(CONFIG.USDC)}`);
  }

  assertValidAddress(CONFIG.USDC, "USDC_ADDRESS");
  const usdc = await ethers.getContractAt("IERC20Minimal", CONFIG.USDC, signer);

  return { factory, usdc, signer, signerAddress };
}

/**
 * Load a specific Raffle contract by address.
 * @param raffleAddress - Ethereum address of the Raffle contract
 * @param signer - Optional signer (uses default if not provided)
 * @returns Raffle contract instance
 * @throws Error if address is invalid
 */
export async function loadRaffle(
  raffleAddress: string,
  signer?: Signer
): Promise<Contract> {
  assertValidAddress(raffleAddress, "Raffle address");

  const { ethers } = await network.connect();

  if (!signer) {
    const [defaultSigner] = await ethers.getSigners();
    signer = defaultSigner;
  }

  return ethers.getContractAt("Raffle", raffleAddress, signer);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Transaction receipt with parsed logs */
export interface TransactionResult {
  readonly hash: string;
  readonly blockNumber: number;
  readonly logs: readonly any[];
}

/**
 * Wait for a transaction to be confirmed and return the receipt.
 * @param txPromise - Promise that resolves to a transaction
 * @param description - Human-readable description for logging
 * @returns Transaction receipt with parsed logs
 */
export async function waitForTransaction(
  txPromise: Promise<any>,
  description: string
): Promise<TransactionResult> {
  log.info(`Sending: ${description}...`);
  const transaction = await txPromise;
  log.info(`Transaction hash: ${transaction.hash}`);
  const receipt = await transaction.wait();
  log.success(`Confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

// Backwards compatibility alias
export const waitForTx = waitForTransaction;

/**
 * Extract a specific event from transaction receipt logs.
 * @param receipt - Transaction receipt with logs
 * @param contract - Contract instance for ABI parsing
 * @param eventName - Name of the event to find
 * @returns Parsed event or null if not found
 */
export function extractEvent(
  receipt: TransactionResult,
  contract: Contract,
  eventName: string
): any | null {
  for (const logEntry of receipt.logs) {
    try {
      const parsedLog = contract.interface.parseLog(logEntry);
      if (parsedLog?.name === eventName) {
        return parsedLog;
      }
    } catch {
      // Log is from a different contract - skip
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USDC TOKEN UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format USDC amount from smallest units to human-readable string.
 * @param amountInSmallestUnits - Amount in smallest units (6 decimals)
 * @returns Formatted string (e.g., "1.00")
 */
export function formatUSDC(amountInSmallestUnits: bigint): string {
  return formatUnits(amountInSmallestUnits, USDC_DECIMALS);
}

/**
 * Parse human-readable USDC amount to smallest units.
 * @param humanReadableAmount - Amount as string (e.g., "1.5")
 * @returns Amount in smallest units as bigint
 */
export function parseUSDC(humanReadableAmount: string): bigint {
  return parseUnits(humanReadableAmount, USDC_DECIMALS);
}

/**
 * Get USDC balance for an address.
 * @param usdcContract - USDC contract instance
 * @param ownerAddress - Address to check balance for
 * @returns Balance in smallest units
 */
export async function getUSDCBalance(
  usdcContract: Contract,
  ownerAddress: string
): Promise<bigint> {
  return usdcContract.balanceOf(ownerAddress);
}

/**
 * Approve USDC spending if current allowance is insufficient.
 * @param usdcContract - USDC contract instance
 * @param spenderAddress - Address to approve spending for
 * @param requiredAmount - Minimum required allowance
 */
export async function approveUSDCIfNeeded(
  usdcContract: Contract,
  spenderAddress: string,
  requiredAmount: bigint
): Promise<void> {
  // Get owner address from contract runner (signer)
  const runner = usdcContract.runner as any;
  const ownerAddress = runner?.address || (await runner?.getAddress?.());
  const currentAllowance = await usdcContract.allowance(ownerAddress, spenderAddress);

  if (currentAllowance >= requiredAmount) {
    log.info(
      `USDC allowance sufficient (${formatUSDC(currentAllowance)} >= ${formatUSDC(requiredAmount)})`
    );
    return;
  }

  const spenderShort = shortAddress(spenderAddress);
  await waitForTransaction(
    usdcContract.approve(spenderAddress, requiredAmount),
    `Approving ${formatUSDC(requiredAmount)} USDC for ${spenderShort}`
  );
}

// Backwards compatibility alias
export const approveUSDC = approveUSDCIfNeeded;

// ═══════════════════════════════════════════════════════════════════════════════
// BACKEND API UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Default API request timeout in milliseconds */
const API_TIMEOUT_MS = 10000;

/**
 * Make a GET request to the backend API.
 * @param endpoint - API endpoint path (e.g., "/v1/raffles")
 * @returns Parsed JSON response
 * @throws Error on network failure or non-OK response
 */
export async function apiGet<T = any>(endpoint: string): Promise<T> {
  const url = `${CONFIG.BACKEND_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Default polling configuration for waitForRaffleIndexed */
const INDEXER_POLL_INTERVAL_MS = 2000;
const INDEXER_DEFAULT_TIMEOUT_MS = 30000;

/**
 * Wait for a raffle to appear in the backend API.
 * Useful after creating a raffle on-chain.
 *
 * @param raffleId - Raffle ID to wait for
 * @param maxWaitMs - Maximum time to wait (default: 30 seconds)
 * @returns Raffle data from API
 * @throws Error if raffle not indexed within timeout
 */
export async function waitForRaffleIndexed(
  raffleId: number,
  maxWaitMs: number = INDEXER_DEFAULT_TIMEOUT_MS
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const raffle = await apiGet(`/v1/raffles/${raffleId}`);
      if (raffle && raffle.raffle_id === raffleId) {
        return raffle;
      }
    } catch {
      // Raffle not indexed yet - continue polling
    }
    await sleep(INDEXER_POLL_INTERVAL_MS);
  }

  throw new Error(`Raffle ${raffleId} not indexed after ${maxWaitMs}ms`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pause execution for a specified duration.
 * @param milliseconds - Duration to sleep in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Get current Unix timestamp in seconds.
 * @returns Current time as Unix timestamp (seconds since epoch)
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// Backwards compatibility alias
export const now = getCurrentTimestamp;

/**
 * Format Unix timestamp to ISO 8601 string.
 * @param unixTimestamp - Unix timestamp in seconds
 * @returns ISO formatted date string
 */
export function formatTimestamp(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toISOString();
}

// Backwards compatibility alias
export const formatTime = formatTimestamp;

/**
 * Shorten an Ethereum address for display.
 * @param address - Full Ethereum address
 * @returns Shortened address (e.g., "0x1234...abcd")
 */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAFFLE STATUS CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Raffle lifecycle status values */
export const RaffleStatus = {
  ACTIVE: 0n,
  CLOSED: 1n,
  RANDOM_REQUESTED: 2n,
  RANDOM_FULFILLED: 3n,
  FINALIZED: 4n,
} as const;

/** Human-readable status names indexed by status value */
export const RAFFLE_STATUS_NAMES = [
  "ACTIVE",
  "CLOSED",
  "RANDOM_REQUESTED",
  "RANDOM_FULFILLED",
  "FINALIZED",
] as const;

/**
 * Get human-readable status name from numeric value.
 * @param statusValue - Numeric status from contract
 * @returns Human-readable status name
 */
export function getRaffleStatusName(statusValue: bigint | number): string {
  const index = Number(statusValue);
  return RAFFLE_STATUS_NAMES[index] ?? `UNKNOWN(${index})`;
}

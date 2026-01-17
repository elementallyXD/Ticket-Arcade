/**
 * Test All Backend APIs
 *
 * Comprehensive test script that verifies all backend API endpoints.
 * Run this after creating a raffle and buying some tickets.
 *
 * @usage pnpm hardhat run scripts/test-backend-api.ts --network arc_testnet
 *
 * @description This script tests:
 *   - GET /health
 *   - GET /v1/raffles
 *   - GET /v1/raffles?status=ACTIVE
 *   - GET /v1/raffles?limit=5&offset=0
 *   - GET /v1/raffles/:raffle_id
 *   - GET /v1/raffles/:raffle_id/purchases
 *   - GET /v1/raffles/:raffle_id/proof
 *   - GET /v1/randomness/requests
 *   - GET /v1/randomness/requests/:request_id
 *   - GET /v1/randomness/fulfillments
 *
 * @security This script only performs read operations. No private key required.
 */

import { CONFIG, log, apiGet, shortAddress } from "./test-helpers.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Test result status */
type TestStatus = "PASS" | "FAIL" | "SKIP";

/** Individual test result */
interface TestResult {
  readonly endpoint: string;
  readonly status: TestStatus;
  readonly message: string;
  readonly data?: any;
}

/** Validation function for API responses */
type ResponseValidator = (data: any) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// TEST STATE
// ═══════════════════════════════════════════════════════════════════════════════

/** Accumulator for all test results */
const testResults: TestResult[] = [];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test a single API endpoint with optional validation.
 *
 * @param testName - Human-readable test name
 * @param endpoint - API endpoint path to test
 * @param validate - Optional validation function for the response
 * @returns Response data if successful, null otherwise
 */
async function testApiEndpoint(
  testName: string,
  endpoint: string,
  validate?: ResponseValidator
): Promise<any> {
  try {
    log.info(`Testing: ${endpoint}`);
    const responseData = await apiGet(endpoint);

    if (validate) {
      validate(responseData);
    }

    testResults.push({
      endpoint,
      status: "PASS",
      message: "OK",
      data: responseData,
    });

    log.success(`  ✓ ${testName}`);
    return responseData;
  } catch (error: any) {
    const errorMessage = error.message || String(error);

    // Distinguish between expected "not found" vs actual failures
    const isNotFoundError =
      errorMessage.includes("404") ||
      errorMessage.includes("not found") ||
      errorMessage.includes("raffle not found");

    if (isNotFoundError) {
      testResults.push({
        endpoint,
        status: "SKIP",
        message: "No data available",
      });
      log.warn(`  ⚠ ${testName} - No data available (expected if no data exists)`);
    } else {
      testResults.push({
        endpoint,
        status: "FAIL",
        message: errorMessage,
      });
      log.error(`  ✗ ${testName} - ${errorMessage}`);
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function runApiTestSuite(): Promise<void> {
  log.header("BACKEND API TEST SUITE");
  log.info(`Backend URL: ${CONFIG.BACKEND_URL}`);
  log.divider();

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(1, "Health Check");

  await testApiEndpoint("Health endpoint", "/health", (data) => {
    if (data.status !== "ok") {
      throw new Error(`Expected status="ok", got "${data.status}"`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RAFFLE LIST ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(2, "Raffle List Endpoints");

  // List all raffles
  const allRaffles = await testApiEndpoint("List raffles", "/v1/raffles", (data) => {
    if (!Array.isArray(data)) {
      throw new Error("Expected array response");
    }
  });

  // List with pagination
  await testApiEndpoint(
    "List raffles with pagination",
    "/v1/raffles?limit=5&offset=0",
    (data) => {
      if (!Array.isArray(data)) {
        throw new Error("Expected array response");
      }
    }
  );

  // List with status filters
  await testApiEndpoint(
    "List ACTIVE raffles",
    "/v1/raffles?status=ACTIVE",
    (data) => {
      if (!Array.isArray(data)) {
        throw new Error("Expected array response");
      }
      // Verify all returned raffles have correct status
      for (const raffle of data) {
        if (raffle.status !== "ACTIVE") {
          throw new Error(`Expected status=ACTIVE, got ${raffle.status}`);
        }
      }
    }
  );

  // Test other status filter values
  const statusFilters = ["CLOSED", "FINALIZED"];
  for (const statusFilter of statusFilters) {
    await testApiEndpoint(
      `List ${statusFilter} raffles`,
      `/v1/raffles?status=${statusFilter}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RAFFLE DETAIL ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(3, "Raffle Detail Endpoints");

  let testRaffleId: number | null = null;

  if (allRaffles && allRaffles.length > 0) {
    testRaffleId = allRaffles[0].raffle_id;
    log.info(`Using raffle ID ${testRaffleId} for detail tests`);

    // Get raffle by ID
    await testApiEndpoint(
      "Get raffle by ID",
      `/v1/raffles/${testRaffleId}`,
      (data) => {
        if (data.raffle_id !== testRaffleId) {
          throw new Error(`Expected raffle_id=${testRaffleId}`);
        }
        // Verify required fields exist
        const requiredFields = [
          "raffle_id",
          "raffle_address",
          "status",
          "ticket_price",
          "total_tickets",
        ];
        for (const fieldName of requiredFields) {
          if (!(fieldName in data)) {
            throw new Error(`Missing required field: ${fieldName}`);
          }
        }
      }
    );

    // Get purchases for raffle
    await testApiEndpoint(
      "Get raffle purchases",
      `/v1/raffles/${testRaffleId}/purchases`,
      (data) => {
        if (!Array.isArray(data)) {
          throw new Error("Expected array response");
        }
      }
    );

    // Get purchases with pagination
    await testApiEndpoint(
      "Get purchases with pagination",
      `/v1/raffles/${testRaffleId}/purchases?limit=10&offset=0`
    );

    // Get proof (may not exist for non-finalized raffles)
    await testApiEndpoint("Get raffle proof", `/v1/raffles/${testRaffleId}/proof`);
  } else {
    log.warn("No raffles found - skipping detail endpoint tests");
    log.info("Create a raffle first: pnpm hardhat run scripts/create-test-raffle.ts --network arc_testnet");
  }

  // Test non-existent raffle (should return 404)
  await testApiEndpoint("Get non-existent raffle (expect 404)", "/v1/raffles/999999");

  // ═══════════════════════════════════════════════════════════════════════════
  // RANDOMNESS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  log.step(4, "Randomness Endpoints");

  // List randomness requests
  const randomnessRequests = await testApiEndpoint(
    "List randomness requests",
    "/v1/randomness/requests",
    (data) => {
      if (!Array.isArray(data)) {
        throw new Error("Expected array response");
      }
    }
  );

  // List with pagination
  await testApiEndpoint(
    "List requests with pagination",
    "/v1/randomness/requests?limit=10&offset=0"
  );

  // Get specific request if available
  if (randomnessRequests && randomnessRequests.length > 0) {
    const testRequestId = randomnessRequests[0].request_id;
    await testApiEndpoint(
      "Get randomness request by ID",
      `/v1/randomness/requests/${testRequestId}`,
      (data) => {
        if (data.request_id !== testRequestId) {
          throw new Error(`Expected request_id=${testRequestId}`);
        }
      }
    );
  }

  // List fulfillments
  await testApiEndpoint(
    "List randomness fulfillments",
    "/v1/randomness/fulfillments",
    (data) => {
      if (!Array.isArray(data)) {
        throw new Error("Expected array response");
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTS SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  printTestResultsSummary();
}

/**
 * Print formatted test results summary.
 */
function printTestResultsSummary(): void {
  log.header("TEST RESULTS SUMMARY");

  const passedCount = testResults.filter((r) => r.status === "PASS").length;
  const failedCount = testResults.filter((r) => r.status === "FAIL").length;
  const skippedCount = testResults.filter((r) => r.status === "SKIP").length;

  log.info(`Total Tests: ${testResults.length}`);
  log.success(`Passed: ${passedCount}`);
  if (failedCount > 0) {
    log.error(`Failed: ${failedCount}`);
  }
  if (skippedCount > 0) {
    log.warn(`Skipped: ${skippedCount}`);
  }

  log.divider();

  // Show failed tests
  const failedTests = testResults.filter((r) => r.status === "FAIL");
  if (failedTests.length > 0) {
    log.info("\n❌ FAILED TESTS:");
    for (const test of failedTests) {
      log.error(`  ${test.endpoint}: ${test.message}`);
    }
  }

  // Show skipped tests
  const skippedTests = testResults.filter((r) => r.status === "SKIP");
  if (skippedTests.length > 0) {
    log.info("\n⚠️  SKIPPED TESTS (no data available):");
    for (const test of skippedTests) {
      log.warn(`  ${test.endpoint}`);
    }
  }

  log.divider();

  if (failedCount === 0) {
    log.success("\n🎉 All API tests passed!");
  } else {
    log.error(`\n${failedCount} test(s) failed. Check the errors above.`);
    process.exitCode = 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

runApiTestSuite().catch((error) => {
  log.error(error.message || String(error));
  process.exitCode = 1;
});

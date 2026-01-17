# Ticket Arcade Contracts

Solidity smart contracts for the Ticket Arcade raffle system on Arc L1. Each raffle is deployed as its own contract with provably fair winner selection powered by Drand randomness.

## Features

- Per-raffle contract isolation
- Verifiable randomness via Drand provider
- Automatic refund path if randomness fails
- Configurable fees with global caps
- Delayed randomness provider updates for security

## Prerequisites

- Node.js 18+
- pnpm

## Installation

```bash
cd contracts
pnpm install
```

## Compile

```bash
pnpm hardhat compile
```

## Run Tests

```bash
pnpm hardhat test
```

## Deploy MockUSDC (For Testing)

If you need test USDC tokens, deploy your own MockUSDC contract:

```bash
pnpm hardhat run scripts/deploy-mock-usdc.ts --network arc_testnet
```

This will:
- Deploy a MockUSDC token contract
- Mint 1,000,000 USDC to your wallet
- Output the address to add to your `.env`

> ⚠️ **Warning:** MockUSDC is for testing only. Anyone can mint tokens.

## Deploy to Arc Testnet

```bash
pnpm deploy:arc
```

### Environment Variables

Create `contracts/.env` before deploying:

```bash
# Required
ARC_RPC_URL=https://rpc.testnet.arc.network
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
USDC_ADDRESS=0xYOUR_USDC_TOKEN_ADDRESS

# Optional
ORACLE_ADDRESS=0xYOUR_ORACLE_ADDRESS  # Defaults to deployer
MAX_FEE_BPS=500                       # Default: 500 (5%), max: 2000 (20%)
```

> ⚠️ **Security:** Never commit private keys to version control. Use environment variables or a secrets manager for production deployments.

## Network Configuration

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Arc Testnet | `5042002` | `https://rpc.testnet.arc.network` |

## Project Structure

```
contracts/
├── contracts/           # Solidity source files
│   ├── Raffle.sol
│   ├── RaffleFactory.sol
│   ├── DrandRandomnessProvider.sol
│   └── ...
├── test/                # TypeScript unit tests
├── scripts/             # Deployment and test scripts
│   ├── deploy.ts            # Deploy RaffleFactory
│   ├── deploy-mock-usdc.ts  # Deploy MockUSDC for testing
│   ├── test-helpers.ts      # Shared utilities
│   ├── create-test-raffle.ts
│   ├── buy-tickets.ts
│   ├── check-raffle.ts
│   ├── test-backend-api.ts
│   └── full-integration-test.ts
├── artifacts/           # Compiled artifacts (generated)
└── docs/                # Contract documentation
```

## Test Scripts

After deploying contracts, use these scripts to test the integration with the backend:

### Quick Start

```bash
# Run all integration tests (creates raffle, buys tickets, verifies API)
pnpm test:integration
```

### Individual Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Deploy MockUSDC | `pnpm hardhat run scripts/deploy-mock-usdc.ts --network arc_testnet` | Deploy test USDC token |
| Create Raffle | `pnpm test:create-raffle` | Creates a new raffle on testnet |
| Buy Tickets | `pnpm test:buy-tickets` | Purchases tickets for a raffle |
| Check Raffle | `pnpm test:check-raffle` | Compares on-chain vs API data |
| Test APIs | `pnpm test:api` | Tests all backend API endpoints |
| Full Test | `pnpm test:integration` | End-to-end integration test |

### Environment for Test Scripts

Add these to your `.env` for test scripts:

```bash
# Required
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
RAFFLE_FACTORY_ADDRESS=0x8895f9297570B6199BC617885973F5790Fa773A4
USDC_ADDRESS=0xYOUR_USDC_ADDRESS

# Optional (for buy-tickets and check-raffle)
LAST_RAFFLE_ADDRESS=0xRAFFLE_ADDRESS_FROM_CREATE_SCRIPT
TICKET_COUNT=5

# Backend URL (defaults to localhost:8081)
BACKEND_URL=http://localhost:8081
```

## Documentation

- [Contracts Overview](docs/CONTRACTS_OVERVIEW.md) — Detailed contract architecture
- [Security Model](docs/SECURITY_MODEL.md) — Security assumptions and protections

## Security Considerations

- **Randomness Trust:** The oracle delivering Drand randomness must be trusted. On-chain proof verification is not yet implemented.
- **Access Control:** Only the factory admin can update the randomness provider (with a time delay).
- **Token Assumptions:** The USDC token must be a well-behaved ERC20 that returns `true` on transfers.
- **No Upgradeability:** Raffle contracts are immutable once deployed.

## Tooling

- Hardhat v3
- ethers v6
- TypeScript + Mocha tests
- Solidity ^0.8.24

## License

MIT

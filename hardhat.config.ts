import { configVariable, type HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

/**
 * Finite Intent Executor - Hardhat 3 Configuration
 *
 * Environment Variables Required for Deployment:
 * - PRIVATE_KEY: Deployer wallet private key
 * - ETHERSCAN_API_KEY: For contract verification (Etherscan API v2 — single key for all chains)
 * - MAINNET_RPC_URL: Ethereum mainnet RPC endpoint
 * - SEPOLIA_RPC_URL: Sepolia testnet RPC endpoint
 *
 * Secrets are loaded lazily via configVariable() and only resolved when needed.
 * Store them with: npx hardhat keystore set VARIABLE_NAME
 * Or set them as environment variables.
 *
 * @see .env.example for all configuration options
 */

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthers],

  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },

  networks: {
    // Ethereum Testnets
    sepolia: {
      type: "http",
      url: configVariable("SEPOLIA_RPC_URL"),
      chainId: 11155111,
      accounts: [configVariable("PRIVATE_KEY")],
      timeout: 60_000,
    },

    // Ethereum Mainnet
    mainnet: {
      type: "http",
      url: configVariable("MAINNET_RPC_URL"),
      chainId: 1,
      accounts: [configVariable("PRIVATE_KEY")],
      timeout: 120_000,
    },

    // Base (L2)
    base: {
      type: "http",
      url: configVariable("BASE_RPC_URL"),
      chainId: 8453,
      accounts: [configVariable("PRIVATE_KEY")],
    },
    baseSepolia: {
      type: "http",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      chainId: 84532,
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },

  // Etherscan verification (API v2 — single key works across all chains)
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },

  // Mocha test configuration
  mocha: {
    timeout: 120_000,
  },
};

export default config;

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * Finite Intent Executor - Hardhat Configuration
 *
 * Environment Variables Required for Deployment:
 * - PRIVATE_KEY: Deployer wallet private key
 * - ETHERSCAN_API_KEY: For contract verification
 * - MAINNET_RPC_URL: Ethereum mainnet RPC endpoint
 * - SEPOLIA_RPC_URL: Sepolia testnet RPC endpoint
 * - GOERLI_RPC_URL: Goerli testnet RPC endpoint (deprecated)
 *
 * @see .env.example for all configuration options
 */

// Validate critical environment variables for non-local deployments
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// RPC endpoints with fallbacks
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/your-api-key";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/your-api-key";
const GOERLI_RPC_URL = process.env.GOERLI_RPC_URL || "https://eth-goerli.g.alchemy.com/v2/your-api-key";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true, // Enable IR-based code generation for complex contracts
      // SMTChecker for formal verification (disabled by default for faster builds)
      ...(process.env.ENABLE_SMT_CHECKER === "true" && {
        modelChecker: {
          contracts: {
            "contracts/ExecutionAgent.sol": ["ExecutionAgent"],
            "contracts/SunsetProtocol.sol": ["SunsetProtocol"],
            "contracts/IntentCaptureModule.sol": ["IntentCaptureModule"],
            "contracts/LexiconHolder.sol": ["LexiconHolder"]
          },
          engine: "chc",
          targets: [
            "assert",
            "underflow",
            "overflow",
            "divByZero",
            "constantCondition",
            "popEmptyArray",
            "outOfBounds"
          ],
          timeout: 20000
        }
      })
    }
  },

  networks: {
    // Local development
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true,
      gas: 30000000,
      blockGasLimit: 30000000
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },

    // Ethereum Testnets
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto",
      timeout: 60000
    },
    goerli: {
      url: GOERLI_RPC_URL,
      chainId: 5,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto",
      timeout: 60000
    },

    // Ethereum Mainnet
    mainnet: {
      url: MAINNET_RPC_URL,
      chainId: 1,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto",
      timeout: 120000,
      // Mainnet safety settings
      confirmations: 2
    },

    // Base (L2)
    base: {
      url: BASE_RPC_URL,
      chainId: 8453,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto"
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto"
    }
  },

  // Etherscan verification
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      base: process.env.BASESCAN_API_KEY || ETHERSCAN_API_KEY,
      baseSepolia: process.env.BASESCAN_API_KEY || ETHERSCAN_API_KEY
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },

  // Gas reporting
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    outputFile: process.env.GAS_REPORT_FILE || "gas-report.txt",
    noColors: true,
    excludeContracts: ["mocks/", "test/"]
  },

  // Contract sizing
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: process.env.REPORT_SIZE === "true",
    strict: true
  },

  // Path configuration
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },

  // Mocha test configuration
  mocha: {
    timeout: 120000, // 2 minutes for complex integration tests
    reporter: process.env.CI ? "mocha-junit-reporter" : "spec",
    reporterOptions: {
      mochaFile: "./test-results/results.xml"
    }
  }
};

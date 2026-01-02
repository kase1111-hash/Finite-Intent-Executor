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
// WARNING: Never use default/test keys for real deployments
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// Validate private key for non-local networks
function getPrivateKey() {
  if (!PRIVATE_KEY) {
    // Only allow missing key for local networks
    console.warn("⚠️  WARNING: PRIVATE_KEY not set. Only local networks available.");
    return "0x0000000000000000000000000000000000000000000000000000000000000001"; // Dummy for hardhat
  }
  // Reject obviously invalid keys
  if (PRIVATE_KEY.match(/^0x0{60,}[0-9a-f]{1,4}$/i)) {
    throw new Error("CRITICAL: Invalid PRIVATE_KEY detected. Do not use test/zero keys for deployment.");
  }
  return PRIVATE_KEY;
}

// RPC endpoints - require explicit configuration for production networks
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const GOERLI_RPC_URL = process.env.GOERLI_RPC_URL;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

// Validate RPC URL before use
function requireRpcUrl(url, network) {
  if (!url || url.includes("your-api-key")) {
    throw new Error(`${network}_RPC_URL not configured. Set it in .env file.`);
  }
  return url;
}

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
      url: SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: PRIVATE_KEY ? [getPrivateKey()] : [],
      gasPrice: "auto",
      gas: "auto",
      timeout: 60000
    },
    goerli: {
      url: GOERLI_RPC_URL || "https://rpc.goerli.org",
      chainId: 5,
      accounts: PRIVATE_KEY ? [getPrivateKey()] : [],
      gasPrice: "auto",
      gas: "auto",
      timeout: 60000
    },

    // Ethereum Mainnet - Requires explicit configuration
    mainnet: {
      url: MAINNET_RPC_URL || "",
      chainId: 1,
      accounts: PRIVATE_KEY ? [getPrivateKey()] : [],
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
      accounts: PRIVATE_KEY ? [getPrivateKey()] : [],
      gasPrice: "auto",
      gas: "auto"
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: PRIVATE_KEY ? [getPrivateKey()] : [],
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

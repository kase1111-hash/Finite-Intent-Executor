require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      // SMTChecker for formal verification
      modelChecker: {
        contracts: {
          "contracts/ExecutionAgent.sol": ["ExecutionAgent"],
          "contracts/SunsetProtocol.sol": ["SunsetProtocol"],
          "contracts/IntentCaptureModule.sol": ["IntentCaptureModule"],
          "contracts/LexiconHolder.sol": ["LexiconHolder"]
        },
        engine: "chc",  // Constrained Horn Clauses engine
        targets: [
          "assert",
          "underflow",
          "overflow",
          "divByZero",
          "constantCondition",
          "popEmptyArray",
          "outOfBounds"
        ],
        timeout: 20000  // 20 seconds per query
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

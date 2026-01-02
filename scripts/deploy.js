const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Finite Intent Executor - Production Deployment Script
 *
 * Deploys all FIE contracts with proper configuration and verification.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network <network>
 *
 * Networks: hardhat, localhost, sepolia, goerli, mainnet, base, baseSepolia
 *
 * Environment Variables:
 *   PRIVATE_KEY - Deployer wallet private key
 *   ETHERSCAN_API_KEY - For contract verification
 *   VERIFY_CONTRACTS - Set to "true" to verify on Etherscan
 */

// Deployment configuration
const CONFIG = {
  // Sunset duration in seconds (20 years)
  SUNSET_DURATION: 20 * 365 * 24 * 60 * 60,

  // Confidence threshold (95%)
  CONFIDENCE_THRESHOLD: 95,

  // Default deadman switch interval (30 days)
  DEADMAN_INTERVAL: 30 * 24 * 60 * 60,

  // Networks that support verification
  VERIFIABLE_NETWORKS: ['mainnet', 'sepolia', 'goerli', 'base', 'baseSepolia'],

  // Confirmation counts by network
  CONFIRMATIONS: {
    hardhat: 1,
    localhost: 1,
    sepolia: 2,
    goerli: 2,
    mainnet: 3,
    base: 2,
    baseSepolia: 2
  }
};

/**
 * Wait for transaction confirmations
 */
async function waitForConfirmations(tx, network) {
  const confirmations = CONFIG.CONFIRMATIONS[network] || 1;
  console.log(`  Waiting for ${confirmations} confirmation(s)...`);
  await tx.wait(confirmations);
}

/**
 * Verify contract on Etherscan/Basescan
 */
async function verifyContract(address, constructorArgs, network) {
  if (!CONFIG.VERIFIABLE_NETWORKS.includes(network)) {
    console.log(`  Skipping verification on ${network}`);
    return;
  }

  if (process.env.VERIFY_CONTRACTS !== 'true') {
    console.log(`  Set VERIFY_CONTRACTS=true to enable verification`);
    return;
  }

  console.log(`  Verifying contract at ${address}...`);
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
    });
    console.log(`  ✓ Contract verified`);
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(`  ✓ Contract already verified`);
    } else {
      console.log(`  ✗ Verification failed: ${error.message}`);
    }
  }
}

/**
 * Deploy a contract with retry logic
 */
async function deployContract(name, factory, args = [], network) {
  console.log(`\nDeploying ${name}...`);

  let contract;
  let retries = 3;

  while (retries > 0) {
    try {
      contract = await factory.deploy(...args);
      const deployTx = contract.deploymentTransaction();
      console.log(`  Transaction hash: ${deployTx.hash}`);

      await waitForConfirmations(deployTx, network);

      const address = await contract.getAddress();
      console.log(`  ✓ ${name} deployed to: ${address}`);

      return { contract, address };
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.log(`  Retry ${3 - retries}/3: ${error.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

/**
 * Main deployment function
 */
async function main() {
  const network = hre.network.name;
  console.log("=".repeat(70));
  console.log("Finite Intent Executor (FIE) - Deployment");
  console.log("=".repeat(70));
  console.log(`Network: ${network}`);
  console.log(`Chain ID: ${hre.network.config.chainId || 'N/A'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Safety check for mainnet
  if (network === 'mainnet') {
    console.log("\n⚠️  WARNING: Deploying to MAINNET!");
    console.log("    Press Ctrl+C within 10 seconds to abort...");
    await new Promise(r => setTimeout(r, 10000));
  }

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`\nDeployer: ${deployer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);

  // Check minimum balance
  const minBalance = hre.ethers.parseEther("0.1");
  if (balance < minBalance && network !== 'hardhat' && network !== 'localhost') {
    throw new Error(`Insufficient balance. Need at least 0.1 ETH for deployment.`);
  }

  const deployedContracts = {};

  // 1. Deploy LexiconHolder (no dependencies)
  const LexiconHolder = await hre.ethers.getContractFactory("LexiconHolder");
  const { contract: lexiconHolder, address: lexiconHolderAddress } =
    await deployContract("LexiconHolder", LexiconHolder, [], network);
  deployedContracts.LexiconHolder = lexiconHolderAddress;

  // 2. Deploy IntentCaptureModule
  const IntentCaptureModule = await hre.ethers.getContractFactory("IntentCaptureModule");
  const { contract: intentModule, address: intentModuleAddress } =
    await deployContract("IntentCaptureModule", IntentCaptureModule, [], network);
  deployedContracts.IntentCaptureModule = intentModuleAddress;

  // 3. Deploy TriggerMechanism
  const TriggerMechanism = await hre.ethers.getContractFactory("TriggerMechanism");
  const { contract: triggerMechanism, address: triggerMechanismAddress } =
    await deployContract("TriggerMechanism", TriggerMechanism, [intentModuleAddress], network);
  deployedContracts.TriggerMechanism = triggerMechanismAddress;

  // 4. Configure IntentCaptureModule permissions
  console.log("\nConfiguring IntentCaptureModule permissions...");
  const setTriggerTx = await intentModule.setTriggerMechanism(triggerMechanismAddress);
  await waitForConfirmations(setTriggerTx, network);
  console.log("  ✓ TriggerMechanism authorized");

  // 5. Deploy ExecutionAgent
  const ExecutionAgent = await hre.ethers.getContractFactory("ExecutionAgent");
  const { contract: executionAgent, address: executionAgentAddress } =
    await deployContract("ExecutionAgent", ExecutionAgent, [lexiconHolderAddress], network);
  deployedContracts.ExecutionAgent = executionAgentAddress;

  // 6. Deploy SunsetProtocol
  const SunsetProtocol = await hre.ethers.getContractFactory("SunsetProtocol");
  const { contract: sunsetProtocol, address: sunsetProtocolAddress } =
    await deployContract("SunsetProtocol", SunsetProtocol, [executionAgentAddress, lexiconHolderAddress], network);
  deployedContracts.SunsetProtocol = sunsetProtocolAddress;

  // 7. Deploy IPToken
  const IPToken = await hre.ethers.getContractFactory("IPToken");
  const { contract: ipToken, address: ipTokenAddress } =
    await deployContract("IPToken", IPToken, [], network);
  deployedContracts.IPToken = ipTokenAddress;

  // 8. Configure cross-contract permissions
  console.log("\nConfiguring cross-contract permissions...");

  // Set ExecutionAgent in TriggerMechanism
  if (typeof triggerMechanism.setExecutionAgent === 'function') {
    const setExecTx = await triggerMechanism.setExecutionAgent(executionAgentAddress);
    await waitForConfirmations(setExecTx, network);
    console.log("  ✓ ExecutionAgent linked to TriggerMechanism");
  }

  // Set SunsetProtocol in ExecutionAgent
  if (typeof executionAgent.setSunsetProtocol === 'function') {
    const setSunsetTx = await executionAgent.setSunsetProtocol(sunsetProtocolAddress);
    await waitForConfirmations(setSunsetTx, network);
    console.log("  ✓ SunsetProtocol linked to ExecutionAgent");
  }

  // Set IPToken in ExecutionAgent
  if (typeof executionAgent.setIPToken === 'function') {
    const setIPTx = await executionAgent.setIPToken(ipTokenAddress);
    await waitForConfirmations(setIPTx, network);
    console.log("  ✓ IPToken linked to ExecutionAgent");
  }

  // 9. Verify contracts on Etherscan
  console.log("\n" + "-".repeat(70));
  console.log("Contract Verification");
  console.log("-".repeat(70));

  await verifyContract(lexiconHolderAddress, [], network);
  await verifyContract(intentModuleAddress, [], network);
  await verifyContract(triggerMechanismAddress, [intentModuleAddress], network);
  await verifyContract(executionAgentAddress, [lexiconHolderAddress], network);
  await verifyContract(sunsetProtocolAddress, [executionAgentAddress, lexiconHolderAddress], network);
  await verifyContract(ipTokenAddress, [], network);

  // 10. Save deployment info
  const deploymentInfo = {
    network: network,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
    contracts: deployedContracts,
    configuration: {
      sunsetDurationYears: 20,
      confidenceThreshold: CONFIG.CONFIDENCE_THRESHOLD,
      deadmanInterval: CONFIG.DEADMAN_INTERVAL
    }
  };

  // Save to network-specific file
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  // Also save to root for convenience
  fs.writeFileSync('deployment-addresses.json', JSON.stringify(deploymentInfo, null, 2));

  // 11. Generate frontend config
  const frontendConfig = `// Auto-generated by deployment script
// Network: ${network}
// Deployed: ${new Date().toISOString()}

export const DEPLOYED_ADDRESSES = {
  INTENT_MODULE: "${intentModuleAddress}",
  TRIGGER_MECHANISM: "${triggerMechanismAddress}",
  EXECUTION_AGENT: "${executionAgentAddress}",
  LEXICON_HOLDER: "${lexiconHolderAddress}",
  SUNSET_PROTOCOL: "${sunsetProtocolAddress}",
  IP_TOKEN: "${ipTokenAddress}"
};

export const NETWORK_CONFIG = {
  chainId: ${hre.network.config.chainId || 31337},
  name: "${network}"
};
`;

  const frontendConfigPath = path.join(__dirname, '..', 'frontend', 'src', 'contracts', 'deployedAddresses.js');
  const frontendContractsDir = path.dirname(frontendConfigPath);
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }
  fs.writeFileSync(frontendConfigPath, frontendConfig);

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("Deployment Complete!");
  console.log("=".repeat(70));
  console.log("\nContract Addresses:");
  console.log("-".repeat(40));
  Object.entries(deployedContracts).forEach(([name, address]) => {
    console.log(`  ${name.padEnd(22)} ${address}`);
  });
  console.log("\nDeployment saved to:");
  console.log(`  - ${deploymentFile}`);
  console.log(`  - deployment-addresses.json`);
  console.log(`  - frontend/src/contracts/deployedAddresses.js`);

  if (network !== 'hardhat' && network !== 'localhost') {
    console.log("\nNext Steps:");
    console.log("  1. Update frontend .env with contract addresses");
    console.log("  2. Verify contracts on block explorer (if not auto-verified)");
    console.log("  3. Configure oracle integrations");
    console.log("  4. Test all contract interactions");
    console.log("  5. Transfer ownership to multi-sig (for production)");
  }

  console.log("\n" + "=".repeat(70));

  return deploymentInfo;
}

// Export for testing
module.exports = { main, CONFIG };

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n❌ Deployment failed:");
      console.error(error);
      process.exit(1);
    });
}

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { deployFIE } from "./lib/deployFIE.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Finite Intent Executor - Production Deployment Script
 *
 * Deploys all FIE contracts with proper configuration and verification.
 * The deployment and wiring itself lives in scripts/lib/deployFIE.js, which
 * the test suite also uses.
 *
 * Usage:
 *   npm run deploy                                  # local node (npm run node)
 *   npx hardhat run scripts/deploy.js --network <network>
 *
 * Networks: localhost, sepolia, mainnet, base, baseSepolia
 *           (default = Hardhat's throwaway in-process chain)
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
  VERIFIABLE_NETWORKS: ['mainnet', 'sepolia', 'base', 'baseSepolia'],

  // Local development networks (no balance check, no "next steps" checklist)
  LOCAL_NETWORKS: ['default', 'hardhat', 'localhost'],

  // Confirmation counts by network
  CONFIRMATIONS: {
    // "default" is Hardhat 3's in-process simulated network
    default: 1,
    hardhat: 1,
    localhost: 1,
    sepolia: 2,
    mainnet: 3,
    base: 2,
    baseSepolia: 2
  }
};

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
    // Hardhat 3 replaces hre.run(...) with the task registry. The "verify" task
    // takes `address` positionally and `constructorArgs` as a variadic argument
    // (Hardhat 2 called the latter `constructorArguments`).
    await hre.tasks.getTask(["verify"]).run({
      address: address,
      constructorArgs: constructorArgs,
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
 * Main deployment function
 */
async function main() {
  // Hardhat 3: ethers and the network config come from an explicit connection
  // rather than being hung off the `hre` object.
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const network = connection.networkName;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = CONFIG.LOCAL_NETWORKS.includes(network);
  console.log("=".repeat(70));
  console.log("Finite Intent Executor (FIE) - Deployment");
  console.log("=".repeat(70));
  console.log(`Network: ${network}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // [Audit fix: I-15] Network validation
  if (!CONFIG.CONFIRMATIONS[network]) {
    throw new Error(`Unknown network "${network}". Supported: ${Object.keys(CONFIG.CONFIRMATIONS).join(', ')}`);
  }

  if (network === 'default') {
    console.log("\n⚠️  Deploying to Hardhat's in-process network. These contracts disappear");
    console.log("    when this script exits. To deploy to a running node use `npm run deploy`");
    console.log("    (which targets --network localhost) after starting `npm run node`.");
  }

  // [Audit fix: C-3, I-11] Require multisig for mainnet deployment
  if (network === 'mainnet' && !process.env.MULTISIG_ADDRESS) {
    throw new Error("CRITICAL: MULTISIG_ADDRESS environment variable required for mainnet deployment. Deploy behind a multisig (e.g., Gnosis Safe) to prevent single-key privilege concentration.");
  }

  // Safety check for mainnet
  if (network === 'mainnet') {
    console.log("\n⚠️  WARNING: Deploying to MAINNET!");
    console.log("    Press Ctrl+C within 10 seconds to abort...");
    await new Promise(r => setTimeout(r, 10000));
  }

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`\nDeployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  // Check minimum balance
  const minBalance = ethers.parseEther("0.1");
  if (balance < minBalance && !isLocal) {
    throw new Error(`Insufficient balance. Need at least 0.1 ETH for deployment.`);
  }

  // 1-8. Deploy and wire the contracts
  const { contracts, addresses } = await deployFIE(ethers, {
    confirmations: CONFIG.CONFIRMATIONS[network],
    log: (message) => console.log(message),
  });
  const {
    LexiconHolder: lexiconHolder,
    IntentCaptureModule: intentModule,
    TriggerMechanism: triggerMechanism,
    ExecutionAgent: executionAgent,
    SunsetProtocol: sunsetProtocol,
    IPToken: ipToken,
  } = contracts;

  // 9. Verify contracts on Etherscan
  console.log("\n" + "-".repeat(70));
  console.log("Contract Verification");
  console.log("-".repeat(70));

  await verifyContract(addresses.LexiconHolder, [], network);
  await verifyContract(addresses.IntentCaptureModule, [], network);
  await verifyContract(addresses.TriggerMechanism, [addresses.IntentCaptureModule], network);
  await verifyContract(addresses.ExecutionAgent, [addresses.LexiconHolder], network);
  await verifyContract(addresses.SunsetProtocol, [addresses.ExecutionAgent, addresses.LexiconHolder], network);
  await verifyContract(addresses.IPToken, [], network);

  // 10. Save deployment info
  const deploymentInfo = {
    network: network,
    chainId: chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
    contracts: addresses,
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
  const rootDeploymentFile = path.join(__dirname, '..', 'deployment-addresses.json');
  fs.writeFileSync(rootDeploymentFile, JSON.stringify(deploymentInfo, null, 2));

  // 11. Generate frontend config. The dashboard picks this file up
  // automatically (see frontend/src/contracts/config.js), so a local
  // deployment needs no manual address copying. It is not written for the
  // throwaway in-process network, whose addresses would point at nothing.
  const frontendConfigPath = path.join(__dirname, '..', 'frontend', 'src', 'contracts', 'deployedAddresses.js');
  if (network !== 'default') {
    const frontendConfig = `// Auto-generated by scripts/deploy.js - do not edit.
// Network: ${network}
// Deployed: ${new Date().toISOString()}

export const DEPLOYED_ADDRESSES = ${JSON.stringify(addresses, null, 2)};

export const DEPLOYED_NETWORK = {
  chainId: ${chainId},
  name: "${network}"
};
`;
    fs.mkdirSync(path.dirname(frontendConfigPath), { recursive: true });
    fs.writeFileSync(frontendConfigPath, frontendConfig);
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("Deployment Complete!");
  console.log("=".repeat(70));
  console.log("\nContract Addresses:");
  console.log("-".repeat(40));
  Object.entries(addresses).forEach(([name, address]) => {
    console.log(`  ${name.padEnd(22)} ${address}`);
  });
  console.log("\nDeployment saved to:");
  console.log(`  - ${path.relative(process.cwd(), deploymentFile)}`);
  console.log(`  - ${path.relative(process.cwd(), rootDeploymentFile)}`);
  if (network !== 'default') {
    console.log(`  - ${path.relative(process.cwd(), frontendConfigPath)}`);
  }

  // [Audit fix: C-3, H-3, I-13] Role transfer to multisig
  if (process.env.MULTISIG_ADDRESS && process.env.TRANSFER_ROLES === 'true') {
    const multisig = process.env.MULTISIG_ADDRESS;
    console.log(`\nTransferring roles to multisig: ${multisig}`);

    const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
    const INDEXER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("INDEXER_ROLE"));
    const SUNSET_OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SUNSET_OPERATOR_ROLE"));
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

    // Grant admin roles to multisig
    await (await executionAgent.grantRole(DEFAULT_ADMIN_ROLE, multisig)).wait();
    await (await lexiconHolder.grantRole(DEFAULT_ADMIN_ROLE, multisig)).wait();
    await (await sunsetProtocol.grantRole(DEFAULT_ADMIN_ROLE, multisig)).wait();
    await (await ipToken.grantRole(DEFAULT_ADMIN_ROLE, multisig)).wait();
    console.log("  ✓ DEFAULT_ADMIN_ROLE granted to multisig on AccessControl contracts");

    // Start ownership transfer on Ownable2Step contracts. The multisig must
    // call acceptOwnership() on each to complete it.
    await (await intentModule.transferOwnership(multisig)).wait();
    await (await triggerMechanism.transferOwnership(multisig)).wait();
    console.log("  ✓ Ownership transfer started on IntentCaptureModule and TriggerMechanism");
    console.log("    (multisig must call acceptOwnership() on each to complete it)");

    // Renounce deployer's operational roles
    await (await executionAgent.renounceRole(EXECUTOR_ROLE, deployer.address)).wait();
    await (await lexiconHolder.renounceRole(INDEXER_ROLE, deployer.address)).wait();
    await (await sunsetProtocol.renounceRole(SUNSET_OPERATOR_ROLE, deployer.address)).wait();
    await (await ipToken.renounceRole(MINTER_ROLE, deployer.address)).wait();
    await (await ipToken.renounceRole(EXECUTOR_ROLE, deployer.address)).wait();
    console.log("  ✓ Deployer operational roles renounced");

    // Renounce deployer's admin roles (do this last — cannot be undone)
    await (await executionAgent.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
    await (await lexiconHolder.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
    await (await sunsetProtocol.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
    await (await ipToken.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
    console.log("  ✓ Deployer admin roles renounced — multisig is now sole admin");

    deploymentInfo.roleTransfer = {
      multisig: multisig,
      transferredAt: new Date().toISOString(),
      deployerRolesRenounced: true
    };

    // Re-save deployment info with role transfer data
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    fs.writeFileSync(rootDeploymentFile, JSON.stringify(deploymentInfo, null, 2));
  }

  if (network === 'localhost') {
    console.log("\nNext Steps:");
    console.log("  1. Start the dashboard:   cd frontend && npm install && npm run dev");
    console.log("  2. Open http://localhost:3000 and click \"Connect Wallet\".");
    console.log(`     Use account ${deployer.address} (Hardhat account #0) — it holds every`);
    console.log("     operator role, so all dashboard actions work. In MetaMask, add the");
    console.log(`     network http://127.0.0.1:8545 (chain ID ${chainId}) and import that`);
    console.log("     account's private key from the `npm run node` output.");
  } else if (!isLocal) {
    console.log("\nNext Steps:");
    console.log("  1. Point the frontend at this deployment (frontend/.env, see frontend/.env.example)");
    console.log("  2. Verify contracts on block explorer (if not auto-verified)");
    console.log("  3. Configure oracle integrations");
    console.log("  4. Test all contract interactions");
    if (!process.env.TRANSFER_ROLES) {
      console.log(`  5. Transfer roles to multi-sig: MULTISIG_ADDRESS=<addr> TRANSFER_ROLES=true npx hardhat run scripts/deploy.js --network ${network}`);
    }
  }

  console.log("\n" + "=".repeat(70));

  return deploymentInfo;
}

// Run when invoked via `hardhat run`
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });

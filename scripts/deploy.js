const hre = require("hardhat");

async function main() {
  console.log("Deploying Finite Intent Executor (FIE) System...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy LexiconHolder first (no dependencies)
  console.log("\n1. Deploying LexiconHolder...");
  const LexiconHolder = await hre.ethers.getContractFactory("LexiconHolder");
  const lexiconHolder = await LexiconHolder.deploy();
  await lexiconHolder.waitForDeployment();
  const lexiconHolderAddress = await lexiconHolder.getAddress();
  console.log("LexiconHolder deployed to:", lexiconHolderAddress);

  // Deploy IntentCaptureModule
  console.log("\n2. Deploying IntentCaptureModule...");
  const IntentCaptureModule = await hre.ethers.getContractFactory("IntentCaptureModule");
  const intentModule = await IntentCaptureModule.deploy();
  await intentModule.waitForDeployment();
  const intentModuleAddress = await intentModule.getAddress();
  console.log("IntentCaptureModule deployed to:", intentModuleAddress);

  // Deploy TriggerMechanism
  console.log("\n3. Deploying TriggerMechanism...");
  const TriggerMechanism = await hre.ethers.getContractFactory("TriggerMechanism");
  const triggerMechanism = await TriggerMechanism.deploy(intentModuleAddress);
  await triggerMechanism.waitForDeployment();
  const triggerMechanismAddress = await triggerMechanism.getAddress();
  console.log("TriggerMechanism deployed to:", triggerMechanismAddress);

  // Grant TriggerMechanism permission to trigger intents
  console.log("\n4. Granting TriggerMechanism permission to IntentCaptureModule...");
  await intentModule.transferOwnership(triggerMechanismAddress);
  console.log("Permission granted");

  // Deploy ExecutionAgent
  console.log("\n5. Deploying ExecutionAgent...");
  const ExecutionAgent = await hre.ethers.getContractFactory("ExecutionAgent");
  const executionAgent = await ExecutionAgent.deploy(lexiconHolderAddress);
  await executionAgent.waitForDeployment();
  const executionAgentAddress = await executionAgent.getAddress();
  console.log("ExecutionAgent deployed to:", executionAgentAddress);

  // Deploy SunsetProtocol
  console.log("\n6. Deploying SunsetProtocol...");
  const SunsetProtocol = await hre.ethers.getContractFactory("SunsetProtocol");
  const sunsetProtocol = await SunsetProtocol.deploy(executionAgentAddress, lexiconHolderAddress);
  await sunsetProtocol.waitForDeployment();
  const sunsetProtocolAddress = await sunsetProtocol.getAddress();
  console.log("SunsetProtocol deployed to:", sunsetProtocolAddress);

  // Deploy IPToken
  console.log("\n7. Deploying IPToken...");
  const IPToken = await hre.ethers.getContractFactory("IPToken");
  const ipToken = await IPToken.deploy();
  await ipToken.waitForDeployment();
  const ipTokenAddress = await ipToken.getAddress();
  console.log("IPToken deployed to:", ipTokenAddress);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  console.log("\nContract Addresses:");
  console.log("-------------------");
  console.log("LexiconHolder:        ", lexiconHolderAddress);
  console.log("IntentCaptureModule:  ", intentModuleAddress);
  console.log("TriggerMechanism:     ", triggerMechanismAddress);
  console.log("ExecutionAgent:       ", executionAgentAddress);
  console.log("SunsetProtocol:       ", sunsetProtocolAddress);
  console.log("IPToken:              ", ipTokenAddress);
  console.log("\n" + "=".repeat(60));

  // Save deployment addresses to file
  const fs = require('fs');
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      LexiconHolder: lexiconHolderAddress,
      IntentCaptureModule: intentModuleAddress,
      TriggerMechanism: triggerMechanismAddress,
      ExecutionAgent: executionAgentAddress,
      SunsetProtocol: sunsetProtocolAddress,
      IPToken: ipTokenAddress
    }
  };

  fs.writeFileSync(
    'deployment-addresses.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment addresses saved to deployment-addresses.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

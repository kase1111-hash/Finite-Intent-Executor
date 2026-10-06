/**
 * Deploys and wires the six core FIE contracts.
 *
 * This is the single source of truth for how the system is assembled. Both
 * scripts/deploy.js and the test suite (test/Deployment.test.js) call it, so a
 * missing role grant shows up as a failing test instead of a broken
 * deployment.
 *
 * @param {object} ethers - The ethers object from a Hardhat network connection.
 * @param {object} [options]
 * @param {number} [options.confirmations=1] - Blocks to wait for per transaction.
 * @param {(message: string) => void} [options.log] - Progress logger.
 * @returns {Promise<{contracts: object, addresses: object}>} Contract instances
 *   and their addresses, both keyed by contract name.
 */
export async function deployFIE(ethers, { confirmations = 1, log = () => {} } = {}) {
  const contracts = {};
  const addresses = {};

  async function deploy(name, args = []) {
    log(`\nDeploying ${name}...`);
    const factory = await ethers.getContractFactory(name);
    const contract = await factory.deploy(...args);
    const deployTx = contract.deploymentTransaction();
    log(`  Transaction hash: ${deployTx.hash}`);
    await deployTx.wait(confirmations);
    const address = await contract.getAddress();
    log(`  ✓ ${name} deployed to: ${address}`);
    contracts[name] = contract;
    addresses[name] = address;
    return address;
  }

  async function send(description, txPromise) {
    const tx = await txPromise;
    await tx.wait(confirmations);
    log(`  ✓ ${description}`);
  }

  const lexiconHolder = await deploy("LexiconHolder");
  const intentModule = await deploy("IntentCaptureModule");
  const triggerMechanism = await deploy("TriggerMechanism", [intentModule]);
  const executionAgent = await deploy("ExecutionAgent", [lexiconHolder]);
  const sunsetProtocol = await deploy("SunsetProtocol", [executionAgent, lexiconHolder]);
  await deploy("IPToken");

  log("\nConfiguring cross-contract permissions...");

  // Only the TriggerMechanism may mark an intent as triggered.
  await send(
    "TriggerMechanism authorized on IntentCaptureModule",
    contracts.IntentCaptureModule.setTriggerMechanism(triggerMechanism)
  );

  // [Audit fix: H-2] SunsetProtocol.initiateSunset/emergencySunset call
  // ExecutionAgent.activateSunset, which is gated on SUNSET_ROLE.
  await send(
    "SUNSET_ROLE granted to SunsetProtocol on ExecutionAgent",
    contracts.ExecutionAgent.grantRole(await contracts.ExecutionAgent.SUNSET_ROLE(), sunsetProtocol)
  );

  // SunsetProtocol.clusterLegacy calls LexiconHolder.assignLegacyToCluster,
  // which is gated on INDEXER_ROLE. Without this grant no sunset can complete.
  await send(
    "INDEXER_ROLE granted to SunsetProtocol on LexiconHolder",
    contracts.LexiconHolder.grantRole(await contracts.LexiconHolder.INDEXER_ROLE(), sunsetProtocol)
  );

  return { contracts, addresses };
}

import { expect } from "chai";
import { network } from "hardhat";
import { deployFIE } from "../scripts/lib/deployFIE.js";
import { executeDeadmanSwitch } from "./helpers.js";

const { ethers, networkHelpers } = await network.connect();
const { time } = networkHelpers;

/**
 * Exercises the system exactly as scripts/deploy.js assembles it, with no
 * extra role grants. Every other suite wires the contracts by hand, so it
 * cannot catch a grant that the real deployment forgets.
 */
describe("Deployment (scripts/lib/deployFIE.js)", function () {
  let contracts, addresses;
  let deployer, creator;

  const THIRTY_DAYS = 30 * 24 * 60 * 60;
  const TWENTY_YEARS = 20 * 365 * 24 * 60 * 60;

  beforeEach(async function () {
    [deployer, creator] = await ethers.getSigners();
    ({ contracts, addresses } = await deployFIE(ethers));
  });

  it("Should deploy all six core contracts", async function () {
    expect(Object.keys(addresses).sort()).to.deep.equal([
      "ExecutionAgent",
      "IPToken",
      "IntentCaptureModule",
      "LexiconHolder",
      "SunsetProtocol",
      "TriggerMechanism",
    ]);
    for (const address of Object.values(addresses)) {
      expect(await ethers.provider.getCode(address)).to.not.equal("0x");
    }
  });

  it("Should wire cross-contract permissions", async function () {
    const { IntentCaptureModule, ExecutionAgent, LexiconHolder } = contracts;

    expect(await IntentCaptureModule.triggerMechanism()).to.equal(addresses.TriggerMechanism);
    expect(
      await ExecutionAgent.hasRole(await ExecutionAgent.SUNSET_ROLE(), addresses.SunsetProtocol)
    ).to.be.true;
    expect(
      await LexiconHolder.hasRole(await LexiconHolder.INDEXER_ROLE(), addresses.SunsetProtocol)
    ).to.be.true;
  });

  it("Should leave the deployer holding every operator role", async function () {
    const { ExecutionAgent, LexiconHolder, SunsetProtocol, IPToken } = contracts;

    expect(await ExecutionAgent.hasRole(await ExecutionAgent.EXECUTOR_ROLE(), deployer.address)).to.be.true;
    expect(await LexiconHolder.hasRole(await LexiconHolder.INDEXER_ROLE(), deployer.address)).to.be.true;
    expect(
      await SunsetProtocol.hasRole(await SunsetProtocol.SUNSET_OPERATOR_ROLE(), deployer.address)
    ).to.be.true;
    expect(await IPToken.hasRole(await IPToken.MINTER_ROLE(), deployer.address)).to.be.true;
  });

  it("Should run the full lifecycle from capture to completed sunset", async function () {
    const {
      IntentCaptureModule,
      TriggerMechanism,
      ExecutionAgent,
      LexiconHolder,
      SunsetProtocol,
    } = contracts;

    // 1. Creator captures intent and configures a deadman switch
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Fund open-source digital rights work."));
    const asset = ethers.Wallet.createRandom().address;
    await IntentCaptureModule.connect(creator).captureIntent(
      ethers.keccak256(ethers.toUtf8Bytes("My intent")),
      corpusHash,
      "ipfs://corpus",
      "ipfs://assets",
      2020,
      2025,
      [asset]
    );
    await TriggerMechanism.connect(creator).configureDeadmanSwitch(THIRTY_DAYS);

    // 2. Creator goes silent; anyone fires the deadman switch
    await time.increase(THIRTY_DAYS + 1);
    await executeDeadmanSwitch(TriggerMechanism, creator.address, networkHelpers);
    expect((await IntentCaptureModule.getIntent(creator.address)).isTriggered).to.be.true;

    // 3. Operators activate execution and index the corpus
    await ExecutionAgent.activateExecution(creator.address);
    await LexiconHolder.freezeCorpus(creator.address, corpusHash, "ipfs://corpus", 2020, 2025);
    await LexiconHolder.createSemanticIndex(
      creator.address,
      "fund_digital_rights",
      ["Fund open-source digital rights work."],
      [97]
    );

    // 4. An aligned action executes; an unknown one defaults to inaction
    await expect(
      ExecutionAgent.executeAction(creator.address, "fund_digital_rights", "fund_digital_rights", corpusHash)
    ).to.emit(ExecutionAgent, "ActionExecuted");
    await expect(
      ExecutionAgent.executeAction(creator.address, "speculate", "speculate", corpusHash)
    ).to.emit(ExecutionAgent, "InactionDefault");
    expect(await ExecutionAgent.getExecutionLogs(creator.address)).to.have.length(1);

    // 5. Twenty years later the sunset runs to completion
    await time.increase(TWENTY_YEARS);
    expect(await SunsetProtocol.isSunsetDue(creator.address)).to.be.true;

    await SunsetProtocol.initiateSunset(creator.address);
    await SunsetProtocol.archiveAssets(
      creator.address,
      [asset],
      ["ipfs://archive"],
      [ethers.keccak256(ethers.toUtf8Bytes("archived asset"))]
    );
    await SunsetProtocol.finalizeArchive(creator.address);
    await SunsetProtocol.transitionIP(creator.address, 0); // CC0

    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("digital-rights"));
    await LexiconHolder.createCluster(clusterId, "Digital rights legacies");
    // Requires SunsetProtocol to hold INDEXER_ROLE on LexiconHolder
    await SunsetProtocol.clusterLegacy(creator.address, clusterId);
    await SunsetProtocol.completeSunset(creator.address);

    const state = await SunsetProtocol.getSunsetState(creator.address);
    expect(state.completed).to.be.true;
    expect(await ExecutionAgent.isExecutionActive(creator.address)).to.be.false;
    expect(await LexiconHolder.getLegacyCluster(creator.address)).to.equal(clusterId);
  });
});

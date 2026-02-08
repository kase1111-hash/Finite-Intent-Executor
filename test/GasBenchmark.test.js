const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Gas Benchmarking Tests
 *
 * This test suite measures and reports gas costs for all major contract operations.
 * Results are logged in a formatted table for easy analysis.
 *
 * Categories:
 * 1. Deployment costs
 * 2. Intent lifecycle operations
 * 3. Trigger operations
 * 4. Execution operations
 * 5. IP Token operations
 * 6. Sunset operations
 */
describe("Gas Benchmarking", function () {
  let intentModule, triggerMechanism, executionAgent, lexiconHolder, sunsetProtocol, ipToken;
  let owner, creator, signer1, signer2, licensee, recipient;

  const gasResults = [];

  const NINETY_DAYS = 90 * 24 * 60 * 60;
  const ONE_YEAR = 365 * 24 * 60 * 60;
  const TWENTY_YEARS = 20 * 365 * 24 * 60 * 60;

  const logGas = async (category, operation, tx) => {
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed;
    gasResults.push({
      category,
      operation,
      gasUsed: gasUsed.toString(),
      estimatedCostAt30Gwei: (Number(gasUsed) * 30 / 1e9).toFixed(6)
    });
    return receipt;
  };

  before(async function () {
    [owner, creator, signer1, signer2, licensee, recipient] = await ethers.getSigners();
  });

  after(function () {
    console.log("\n");
    console.log("=".repeat(80));
    console.log("GAS BENCHMARK RESULTS");
    console.log("=".repeat(80));
    console.log("");

    // Group by category
    const categories = [...new Set(gasResults.map(r => r.category))];

    categories.forEach(category => {
      console.log(`\n${category}`);
      console.log("-".repeat(70));
      console.log(
        "Operation".padEnd(45) +
        "Gas Used".padStart(12) +
        "Cost (ETH)".padStart(13)
      );
      console.log("-".repeat(70));

      const categoryResults = gasResults.filter(r => r.category === category);
      categoryResults.forEach(r => {
        console.log(
          r.operation.padEnd(45) +
          r.gasUsed.padStart(12) +
          r.estimatedCostAt30Gwei.padStart(13)
        );
      });
    });

    // Summary
    const totalGas = gasResults.reduce((sum, r) => sum + BigInt(r.gasUsed), 0n);
    console.log("\n" + "=".repeat(70));
    console.log(
      "TOTAL".padEnd(45) +
      totalGas.toString().padStart(12) +
      (Number(totalGas) * 30 / 1e9).toFixed(6).padStart(13)
    );
    console.log("=".repeat(70));
    console.log("\nNote: Costs estimated at 30 gwei gas price");
  });

  describe("Deployment Costs", function () {
    it("Deploy LexiconHolder", async function () {
      const LexiconHolder = await ethers.getContractFactory("LexiconHolder");
      const tx = await LexiconHolder.deploy();
      lexiconHolder = await tx.waitForDeployment();
      await logGas("1. Deployment", "LexiconHolder", tx.deploymentTransaction());
    });

    it("Deploy IntentCaptureModule", async function () {
      const IntentCaptureModule = await ethers.getContractFactory("IntentCaptureModule");
      const tx = await IntentCaptureModule.deploy();
      intentModule = await tx.waitForDeployment();
      await logGas("1. Deployment", "IntentCaptureModule", tx.deploymentTransaction());
    });

    it("Deploy TriggerMechanism", async function () {
      const TriggerMechanism = await ethers.getContractFactory("TriggerMechanism");
      const tx = await TriggerMechanism.deploy(await intentModule.getAddress());
      triggerMechanism = await tx.waitForDeployment();
      await logGas("1. Deployment", "TriggerMechanism", tx.deploymentTransaction());
    });

    it("Deploy ExecutionAgent", async function () {
      const ExecutionAgent = await ethers.getContractFactory("ExecutionAgent");
      const tx = await ExecutionAgent.deploy(await lexiconHolder.getAddress());
      executionAgent = await tx.waitForDeployment();
      await logGas("1. Deployment", "ExecutionAgent", tx.deploymentTransaction());
    });

    it("Deploy SunsetProtocol", async function () {
      const SunsetProtocol = await ethers.getContractFactory("SunsetProtocol");
      const tx = await SunsetProtocol.deploy(
        await executionAgent.getAddress(),
        await lexiconHolder.getAddress()
      );
      sunsetProtocol = await tx.waitForDeployment();
      await logGas("1. Deployment", "SunsetProtocol", tx.deploymentTransaction());
    });

    it("Deploy IPToken", async function () {
      const IPToken = await ethers.getContractFactory("IPToken");
      const tx = await IPToken.deploy();
      ipToken = await tx.waitForDeployment();
      await logGas("1. Deployment", "IPToken", tx.deploymentTransaction());
    });
  });

  describe("Intent Lifecycle Operations", function () {
    before(async function () {
      await intentModule.setTriggerMechanism(await triggerMechanism.getAddress());
    });

    it("Capture Intent", async function () {
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      const tx = await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus-uri",
        "ipfs://assets-uri",
        2020,
        2028,
        [await ipToken.getAddress()]
      );
      await logGas("2. Intent Lifecycle", "captureIntent", tx);
    });

    it("Add Goal", async function () {
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
      const tx = await intentModule.connect(creator).addGoal(
        "Fund open source projects",
        constraintsHash,
        90
      );
      await logGas("2. Intent Lifecycle", "addGoal", tx);
    });

    it("Sign Version", async function () {
      const versionHash = ethers.keccak256(ethers.toUtf8Bytes("Version 1"));
      const tx = await intentModule.connect(creator).signVersion(versionHash);
      await logGas("2. Intent Lifecycle", "signVersion", tx);
    });
  });

  describe("Trigger Operations", function () {
    let creator2;

    before(async function () {
      creator2 = signer2;

      // Setup new intent for trigger tests
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent2"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus2"));

      await intentModule.connect(creator2).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus-uri",
        "ipfs://assets-uri",
        2020,
        2028,
        [await ipToken.getAddress()]
      );
    });

    it("Configure Deadman Switch", async function () {
      const tx = await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);
      await logGas("3. Trigger Operations", "configureDeadmanSwitch", tx);
    });

    it("Check In (Deadman)", async function () {
      await time.increase(30 * 24 * 60 * 60);
      const tx = await triggerMechanism.connect(creator).checkIn();
      await logGas("3. Trigger Operations", "checkIn", tx);
    });

    it("Configure Trusted Quorum", async function () {
      const tx = await triggerMechanism.connect(creator2).configureTrustedQuorum(
        [signer1.address, owner.address],
        2
      );
      await logGas("3. Trigger Operations", "configureTrustedQuorum", tx);
    });

    it("Submit Trusted Signature", async function () {
      const tx = await triggerMechanism.connect(signer1).submitTrustedSignature(creator2.address);
      await logGas("3. Trigger Operations", "submitTrustedSignature (no trigger)", tx);
    });

    it("Submit Trusted Signature (with trigger)", async function () {
      const tx = await triggerMechanism.connect(owner).submitTrustedSignature(creator2.address);
      await logGas("3. Trigger Operations", "submitTrustedSignature (triggers)", tx);
    });
  });

  describe("Execution Operations", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus2"));

    before(async function () {
      // Setup
      await executionAgent.grantRole(
        await executionAgent.EXECUTOR_ROLE(),
        owner.address
      );

      await lexiconHolder.freezeCorpus(
        signer2.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2028
      );

      await lexiconHolder.createSemanticIndex(
        signer2.address,
        "fund_project",
        ["Fund open source projects"],
        [97]
      );

      await lexiconHolder.createSemanticIndex(
        signer2.address,
        "license_issuance",
        ["License assets per intent"],
        [98]
      );

      await lexiconHolder.createSemanticIndex(
        signer2.address,
        "distribute_revenue:Royalty distribution",
        ["Distribute royalties per intent"],
        [97]
      );
    });

    it("Activate Execution", async function () {
      const tx = await executionAgent.activateExecution(signer2.address);
      await logGas("4. Execution Operations", "activateExecution", tx);
    });

    it("Deposit to Treasury", async function () {
      const tx = await executionAgent.depositToTreasury(signer2.address, {
        value: ethers.parseEther("1.0")
      });
      await logGas("4. Execution Operations", "depositToTreasury", tx);
    });

    it("Execute Action", async function () {
      const tx = await executionAgent.executeAction(
        signer2.address,
        "fund_project",
        "fund_project",
        corpusHash
      );
      await logGas("4. Execution Operations", "executeAction", tx);
    });

    it("Issue License", async function () {
      const tx = await executionAgent.issueLicense(
        signer2.address,
        licensee.address,
        await ipToken.getAddress(),
        500,
        ONE_YEAR,
        corpusHash
      );
      await logGas("4. Execution Operations", "issueLicense", tx);
    });

    it("Distribute Revenue", async function () {
      const tx = await executionAgent.distributeRevenue(
        signer2.address,
        recipient.address,
        ethers.parseEther("0.1"),
        "Royalty distribution",
        corpusHash
      );
      await logGas("4. Execution Operations", "distributeRevenue", tx);
    });
  });

  describe("IP Token Operations", function () {
    before(async function () {
      await ipToken.grantRole(await ipToken.EXECUTOR_ROLE(), owner.address);
    });

    it("Mint IP Token", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Article"));
      const tx = await ipToken.mintIP(
        creator.address,
        "My Article",
        "A groundbreaking article",
        "article",
        contentHash,
        "ipfs://metadata-uri",
        "CC-BY-4.0"
      );
      await logGas("5. IP Token Operations", "mintIP", tx);
    });

    it("Grant License", async function () {
      const tx = await ipToken.grantLicense(0, licensee.address, 500, ONE_YEAR);
      await logGas("5. IP Token Operations", "grantLicense", tx);
    });

    it("Pay Royalty", async function () {
      const tx = await ipToken.connect(recipient).payRoyalty(0, {
        value: ethers.parseEther("0.1")
      });
      await logGas("5. IP Token Operations", "payRoyalty", tx);
    });

    it("Set Royalty Info", async function () {
      const tx = await ipToken.setRoyaltyInfo(0, recipient.address, 2000);
      await logGas("5. IP Token Operations", "setRoyaltyInfo", tx);
    });

    it("Transition to Public Domain", async function () {
      const tx = await ipToken.transitionToPublicDomain(0);
      await logGas("5. IP Token Operations", "transitionToPublicDomain", tx);
    });
  });

  describe("Lexicon Operations", function () {
    it("Freeze Corpus", async function () {
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("New Corpus"));
      const tx = await lexiconHolder.freezeCorpus(
        licensee.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );
      await logGas("6. Lexicon Operations", "freezeCorpus", tx);
    });

    it("Create Semantic Index (single)", async function () {
      const tx = await lexiconHolder.createSemanticIndex(
        licensee.address,
        "keyword",
        ["Citation 1", "Citation 2"],
        [90, 85]
      );
      await logGas("6. Lexicon Operations", "createSemanticIndex (2 citations)", tx);
    });

    it("Batch Create Indices", async function () {
      const tx = await lexiconHolder.batchCreateIndices(
        licensee.address,
        ["k1", "k2", "k3"],
        [["c1"], ["c2"], ["c3"]],
        [[95], [90], [85]]
      );
      await logGas("6. Lexicon Operations", "batchCreateIndices (3 keywords)", tx);
    });

    it("Resolve Ambiguity", async function () {
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("New Corpus"));
      const tx = await lexiconHolder.resolveAmbiguity(
        licensee.address,
        "keyword",
        corpusHash
      );
      await logGas("6. Lexicon Operations", "resolveAmbiguity", tx);
    });

    it("Create Cluster", async function () {
      const clusterId = ethers.keccak256(ethers.toUtf8Bytes("OpenSource"));
      const tx = await lexiconHolder.createCluster(clusterId, "Open Source Projects");
      await logGas("6. Lexicon Operations", "createCluster", tx);
    });

    it("Assign Legacy to Cluster", async function () {
      const clusterId = ethers.keccak256(ethers.toUtf8Bytes("OpenSource"));
      const tx = await lexiconHolder.assignLegacyToCluster(licensee.address, clusterId);
      await logGas("6. Lexicon Operations", "assignLegacyToCluster", tx);
    });
  });

  describe("Sunset Operations", function () {
    let sunsetCreator;

    before(async function () {
      sunsetCreator = recipient;

      // Setup sunset test
      await sunsetProtocol.grantRole(
        await sunsetProtocol.SUNSET_OPERATOR_ROLE(),
        owner.address
      );

      await lexiconHolder.grantRole(
        await lexiconHolder.INDEXER_ROLE(),
        await sunsetProtocol.getAddress()
      );

      // Freeze corpus
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Sunset Corpus"));
      await lexiconHolder.freezeCorpus(
        sunsetCreator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      // Activate execution
      await executionAgent.activateExecution(sunsetCreator.address);
    });

    it("Initiate Sunset", async function () {
      await time.increase(TWENTY_YEARS + 1);

      const tx = await sunsetProtocol.initiateSunset(sunsetCreator.address);
      await logGas("7. Sunset Operations", "initiateSunset", tx);
    });

    it("Archive Assets", async function () {
      const tx = await sunsetProtocol.archiveAssets(
        sunsetCreator.address,
        [await ipToken.getAddress()],
        ["ipfs://archived-asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );
      await logGas("7. Sunset Operations", "archiveAssets (1 asset)", tx);
    });

    it("Finalize Archive", async function () {
      const tx = await sunsetProtocol.finalizeArchive(sunsetCreator.address);
      await logGas("7. Sunset Operations", "finalizeArchive", tx);
    });

    it("Transition IP", async function () {
      const tx = await sunsetProtocol.transitionIP(sunsetCreator.address, 0); // CC0
      await logGas("7. Sunset Operations", "transitionIP", tx);
    });

    it("Cluster Legacy", async function () {
      const clusterId = ethers.keccak256(ethers.toUtf8Bytes("OpenSource"));
      const tx = await sunsetProtocol.clusterLegacy(sunsetCreator.address, clusterId);
      await logGas("7. Sunset Operations", "clusterLegacy", tx);
    });

    it("Complete Sunset", async function () {
      const tx = await sunsetProtocol.completeSunset(sunsetCreator.address);
      await logGas("7. Sunset Operations", "completeSunset", tx);
    });
  });
});

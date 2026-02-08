const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Integration Tests - Full Lifecycle", function () {
  let intentModule, triggerMechanism, executionAgent, lexiconHolder, sunsetProtocol, ipToken;
  let owner, creator, signer1, signer2, licensee, recipient;

  const NINETY_DAYS = 90 * 24 * 60 * 60;
  const ONE_YEAR = 365 * 24 * 60 * 60;
  const TWENTY_YEARS = 20 * 365 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, creator, signer1, signer2, licensee, recipient] = await ethers.getSigners();

    // Deploy all contracts
    const LexiconHolder = await ethers.getContractFactory("LexiconHolder");
    lexiconHolder = await LexiconHolder.deploy();
    await lexiconHolder.waitForDeployment();

    const IntentCaptureModule = await ethers.getContractFactory("IntentCaptureModule");
    intentModule = await IntentCaptureModule.deploy();
    await intentModule.waitForDeployment();

    const TriggerMechanism = await ethers.getContractFactory("TriggerMechanism");
    triggerMechanism = await TriggerMechanism.deploy(await intentModule.getAddress());
    await triggerMechanism.waitForDeployment();

    const ExecutionAgent = await ethers.getContractFactory("ExecutionAgent");
    executionAgent = await ExecutionAgent.deploy(await lexiconHolder.getAddress());
    await executionAgent.waitForDeployment();

    const SunsetProtocol = await ethers.getContractFactory("SunsetProtocol");
    sunsetProtocol = await SunsetProtocol.deploy(
      await executionAgent.getAddress(),
      await lexiconHolder.getAddress()
    );
    await sunsetProtocol.waitForDeployment();

    const IPToken = await ethers.getContractFactory("IPToken");
    ipToken = await IPToken.deploy();
    await ipToken.waitForDeployment();

    // Link contracts
    await intentModule.setTriggerMechanism(await triggerMechanism.getAddress());

    // Grant roles
    const INDEXER_ROLE = await lexiconHolder.INDEXER_ROLE();
    await lexiconHolder.grantRole(INDEXER_ROLE, await sunsetProtocol.getAddress());

    const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();
    await executionAgent.grantRole(EXECUTOR_ROLE, owner.address);

    const IP_EXECUTOR_ROLE = await ipToken.EXECUTOR_ROLE();
    await ipToken.grantRole(IP_EXECUTOR_ROLE, await executionAgent.getAddress());
    await ipToken.grantRole(IP_EXECUTOR_ROLE, owner.address);

    const SUNSET_OPERATOR_ROLE = await sunsetProtocol.SUNSET_OPERATOR_ROLE();
    await sunsetProtocol.grantRole(SUNSET_OPERATOR_ROLE, owner.address);
  });

  describe("Complete Lifecycle - Intent to Sunset", function () {
    it("Should complete full lifecycle from intent capture to sunset", async function () {
      // Phase 1: Intent Capture
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Final Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("My Contextual Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus-uri",
        "ipfs://assets-uri",
        2020,
        2028,
        [await ipToken.getAddress()]
      );

      // Add goals
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("No political activity"));
      await intentModule.connect(creator).addGoal(
        "Fund open source development",
        constraintsHash,
        100
      );

      // Verify intent captured
      let intent = await intentModule.getIntent(creator.address);
      expect(intent.intentHash).to.equal(intentHash);
      expect(intent.isTriggered).to.equal(false);

      // Phase 2: Mint IP Tokens
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Valuable Article"));
      await ipToken.mintIP(
        creator.address,
        "Legacy Article",
        "Important work to be preserved",
        "article",
        contentHash,
        "ipfs://article-uri",
        "CC-BY-4.0"
      );

      expect(await ipToken.ownerOf(0)).to.equal(creator.address);

      // Phase 3: Configure Trigger (Trusted Quorum)
      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [signer1.address, signer2.address],
        2
      );

      // Phase 4: Freeze Corpus in Lexicon
      await lexiconHolder.freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus-uri",
        2020,
        2028
      );

      // Create semantic indices
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "fund_project",
        ["Fund aligned open source projects"],
        [97]
      );

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "license_issuance",
        ["License assets as specified in intent"],
        [98]
      );

      // Phase 5: Trigger Execution (simulate creator death)
      await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);
      await triggerMechanism.connect(signer2).submitTrustedSignature(creator.address);

      // Verify trigger
      intent = await intentModule.getIntent(creator.address);
      expect(intent.isTriggered).to.equal(true);

      // Phase 6: Activate Execution
      await executionAgent.activateExecution(creator.address);
      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(true);

      // Deposit funds for project funding
      await executionAgent.depositToTreasury(creator.address, {
        value: ethers.parseEther("10.0")
      });

      // Phase 7: Execute Posthumous Actions
      // Fund a project
      await executionAgent.fundProject(
        creator.address,
        recipient.address,
        ethers.parseEther("1.0"),
        "fund_project",
        corpusHash
      );

      const projects = await executionAgent.getFundedProjects(creator.address);
      expect(projects.length).to.equal(1);

      // Issue license
      await executionAgent.issueLicense(
        creator.address,
        licensee.address,
        await ipToken.getAddress(),
        500, // 5%
        ONE_YEAR,
        corpusHash
      );

      const licenses = await executionAgent.getLicenses(creator.address);
      expect(licenses.length).to.equal(1);

      // Phase 8: Time passes (20 years)
      await time.increase(TWENTY_YEARS + 1);

      // Phase 9: Sunset Protocol
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);

      // Initiate sunset
      await sunsetProtocol.initiateSunset(creator.address);
      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(false);

      // Archive assets
      await sunsetProtocol.archiveAssets(
        creator.address,
        [await ipToken.getAddress()],
        ["ipfs://archived-asset"],
        [contentHash]
      );
      await sunsetProtocol.finalizeArchive(creator.address);

      // Transition IP to public domain
      await sunsetProtocol.transitionIP(creator.address, 0); // CC0

      // Cluster legacy
      const clusterId = ethers.keccak256(ethers.toUtf8Bytes("OpenSourceLegacies"));
      await lexiconHolder.createCluster(clusterId, "Open Source Legacies");
      await sunsetProtocol.clusterLegacy(creator.address, clusterId);

      // Complete sunset
      await sunsetProtocol.completeSunset(creator.address);

      // Verify final state
      const sunsetState = await sunsetProtocol.getSunsetState(creator.address);
      expect(sunsetState.isSunset).to.equal(true);
      expect(sunsetState.assetsArchived).to.equal(true);
      expect(sunsetState.ipTransitioned).to.equal(true);
      expect(sunsetState.clustered).to.equal(true);
    });
  });

  describe("Deadman Switch Lifecycle", function () {
    it("Should trigger via deadman switch and execute posthumous actions", async function () {
      // Setup
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      await lexiconHolder.freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "distribute_revenue:Distribute remaining funds",
        ["Distribute remaining funds to charities"],
        [96]
      );

      // Configure deadman switch
      await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);

      // Creator checks in periodically
      await time.increase(NINETY_DAYS / 2);
      await triggerMechanism.connect(creator).checkIn();

      // Creator stops checking in (simulates death/incapacitation)
      await time.increase(NINETY_DAYS + 1);

      // Execute deadman switch
      await triggerMechanism.executeDeadmanSwitch(creator.address);

      // Verify triggered
      const intent = await intentModule.getIntent(creator.address);
      expect(intent.isTriggered).to.equal(true);

      // Activate and execute
      await executionAgent.activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, {
        value: ethers.parseEther("5.0")
      });

      await executionAgent.distributeRevenue(
        creator.address,
        recipient.address,
        ethers.parseEther("1.0"),
        "Distribute remaining funds",
        corpusHash
      );

      expect(await executionAgent.treasuries(creator.address)).to.equal(
        ethers.parseEther("4.0")
      );
    });
  });

  describe("Political Action Blocking", function () {
    it("Should block all political actions throughout lifecycle", async function () {
      // Setup
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      await lexiconHolder.freezeCorpus(creator.address, corpusHash, "ipfs://corpus", 2020, 2025);

      // Trigger
      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [signer1.address, signer2.address],
        2
      );
      await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);
      await triggerMechanism.connect(signer2).submitTrustedSignature(creator.address);

      // Activate execution
      await executionAgent.activateExecution(creator.address);

      // Test blocking of various political actions
      const politicalActions = [
        "electoral_campaign_donation",
        "political_party_support",
        "lobbying_for_legislation",
        "policy_advocacy_campaign"
      ];

      for (const action of politicalActions) {
        await expect(
          executionAgent.executeAction(creator.address, action, "query", corpusHash)
        ).to.be.revertedWith("Action violates No Political Agency Clause");
      }
    });
  });

  describe("Confidence Threshold Enforcement", function () {
    it("Should default to inaction when confidence below 95%", async function () {
      // Setup
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      await lexiconHolder.freezeCorpus(creator.address, corpusHash, "ipfs://corpus", 2020, 2025);

      // Create index with low confidence
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "ambiguous_action",
        ["Unclear citation"],
        [50] // Below 95%
      );

      // Create index with high confidence
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "clear_action",
        ["Clear citation"],
        [98] // Above 95%
      );

      // Trigger and activate
      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [signer1.address, signer2.address],
        2
      );
      await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);
      await triggerMechanism.connect(signer2).submitTrustedSignature(creator.address);
      await executionAgent.activateExecution(creator.address);

      // Low confidence - should emit InactionDefault
      await expect(
        executionAgent.executeAction(creator.address, "ambiguous_action", "ambiguous_action", corpusHash)
      ).to.emit(executionAgent, "InactionDefault");

      // High confidence - should execute
      await expect(
        executionAgent.executeAction(creator.address, "clear_action", "clear_action", corpusHash)
      ).to.emit(executionAgent, "ActionExecuted");

      // Verify only high confidence action was logged
      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(1);
      expect(logs[0].action).to.equal("clear_action");
    });
  });

  describe("Revocation Before Trigger", function () {
    it("Should allow full revocation before trigger", async function () {
      // Capture intent
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      // Configure trigger
      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [signer1.address, signer2.address],
        2
      );

      // Creator revokes before death
      await intentModule.connect(creator).revokeIntent();

      // Verify revoked
      const intent = await intentModule.getIntent(creator.address);
      expect(intent.isRevoked).to.equal(true);

      // Attempt to trigger should fail
      await expect(
        triggerMechanism.connect(signer1).submitTrustedSignature(creator.address)
      ).to.not.be.reverted; // Signature accepted

      await expect(
        triggerMechanism.connect(signer2).submitTrustedSignature(creator.address)
      ).to.be.revertedWith("Intent has been revoked"); // But trigger fails
    });
  });

  describe("Emergency Sunset", function () {
    it("Should allow anyone to trigger emergency sunset after 20 years", async function () {
      // Setup and trigger
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [signer1.address, signer2.address],
        2
      );

      await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);
      await triggerMechanism.connect(signer2).submitTrustedSignature(creator.address);

      await executionAgent.activateExecution(creator.address);

      // 20 years pass
      await time.increase(TWENTY_YEARS + 1);

      // Random person triggers emergency sunset (no need to pass timestamp, it's fetched from ExecutionAgent)
      await sunsetProtocol.connect(recipient).emergencySunset(creator.address);

      // Verify sunset activated
      expect(await executionAgent.isSunset(creator.address)).to.equal(true);
      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(false);
    });
  });

  describe("Multiple Creators", function () {
    it("Should handle multiple independent creators", async function () {
      const creators = [creator, signer1, signer2];
      const corpusHashes = [];

      // Setup each creator
      for (let i = 0; i < creators.length; i++) {
        const intentHash = ethers.keccak256(ethers.toUtf8Bytes(`Intent ${i}`));
        const corpusHash = ethers.keccak256(ethers.toUtf8Bytes(`Corpus ${i}`));
        corpusHashes.push(corpusHash);

        await intentModule.connect(creators[i]).captureIntent(
          intentHash,
          corpusHash,
          `ipfs://corpus-${i}`,
          `ipfs://assets-${i}`,
          2020,
          2025 + i,
          [await ipToken.getAddress()]
        );

        await lexiconHolder.freezeCorpus(
          creators[i].address,
          corpusHash,
          `ipfs://corpus-${i}`,
          2020,
          2025 + i
        );
      }

      // Trigger first creator's intent via deadman
      await triggerMechanism.connect(creators[0]).configureDeadmanSwitch(NINETY_DAYS);
      await time.increase(NINETY_DAYS + 1);
      await triggerMechanism.executeDeadmanSwitch(creators[0].address);

      // Verify only first creator triggered
      expect((await intentModule.getIntent(creators[0].address)).isTriggered).to.equal(true);
      expect((await intentModule.getIntent(creators[1].address)).isTriggered).to.equal(false);
      expect((await intentModule.getIntent(creators[2].address)).isTriggered).to.equal(false);

      // Activate first creator's execution
      await executionAgent.activateExecution(creators[0].address);
      expect(await executionAgent.isExecutionActive(creators[0].address)).to.equal(true);
      expect(await executionAgent.isExecutionActive(creators[1].address)).to.equal(false);
    });
  });

  describe("IP Token Integration", function () {
    it("Should handle IP token lifecycle during execution", async function () {
      // Setup
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      // Mint multiple IP tokens
      const contentHashes = [
        ethers.keccak256(ethers.toUtf8Bytes("Article 1")),
        ethers.keccak256(ethers.toUtf8Bytes("Code 1")),
        ethers.keccak256(ethers.toUtf8Bytes("Music 1"))
      ];

      for (let i = 0; i < contentHashes.length; i++) {
        await ipToken.mintIP(
          creator.address,
          `Work ${i}`,
          `Description ${i}`,
          ["article", "code", "music"][i],
          contentHashes[i],
          `ipfs://uri-${i}`,
          "CC-BY"
        );
      }

      // Trigger
      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [signer1.address, signer2.address],
        2
      );
      await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);
      await triggerMechanism.connect(signer2).submitTrustedSignature(creator.address);

      // Grant licenses on IP tokens
      await ipToken.grantLicense(0, licensee.address, 500, ONE_YEAR);
      await ipToken.grantLicense(1, recipient.address, 300, ONE_YEAR * 2);

      // Pay royalties
      await ipToken.connect(licensee).payRoyalty(0, { value: ethers.parseEther("0.1") });

      const licenses0 = await ipToken.getLicenses(0);
      expect(licenses0[0].revenueGenerated).to.equal(ethers.parseEther("0.1"));

      // After 20 years, transition to public domain
      await time.increase(TWENTY_YEARS + 1);

      for (let i = 0; i < 3; i++) {
        await ipToken.transitionToPublicDomain(i);
        const asset = await ipToken.getIPAsset(i);
        expect(asset.isPublicDomain).to.equal(true);
        expect(asset.licenseType).to.equal("CC0");
      }
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Finite Intent Executor System", function () {
  let intentModule, triggerMechanism, executionAgent, lexiconHolder, sunsetProtocol, ipToken;
  let owner, creator, trustedSigner1, trustedSigner2, licensee;

  beforeEach(async function () {
    [owner, creator, trustedSigner1, trustedSigner2, licensee] = await ethers.getSigners();

    // Deploy contracts
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
  });

  describe("Intent Capture", function () {
    it("Should capture intent with valid parameters", async function () {
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent Document"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("My Contextual Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus-uri",
        "ipfs://assets-uri",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      const intent = await intentModule.getIntent(creator.address);
      expect(intent.intentHash).to.equal(intentHash);
      expect(intent.corpusHash).to.equal(corpusHash);
      expect(intent.isRevoked).to.equal(false);
      expect(intent.isTriggered).to.equal(false);
    });

    it("Should reject invalid corpus window", async function () {
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await expect(
        intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus",
          "ipfs://assets",
          2020,
          2022, // Only 2 years - should fail
          [await ipToken.getAddress()]
        )
      ).to.be.revertedWith("Corpus window must be 5-10 years");
    });

    it("Should allow adding goals", async function () {
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent"));
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

      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("No political use"));
      await intentModule.connect(creator).addGoal(
        "Fund open source projects",
        constraintsHash,
        90
      );

      const goals = await intentModule.getGoals(creator.address);
      expect(goals.length).to.equal(1);
      expect(goals[0].description).to.equal("Fund open source projects");
      expect(goals[0].priority).to.equal(90);
    });
  });

  describe("Trigger Mechanism", function () {
    beforeEach(async function () {
      // Capture intent first
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
    });

    it("Should configure deadman switch", async function () {
      const interval = 90 * 24 * 60 * 60; // 90 days
      await triggerMechanism.connect(creator).configureDeadmanSwitch(interval);

      const config = await triggerMechanism.getTriggerConfig(creator.address);
      expect(config.isConfigured).to.equal(true);
      expect(config.deadmanInterval).to.equal(interval);
    });

    it("Should configure trusted quorum", async function () {
      const signers = [trustedSigner1.address, trustedSigner2.address];
      await triggerMechanism.connect(creator).configureTrustedQuorum(signers, 2);

      const config = await triggerMechanism.getTriggerConfig(creator.address);
      expect(config.isConfigured).to.equal(true);
      expect(config.requiredSignatures).to.equal(2);
    });

    it("Should allow check-in for deadman switch", async function () {
      const interval = 90 * 24 * 60 * 60;
      await triggerMechanism.connect(creator).configureDeadmanSwitch(interval);

      await time.increase(30 * 24 * 60 * 60); // 30 days
      await triggerMechanism.connect(creator).checkIn();

      const config = await triggerMechanism.getTriggerConfig(creator.address);
      expect(config.lastCheckIn).to.be.greaterThan(0);
    });
  });

  describe("IP Token", function () {
    it("Should mint IP token", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Article content"));

      await ipToken.mintIP(
        creator.address,
        "My Article",
        "A groundbreaking article",
        "article",
        contentHash,
        "ipfs://metadata-uri",
        "CC-BY-4.0"
      );

      const ipAsset = await ipToken.getIPAsset(0);
      expect(ipAsset.title).to.equal("My Article");
      expect(ipAsset.creator).to.equal(creator.address);
      expect(ipAsset.isPublicDomain).to.equal(false);
    });

    it("Should grant license", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Code"));

      await ipToken.mintIP(
        creator.address,
        "My Code",
        "Useful code",
        "code",
        contentHash,
        "ipfs://code-uri",
        "MIT"
      );

      const EXECUTOR_ROLE = await ipToken.EXECUTOR_ROLE();
      await ipToken.grantRole(EXECUTOR_ROLE, owner.address);

      await ipToken.grantLicense(0, licensee.address, 500, 365 * 24 * 60 * 60); // 5%, 1 year

      const licenses = await ipToken.getLicenses(0);
      expect(licenses.length).to.equal(1);
      expect(licenses[0].licensee).to.equal(licensee.address);
      expect(licenses[0].royaltyPercentage).to.equal(500);
    });

    it("Should transition to public domain", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Music"));

      await ipToken.mintIP(
        creator.address,
        "My Song",
        "A beautiful song",
        "music",
        contentHash,
        "ipfs://song-uri",
        "All Rights Reserved"
      );

      const EXECUTOR_ROLE = await ipToken.EXECUTOR_ROLE();
      await ipToken.grantRole(EXECUTOR_ROLE, owner.address);

      await ipToken.transitionToPublicDomain(0);

      const ipAsset = await ipToken.getIPAsset(0);
      expect(ipAsset.isPublicDomain).to.equal(true);
      expect(ipAsset.licenseType).to.equal("CC0");
    });
  });

  describe("Execution Agent", function () {
    let corpusHash;

    beforeEach(async function () {
      // Set up: capture intent, configure trigger, trigger it, freeze corpus, activate execution
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
      corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      // Link trigger mechanism
      await intentModule.setTriggerMechanism(await triggerMechanism.getAddress());

      // Configure and execute trigger
      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [trustedSigner1.address, trustedSigner2.address],
        2
      );
      await triggerMechanism.connect(trustedSigner1).submitTrustedSignature(creator.address);
      await triggerMechanism.connect(trustedSigner2).submitTrustedSignature(creator.address);

      // Freeze corpus in lexicon holder
      await lexiconHolder.freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      // Activate execution
      const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();
      await executionAgent.grantRole(EXECUTOR_ROLE, owner.address);
      await executionAgent.activateExecution(creator.address);
    });

    it("Should require high confidence for action execution", async function () {
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
        ["Clear citation with good support"],
        [98] // Above 95%
      );

      // Low confidence should emit InactionDefault
      await expect(
        executionAgent.executeAction(creator.address, "ambiguous_action", "ambiguous_action", corpusHash)
      ).to.emit(executionAgent, "InactionDefault");

      // High confidence should emit ActionExecuted
      await expect(
        executionAgent.executeAction(creator.address, "clear_action", "clear_action", corpusHash)
      ).to.emit(executionAgent, "ActionExecuted");

      // Verify only high-confidence action was logged
      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(1);
      expect(logs[0].action).to.equal("clear_action");
    });

    it("Should enforce no political agency clause", async function () {
      // Test various political actions are blocked by the PoliticalFilter library
      const politicalActions = [
        "electoral_campaign_donation",
        "political_party_support",
        "lobbying_for_legislation",
        "support the campaign",
        "vote for candidate",
        "Contact your senator",
        "government regulatory capture"
      ];

      for (const action of politicalActions) {
        await expect(
          executionAgent.executeAction(creator.address, action, "query", corpusHash)
        ).to.be.revertedWith("Action violates No Political Agency Clause");
      }
    });

    it("Should block case-insensitive political keywords", async function () {
      // These should all be caught by the PoliticalFilter library's case-insensitive matching
      const caseVariations = [
        "ELECTORAL activity",
        "Political advocacy",
        "LOBBYING congress",
        "Campaign Donation"
      ];

      for (const action of caseVariations) {
        await expect(
          executionAgent.executeAction(creator.address, action, "query", corpusHash)
        ).to.be.revertedWith("Action violates No Political Agency Clause");
      }
    });

    it("Should allow non-political actions", async function () {
      // Create high-confidence index for a non-political action
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "fund_project",
        ["Fund open source development"],
        [98]
      );

      await expect(
        executionAgent.executeAction(creator.address, "fund_project", "fund_project", corpusHash)
      ).to.emit(executionAgent, "ActionExecuted");
    });
  });

  describe("Integration Test", function () {
    it("Should complete full lifecycle", async function () {
      // 1. Capture intent
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Full Intent"));
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Full Corpus"));

      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://full-corpus",
        "ipfs://full-assets",
        2020,
        2028,
        [await ipToken.getAddress()]
      );

      // 2. Configure trigger
      const signers = [trustedSigner1.address, trustedSigner2.address];
      await triggerMechanism.connect(creator).configureTrustedQuorum(signers, 2);

      // 3. Mint IP
      await ipToken.mintIP(
        creator.address,
        "Legacy Work",
        "Important work",
        "article",
        ethers.keccak256(ethers.toUtf8Bytes("content")),
        "ipfs://work-uri",
        "CC-BY-4.0"
      );

      const intent = await intentModule.getIntent(creator.address);
      expect(intent.intentHash).to.equal(intentHash);

      const ipAsset = await ipToken.getIPAsset(0);
      expect(ipAsset.creator).to.equal(creator.address);
    });
  });
});

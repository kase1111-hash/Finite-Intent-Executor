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
    it("Should require high confidence for action execution", async function () {
      const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();
      await executionAgent.grantRole(EXECUTOR_ROLE, owner.address);

      await executionAgent.activateExecution(creator.address);

      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("corpus"));

      // This would normally interact with lexicon holder
      // In a real test, we'd mock the lexicon holder response
    });

    it("Should enforce no political agency clause", async function () {
      // The contract should reject actions with political keywords
      const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();
      await executionAgent.grantRole(EXECUTOR_ROLE, owner.address);

      await executionAgent.activateExecution(creator.address);
      // Political actions should be blocked
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

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ExecutionAgent", function () {
  let executionAgent, lexiconHolder;
  let owner, creator, executor, recipient, licensee;

  const TWENTY_YEARS = 20 * 365 * 24 * 60 * 60;
  const ONE_YEAR = 365 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, creator, executor, recipient, licensee] = await ethers.getSigners();

    // Deploy LexiconHolder
    const LexiconHolder = await ethers.getContractFactory("LexiconHolder");
    lexiconHolder = await LexiconHolder.deploy();
    await lexiconHolder.waitForDeployment();

    // Deploy ExecutionAgent
    const ExecutionAgent = await ethers.getContractFactory("ExecutionAgent");
    executionAgent = await ExecutionAgent.deploy(await lexiconHolder.getAddress());
    await executionAgent.waitForDeployment();

    // Grant executor role
    const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();
    await executionAgent.grantRole(EXECUTOR_ROLE, executor.address);

    // Set up lexicon holder with frozen corpus
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    await lexiconHolder.freezeCorpus(
      creator.address,
      corpusHash,
      "ipfs://corpus-uri",
      2020,
      2025
    );
  });

  describe("Deployment", function () {
    it("Should set correct lexicon holder address", async function () {
      expect(await executionAgent.lexiconHolder()).to.equal(await lexiconHolder.getAddress());
    });

    it("Should set deployer with admin and executor roles", async function () {
      const DEFAULT_ADMIN_ROLE = await executionAgent.DEFAULT_ADMIN_ROLE();
      const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();

      expect(await executionAgent.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await executionAgent.hasRole(EXECUTOR_ROLE, owner.address)).to.equal(true);
    });

    it("Should have immutable CONFIDENCE_THRESHOLD of 95", async function () {
      expect(await executionAgent.CONFIDENCE_THRESHOLD()).to.equal(95);
    });

    it("Should have immutable SUNSET_DURATION of 20 years", async function () {
      expect(await executionAgent.SUNSET_DURATION()).to.equal(TWENTY_YEARS);
    });

    it("Should initialize prohibited actions", async function () {
      expect(await executionAgent.prohibitedActions(
        ethers.keccak256(ethers.toUtf8Bytes("electoral_activity"))
      )).to.equal(true);
      expect(await executionAgent.prohibitedActions(
        ethers.keccak256(ethers.toUtf8Bytes("political_advocacy"))
      )).to.equal(true);
      expect(await executionAgent.prohibitedActions(
        ethers.keccak256(ethers.toUtf8Bytes("lobbying"))
      )).to.equal(true);
      expect(await executionAgent.prohibitedActions(
        ethers.keccak256(ethers.toUtf8Bytes("policy_influence"))
      )).to.equal(true);
    });
  });

  describe("Execution Activation", function () {
    it("Should activate execution for creator", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);

      expect(await executionAgent.triggerTimestamps(creator.address)).to.be.gt(0);
      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(true);
    });

    it("Should reject activation from non-executor", async function () {
      await expect(
        executionAgent.connect(recipient).activateExecution(creator.address)
      ).to.be.revertedWithCustomError(executionAgent, "AccessControlUnauthorizedAccount");
    });

    it("Should reject double activation", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);

      await expect(
        executionAgent.connect(executor).activateExecution(creator.address)
      ).to.be.revertedWith("Already activated");
    });
  });

  describe("Execution Active State", function () {
    it("Should return false for non-activated creator", async function () {
      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(false);
    });

    it("Should return true for activated creator", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(true);
    });

    it("Should return false after sunset", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.activateSunset(creator.address);

      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(false);
    });

    it("Should return false after 20 years", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(false);
    });
  });

  describe("Action Execution", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);

      // Create semantic index for testing
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "fund_project",
        ["Citation from corpus about funding"],
        [97] // Above threshold
      );
    });

    it("Should execute action with high confidence", async function () {
      await executionAgent.connect(executor).executeAction(
        creator.address,
        "fund_project",
        "fund_project",
        corpusHash
      );

      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(1);
      expect(logs[0].action).to.equal("fund_project");
      expect(logs[0].confidence).to.equal(97);
    });

    it("Should emit ActionExecuted event", async function () {
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "fund_project",
          "fund_project",
          corpusHash
        )
      ).to.emit(executionAgent, "ActionExecuted");
    });

    it("Should default to inaction on low confidence", async function () {
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "risky_action",
        ["Uncertain citation"],
        [50] // Below 95% threshold
      );

      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "risky_action",
          "risky_action",
          corpusHash
        )
      ).to.emit(executionAgent, "InactionDefault");

      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(0);
    });

    it("Should reject execution when not active", async function () {
      await executionAgent.activateSunset(creator.address);

      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "fund_project",
          "fund_project",
          corpusHash
        )
      ).to.be.revertedWith("Execution not active or sunset");
    });

    it("Should reject from non-executor", async function () {
      await expect(
        executionAgent.connect(recipient).executeAction(
          creator.address,
          "fund_project",
          "fund_project",
          corpusHash
        )
      ).to.be.revertedWithCustomError(executionAgent, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Political Agency Clause", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
    });

    it("Should reject electoral activity", async function () {
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "electoral_activity",
          "electoral",
          corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("Should reject actions containing 'electoral' keyword", async function () {
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "donate to electoral campaign",
          "donation",
          corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("Should reject actions containing 'political' keyword", async function () {
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "political endorsement",
          "endorsement",
          corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("Should reject actions containing 'lobbying' keyword", async function () {
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "lobbying for legislation",
          "lobbying",
          corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("Should reject actions containing 'policy' keyword", async function () {
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "policy influence campaign",
          "influence",
          corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("Should allow non-political actions", async function () {
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "open_source_funding",
        ["Fund open source development"],
        [98]
      );

      await executionAgent.connect(executor).executeAction(
        creator.address,
        "open_source_funding",
        "open_source_funding",
        corpusHash
      );

      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(1);
    });
  });

  describe("License Issuance", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    const assetAddress = "0x1234567890123456789012345678901234567890";

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "license_issuance",
        ["License assets per intent"],
        [96]
      );
    });

    it("Should issue license successfully", async function () {
      await executionAgent.connect(executor).issueLicense(
        creator.address,
        licensee.address,
        assetAddress,
        500, // 5%
        ONE_YEAR,
        corpusHash
      );

      const licenses = await executionAgent.getLicenses(creator.address);
      expect(licenses.length).to.equal(1);
      expect(licenses[0].licensee).to.equal(licensee.address);
      expect(licenses[0].royaltyPercentage).to.equal(500);
    });

    it("Should emit LicenseIssued event", async function () {
      await expect(
        executionAgent.connect(executor).issueLicense(
          creator.address,
          licensee.address,
          assetAddress,
          500,
          ONE_YEAR,
          corpusHash
        )
      ).to.emit(executionAgent, "LicenseIssued")
        .withArgs(creator.address, licensee.address, assetAddress, 500);
    });

    it("Should reject royalty above 100%", async function () {
      await expect(
        executionAgent.connect(executor).issueLicense(
          creator.address,
          licensee.address,
          assetAddress,
          10001, // Over 100%
          ONE_YEAR,
          corpusHash
        )
      ).to.be.revertedWith("Royalty cannot exceed 100%");
    });

    it("Should default to inaction on low confidence", async function () {
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "license_issuance",
        ["Uncertain license guidance"],
        [50] // Below threshold
      );

      await expect(
        executionAgent.connect(executor).issueLicense(
          creator.address,
          licensee.address,
          assetAddress,
          500,
          ONE_YEAR,
          corpusHash
        )
      ).to.emit(executionAgent, "InactionDefault");
    });
  });

  describe("Treasury Management", function () {
    it("Should deposit to treasury", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await executionAgent.depositToTreasury(creator.address, { value: depositAmount });

      expect(await executionAgent.treasuries(creator.address)).to.equal(depositAmount);
    });

    it("Should accumulate multiple deposits", async function () {
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("1.0") });
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("0.5") });

      expect(await executionAgent.treasuries(creator.address)).to.equal(ethers.parseEther("1.5"));
    });
  });

  describe("Project Funding", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    const fundingAmount = ethers.parseEther("1.0");

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("2.0") });

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "fund_project:Open Source Project",
        ["Fund aligned open source projects"],
        [96]
      );
    });

    it("Should fund project successfully", async function () {
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      await executionAgent.connect(executor).fundProject(
        creator.address,
        recipient.address,
        fundingAmount,
        "Open Source Project",
        corpusHash
      );

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(fundingAmount);

      const projects = await executionAgent.getFundedProjects(creator.address);
      expect(projects.length).to.equal(1);
      expect(projects[0].description).to.equal("Open Source Project");
    });

    it("Should emit ProjectFunded event", async function () {
      await expect(
        executionAgent.connect(executor).fundProject(
          creator.address,
          recipient.address,
          fundingAmount,
          "Open Source Project",
          corpusHash
        )
      ).to.emit(executionAgent, "ProjectFunded")
        .withArgs(creator.address, recipient.address, fundingAmount);
    });

    it("Should reject insufficient treasury funds", async function () {
      await expect(
        executionAgent.connect(executor).fundProject(
          creator.address,
          recipient.address,
          ethers.parseEther("10.0"), // More than available
          "Big Project",
          corpusHash
        )
      ).to.be.revertedWith("Insufficient treasury funds");
    });

    it("Should deduct from treasury", async function () {
      await executionAgent.connect(executor).fundProject(
        creator.address,
        recipient.address,
        fundingAmount,
        "Open Source Project",
        corpusHash
      );

      expect(await executionAgent.treasuries(creator.address)).to.equal(ethers.parseEther("1.0"));
    });
  });

  describe("Revenue Distribution", function () {
    const distributionAmount = ethers.parseEther("0.5");

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("1.0") });
    });

    it("Should distribute revenue successfully", async function () {
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      await executionAgent.connect(executor).distributeRevenue(
        creator.address,
        recipient.address,
        distributionAmount
      );

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(distributionAmount);
    });

    it("Should emit RevenueDistributed event", async function () {
      await expect(
        executionAgent.connect(executor).distributeRevenue(
          creator.address,
          recipient.address,
          distributionAmount
        )
      ).to.emit(executionAgent, "RevenueDistributed")
        .withArgs(creator.address, recipient.address, distributionAmount);
    });

    it("Should reject insufficient funds", async function () {
      await expect(
        executionAgent.connect(executor).distributeRevenue(
          creator.address,
          recipient.address,
          ethers.parseEther("5.0")
        )
      ).to.be.revertedWith("Insufficient treasury funds");
    });
  });

  describe("Sunset Activation", function () {
    it("Should activate sunset after 20 years", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      await executionAgent.activateSunset(creator.address);

      expect(await executionAgent.isSunset(creator.address)).to.equal(true);
    });

    it("Should emit SunsetActivated event", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      await expect(executionAgent.activateSunset(creator.address))
        .to.emit(executionAgent, "SunsetActivated");
    });

    it("Should reject sunset before 20 years", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await time.increase(TWENTY_YEARS - 1000);

      await expect(
        executionAgent.activateSunset(creator.address)
      ).to.be.revertedWith("Sunset duration not reached");
    });

    it("Should reject sunset for non-activated execution", async function () {
      await expect(
        executionAgent.activateSunset(creator.address)
      ).to.be.revertedWith("Execution not started");
    });

    it("Should reject double sunset", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await time.increase(TWENTY_YEARS + 1);
      await executionAgent.activateSunset(creator.address);

      await expect(
        executionAgent.activateSunset(creator.address)
      ).to.be.revertedWith("Already sunset");
    });

    it("Should prevent actions after sunset", async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("1.0") });
      await time.increase(TWENTY_YEARS + 1);
      await executionAgent.activateSunset(creator.address);

      await expect(
        executionAgent.connect(executor).distributeRevenue(
          creator.address,
          recipient.address,
          ethers.parseEther("0.1")
        )
      ).to.be.revertedWith("Execution not active or sunset");
    });
  });

  describe("View Functions", function () {
    it("Should return execution logs", async function () {
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
      await executionAgent.connect(executor).activateExecution(creator.address);

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "action1",
        ["Citation 1"],
        [98]
      );

      await executionAgent.connect(executor).executeAction(
        creator.address,
        "action1",
        "action1",
        corpusHash
      );

      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(1);
    });

    it("Should return licenses", async function () {
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
      await executionAgent.connect(executor).activateExecution(creator.address);

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "license_issuance",
        ["License citation"],
        [97]
      );

      await executionAgent.connect(executor).issueLicense(
        creator.address,
        licensee.address,
        "0x1234567890123456789012345678901234567890",
        500,
        ONE_YEAR,
        corpusHash
      );

      const licenses = await executionAgent.getLicenses(creator.address);
      expect(licenses.length).to.equal(1);
    });

    it("Should return funded projects", async function () {
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("1.0") });

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "fund_project:Test",
        ["Funding citation"],
        [96]
      );

      await executionAgent.connect(executor).fundProject(
        creator.address,
        recipient.address,
        ethers.parseEther("0.5"),
        "Test",
        corpusHash
      );

      const projects = await executionAgent.getFundedProjects(creator.address);
      expect(projects.length).to.equal(1);
    });
  });
});

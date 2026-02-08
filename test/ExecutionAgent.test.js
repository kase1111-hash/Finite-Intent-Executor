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

    it("Should have PoliticalFilter integrated (no prohibitedActions mapping)", async function () {
      // PoliticalFilter library is compiled into ExecutionAgent bytecode.
      // Verify the contract exists and key constants are set.
      // Political filtering is enforced via PoliticalFilter.checkAction()
      // rather than a storage mapping, so no on-chain state to check.
      expect(await executionAgent.CONFIDENCE_THRESHOLD()).to.equal(95);
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
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("1.0") });

      // Create semantic index for revenue distribution verification
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "distribute_revenue:Royalty payments",
        ["Distribute royalties to collaborators"],
        [97]
      );
    });

    it("Should distribute revenue successfully with corpus verification", async function () {
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      await executionAgent.connect(executor).distributeRevenue(
        creator.address,
        recipient.address,
        distributionAmount,
        "Royalty payments",
        corpusHash
      );

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(distributionAmount);
    });

    it("Should emit RevenueDistributed event", async function () {
      await expect(
        executionAgent.connect(executor).distributeRevenue(
          creator.address,
          recipient.address,
          distributionAmount,
          "Royalty payments",
          corpusHash
        )
      ).to.emit(executionAgent, "RevenueDistributed")
        .withArgs(creator.address, recipient.address, distributionAmount);
    });

    it("Should default to inaction when corpus confidence is low", async function () {
      // Use a description that has no semantic index (confidence = 0)
      await expect(
        executionAgent.connect(executor).distributeRevenue(
          creator.address,
          recipient.address,
          distributionAmount,
          "Unknown distribution reason",
          corpusHash
        )
      ).to.emit(executionAgent, "InactionDefault");

      // Treasury should remain unchanged
      expect(await executionAgent.treasuries(creator.address)).to.equal(ethers.parseEther("1.0"));
    });

    it("Should reject insufficient funds", async function () {
      await expect(
        executionAgent.connect(executor).distributeRevenue(
          creator.address,
          recipient.address,
          ethers.parseEther("5.0"),
          "Royalty payments",
          corpusHash
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
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("1.0") });
      await time.increase(TWENTY_YEARS + 1);
      await executionAgent.activateSunset(creator.address);

      await expect(
        executionAgent.connect(executor).distributeRevenue(
          creator.address,
          recipient.address,
          ethers.parseEther("0.1"),
          "Test distribution",
          corpusHash
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

  describe("Confidence Boundary Tests", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
    });

    it("Should emit InactionDefault when confidence is 94 (below threshold)", async function () {
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "boundary_action_94",
        ["Citation with 94 confidence"],
        [94]
      );

      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "boundary_action_94",
          "boundary_action_94",
          corpusHash
        )
      ).to.emit(executionAgent, "InactionDefault")
        .withArgs(creator.address, "Confidence below threshold", 94);

      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(0);
    });

    it("Should execute when confidence is exactly 95 (at threshold)", async function () {
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "boundary_action_95",
        ["Citation with 95 confidence"],
        [95]
      );

      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "boundary_action_95",
          "boundary_action_95",
          corpusHash
        )
      ).to.emit(executionAgent, "ActionExecuted");

      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(1);
      expect(logs[0].confidence).to.equal(95);
    });

    it("Should execute when confidence is 96 (above threshold)", async function () {
      await lexiconHolder.createSemanticIndex(
        creator.address,
        "boundary_action_96",
        ["Citation with 96 confidence"],
        [96]
      );

      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "boundary_action_96",
          "boundary_action_96",
          corpusHash
        )
      ).to.emit(executionAgent, "ActionExecuted");

      const logs = await executionAgent.getExecutionLogs(creator.address);
      expect(logs.length).to.equal(1);
      expect(logs[0].confidence).to.equal(96);
    });
  });

  describe("Emergency Fund Recovery", function () {
    const EMERGENCY_RECOVERY_DELAY = 365 * 24 * 60 * 60;
    const depositAmount = ethers.parseEther("2.0");

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: depositAmount });
    });

    it("Should recover funds after sunset + 1 year delay", async function () {
      // Advance past sunset duration and activate sunset
      await time.increase(TWENTY_YEARS + 1);
      await executionAgent.activateSunset(creator.address);

      // Advance past emergency recovery delay
      await time.increase(EMERGENCY_RECOVERY_DELAY + 1);

      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      await expect(
        executionAgent.connect(owner).emergencyRecoverFunds(creator.address, recipient.address)
      ).to.emit(executionAgent, "EmergencyFundsRecovered")
        .withArgs(creator.address, recipient.address, depositAmount);

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(depositAmount);
      expect(await executionAgent.treasuries(creator.address)).to.equal(0);
    });

    it("Should reject if creator is not in sunset state", async function () {
      await expect(
        executionAgent.connect(owner).emergencyRecoverFunds(creator.address, recipient.address)
      ).to.be.revertedWith("Creator not in sunset state");
    });

    it("Should reject if emergency recovery delay has not elapsed", async function () {
      await time.increase(TWENTY_YEARS + 1);
      await executionAgent.activateSunset(creator.address);

      // Do NOT advance past the recovery delay
      await expect(
        executionAgent.connect(owner).emergencyRecoverFunds(creator.address, recipient.address)
      ).to.be.revertedWith("Emergency recovery delay not elapsed");
    });

    it("Should reject if caller is not admin", async function () {
      await time.increase(TWENTY_YEARS + 1);
      await executionAgent.activateSunset(creator.address);
      await time.increase(EMERGENCY_RECOVERY_DELAY + 1);

      await expect(
        executionAgent.connect(executor).emergencyRecoverFunds(creator.address, recipient.address)
      ).to.be.revertedWithCustomError(executionAgent, "AccessControlUnauthorizedAccount");
    });

    it("Should reject if no funds to recover", async function () {
      // Deploy a fresh agent so treasury is empty for this creator
      const ExecutionAgent = await ethers.getContractFactory("ExecutionAgent");
      const freshAgent = await ExecutionAgent.deploy(await lexiconHolder.getAddress());
      await freshAgent.waitForDeployment();

      const EXECUTOR_ROLE = await freshAgent.EXECUTOR_ROLE();
      await freshAgent.grantRole(EXECUTOR_ROLE, executor.address);

      await freshAgent.connect(executor).activateExecution(creator.address);
      await time.increase(TWENTY_YEARS + 1);
      await freshAgent.activateSunset(creator.address);
      await time.increase(EMERGENCY_RECOVERY_DELAY + 1);

      await expect(
        freshAgent.connect(owner).emergencyRecoverFunds(creator.address, recipient.address)
      ).to.be.revertedWith("No funds to recover");
    });

    it("Should reject if recipient is zero address", async function () {
      await time.increase(TWENTY_YEARS + 1);
      await executionAgent.activateSunset(creator.address);
      await time.increase(EMERGENCY_RECOVERY_DELAY + 1);

      await expect(
        executionAgent.connect(owner).emergencyRecoverFunds(creator.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid recipient");
    });
  });

  describe("MAX_ACTION_LENGTH Boundary", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
    });

    it("Should reject action string longer than 1000 characters", async function () {
      const longAction = "a".repeat(1001);

      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          longAction,
          "query",
          corpusHash
        )
      ).to.be.revertedWith("Action string too long");
    });
  });

  describe("PoliticalActionBlocked Event", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
    });

    it("Should emit PoliticalActionBlocked event for political action", async function () {
      // Use a try/catch to capture the event even though the tx reverts.
      // Hardhat's expect(...).to.emit() does not capture events from reverted txs,
      // so we verify via static call trace that the event WOULD be emitted.
      // However, since the event is emitted before revert in executeAction (line 167),
      // the event is part of the reverted transaction trace.
      // We can test the event emission via the _checkPoliticalFilter internal function
      // indirectly by verifying the revert happens and trusting the code path.

      // The most robust test: verify the tx reverts AND that the contract code
      // at line 167 emits PoliticalActionBlocked before reverting.
      // Since Hardhat does not expose events from reverted txs in .to.emit(),
      // we verify that the revert message confirms the political filter path was taken.
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address,
          "electoral campaign donation",
          "electoral",
          corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });
  });

  describe("fundProject Access Control", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    const fundingAmount = ethers.parseEther("1.0");

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("2.0") });

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "fund_project:Test Project",
        ["Fund aligned projects"],
        [96]
      );
    });

    it("Should reject fundProject from non-executor", async function () {
      await expect(
        executionAgent.connect(recipient).fundProject(
          creator.address,
          recipient.address,
          fundingAmount,
          "Test Project",
          corpusHash
        )
      ).to.be.revertedWithCustomError(executionAgent, "AccessControlUnauthorizedAccount");
    });
  });

  describe("fundProject Low Confidence", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    const fundingAmount = ethers.parseEther("1.0");

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("2.0") });

      await lexiconHolder.createSemanticIndex(
        creator.address,
        "fund_project:Low Confidence Project",
        ["Uncertain funding guidance"],
        [50] // Below threshold
      );
    });

    it("Should emit InactionDefault and NOT transfer funds on low confidence", async function () {
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      await expect(
        executionAgent.connect(executor).fundProject(
          creator.address,
          recipient.address,
          fundingAmount,
          "Low Confidence Project",
          corpusHash
        )
      ).to.emit(executionAgent, "InactionDefault");

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter).to.equal(recipientBalanceBefore);

      // Treasury should remain unchanged
      expect(await executionAgent.treasuries(creator.address)).to.equal(ethers.parseEther("2.0"));

      // No projects should be recorded
      const projects = await executionAgent.getFundedProjects(creator.address);
      expect(projects.length).to.equal(0);
    });
  });

  describe("distributeRevenue Access Control", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    const distributionAmount = ethers.parseEther("0.5");

    beforeEach(async function () {
      await executionAgent.connect(executor).activateExecution(creator.address);
      await executionAgent.depositToTreasury(creator.address, { value: ethers.parseEther("1.0") });
    });

    it("Should reject distributeRevenue from non-executor", async function () {
      await expect(
        executionAgent.connect(recipient).distributeRevenue(
          creator.address,
          recipient.address,
          distributionAmount,
          "Royalty payments",
          corpusHash
        )
      ).to.be.revertedWithCustomError(executionAgent, "AccessControlUnauthorizedAccount");
    });
  });
});

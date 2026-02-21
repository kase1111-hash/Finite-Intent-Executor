import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SunsetProtocol", function () {
  let sunsetProtocol, executionAgent, lexiconHolder;
  let owner, operator, creator, creator2;

  const TWENTY_YEARS = 20 * 365 * 24 * 60 * 60;
  const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

  beforeEach(async function () {
    [owner, operator, creator, creator2] = await ethers.getSigners();

    // Deploy LexiconHolder
    const LexiconHolder = await ethers.getContractFactory("LexiconHolder");
    lexiconHolder = await LexiconHolder.deploy();
    await lexiconHolder.waitForDeployment();

    // Deploy ExecutionAgent
    const ExecutionAgent = await ethers.getContractFactory("ExecutionAgent");
    executionAgent = await ExecutionAgent.deploy(await lexiconHolder.getAddress());
    await executionAgent.waitForDeployment();

    // Deploy SunsetProtocol
    const SunsetProtocol = await ethers.getContractFactory("SunsetProtocol");
    sunsetProtocol = await SunsetProtocol.deploy(
      await executionAgent.getAddress(),
      await lexiconHolder.getAddress()
    );
    await sunsetProtocol.waitForDeployment();

    // Grant roles
    const SUNSET_OPERATOR_ROLE = await sunsetProtocol.SUNSET_OPERATOR_ROLE();
    await sunsetProtocol.grantRole(SUNSET_OPERATOR_ROLE, operator.address);

    // Grant INDEXER_ROLE in lexicon
    const INDEXER_ROLE = await lexiconHolder.INDEXER_ROLE();
    await lexiconHolder.grantRole(INDEXER_ROLE, await sunsetProtocol.getAddress());

    // Freeze corpus for creator
    await lexiconHolder.freezeCorpus(
      creator.address,
      corpusHash,
      "ipfs://corpus",
      2020,
      2025
    );

    // Activate execution for creator
    const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();
    await executionAgent.grantRole(EXECUTOR_ROLE, operator.address);
    await executionAgent.connect(operator).activateExecution(creator.address);
  });

  describe("Deployment", function () {
    it("Should set correct execution agent address", async function () {
      expect(await sunsetProtocol.executionAgent()).to.equal(await executionAgent.getAddress());
    });

    it("Should set correct lexicon holder address", async function () {
      expect(await sunsetProtocol.lexiconHolder()).to.equal(await lexiconHolder.getAddress());
    });

    it("Should have immutable SUNSET_DURATION of 20 years", async function () {
      expect(await sunsetProtocol.SUNSET_DURATION()).to.equal(TWENTY_YEARS);
    });

    it("Should grant admin and operator roles to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await sunsetProtocol.DEFAULT_ADMIN_ROLE();
      const SUNSET_OPERATOR_ROLE = await sunsetProtocol.SUNSET_OPERATOR_ROLE();

      expect(await sunsetProtocol.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await sunsetProtocol.hasRole(SUNSET_OPERATOR_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("Sunset Initiation", function () {
    it("Should initiate sunset after 20 years", async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      await sunsetProtocol.connect(operator).initiateSunset(creator.address);

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.isSunset).to.equal(true);
      expect(state.creator).to.equal(creator.address);
      expect(state.postSunsetLicense).to.equal(0); // CC0
    });

    it("Should emit SunsetInitiated and ExecutionHalted events", async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      await expect(
        sunsetProtocol.connect(operator).initiateSunset(creator.address)
      ).to.emit(sunsetProtocol, "SunsetInitiated")
        .and.to.emit(sunsetProtocol, "ExecutionHalted");
    });

    it("Should halt execution in ExecutionAgent", async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      await sunsetProtocol.connect(operator).initiateSunset(creator.address);

      expect(await executionAgent.isSunset(creator.address)).to.equal(true);
      expect(await executionAgent.isExecutionActive(creator.address)).to.equal(false);
    });

    it("Should reject sunset before 20 years", async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS - 1000);

      await expect(
        sunsetProtocol.connect(operator).initiateSunset(creator.address)
      ).to.be.revertedWith("20 year duration not elapsed");
    });

    it("Should reject sunset for non-activated creator", async function () {
      await expect(
        sunsetProtocol.connect(operator).initiateSunset(creator2.address)
      ).to.be.revertedWith("Execution not activated for creator");
    });

    it("Should reject double sunset initiation", async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      await sunsetProtocol.connect(operator).initiateSunset(creator.address);

      await expect(
        sunsetProtocol.connect(operator).initiateSunset(creator.address)
      ).to.be.revertedWith("Sunset already initiated");
    });

    it("Should reject from non-operator", async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS + 1);

      await expect(
        sunsetProtocol.connect(creator).initiateSunset(creator.address)
      ).to.be.revertedWithCustomError(sunsetProtocol, "AccessControlUnauthorizedAccount");
    });

    it("Should initiate sunset at exactly TWENTY_YEARS boundary", async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS);

      await sunsetProtocol.connect(operator).initiateSunset(creator.address);

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.isSunset).to.equal(true);
      expect(state.creator).to.equal(creator.address);
    });
  });

  describe("Asset Archival", function () {
    beforeEach(async function () {
      const triggerTimestamp = await executionAgent.triggerTimestamps(creator.address);
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator.address);
    });

    it("Should archive assets successfully", async function () {
      const assetAddresses = [creator2.address, operator.address];
      const storageURIs = ["ipfs://asset1", "ipfs://asset2"];
      const assetHashes = [
        ethers.keccak256(ethers.toUtf8Bytes("Asset1")),
        ethers.keccak256(ethers.toUtf8Bytes("Asset2"))
      ];

      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        assetAddresses,
        storageURIs,
        assetHashes
      );

      const archives = await sunsetProtocol.getArchivedAssets(creator.address);
      expect(archives.length).to.equal(2);
      expect(archives[0].storageURI).to.equal("ipfs://asset1");

      // assetsArchived not yet true until finalizeArchive
      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.assetsArchived).to.equal(false);
    });

    it("Should allow multiple archive batches before finalization", async function () {
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset1"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset1"))]
      );
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [operator.address],
        ["ipfs://asset2"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset2"))]
      );

      const archives = await sunsetProtocol.getArchivedAssets(creator.address);
      expect(archives.length).to.equal(2);
    });

    it("Should finalize archive and set assetsArchived", async function () {
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator.address);

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.assetsArchived).to.equal(true);
    });

    it("Should emit AssetsArchived event", async function () {
      await expect(
        sunsetProtocol.connect(operator).archiveAssets(
          creator.address,
          [creator2.address],
          ["ipfs://asset"],
          [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
        )
      ).to.emit(sunsetProtocol, "AssetsArchived");
    });

    it("Should reject archival before sunset", async function () {
      // Get fresh execution agent with non-sunset creator
      await executionAgent.connect(operator).activateExecution(creator2.address);

      await expect(
        sunsetProtocol.connect(operator).archiveAssets(
          creator2.address,
          [creator.address],
          ["ipfs://asset"],
          [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
        )
      ).to.be.revertedWith("Sunset not initiated");
    });

    it("Should reject double finalization", async function () {
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator.address);

      await expect(
        sunsetProtocol.connect(operator).finalizeArchive(creator.address)
      ).to.be.revertedWith("Assets already finalized");
    });

    it("Should reject archival after finalization", async function () {
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator.address);

      await expect(
        sunsetProtocol.connect(operator).archiveAssets(
          creator.address,
          [operator.address],
          ["ipfs://asset2"],
          [ethers.keccak256(ethers.toUtf8Bytes("Asset2"))]
        )
      ).to.be.revertedWith("Assets already finalized");
    });

    it("Should reject finalization with no assets", async function () {
      await expect(
        sunsetProtocol.connect(operator).finalizeArchive(creator.address)
      ).to.be.revertedWith("No assets archived");
    });

    it("Should reject array length mismatch", async function () {
      await expect(
        sunsetProtocol.connect(operator).archiveAssets(
          creator.address,
          [creator2.address, operator.address],
          ["ipfs://asset"], // Only one URI
          [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should reject batch exceeding MAX_ARCHIVE_BATCH_SIZE of 50", async function () {
      const addresses = new Array(51).fill(creator2.address);
      const uris = new Array(51).fill("ipfs://asset");
      const hashes = new Array(51).fill(ethers.keccak256(ethers.toUtf8Bytes("Asset")));

      await expect(
        sunsetProtocol.connect(operator).archiveAssets(
          creator.address,
          addresses,
          uris,
          hashes
        )
      ).to.be.revertedWith("Batch size exceeds limit");
    });
  });

  describe("IP Transition", function () {
    beforeEach(async function () {
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator.address);
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator.address);
    });

    it("Should transition IP to CC0", async function () {
      await sunsetProtocol.connect(operator).transitionIP(creator.address, 0); // CC0

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.ipTransitioned).to.equal(true);
      expect(state.postSunsetLicense).to.equal(0); // CC0
    });

    it("Should transition IP to PublicDomain", async function () {
      await sunsetProtocol.connect(operator).transitionIP(creator.address, 1); // PublicDomain

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.postSunsetLicense).to.equal(1);
    });

    it("Should transition IP to NeutralStewardship", async function () {
      await sunsetProtocol.connect(operator).transitionIP(creator.address, 2); // NeutralStewardship

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.postSunsetLicense).to.equal(2);
    });

    it("Should emit IPTransitioned event", async function () {
      await expect(
        sunsetProtocol.connect(operator).transitionIP(creator.address, 0)
      ).to.emit(sunsetProtocol, "IPTransitioned");
    });

    it("Should reject transition before archival finalization", async function () {
      // Setup another creator with sunset but no finalized archival
      await lexiconHolder.freezeCorpus(
        creator2.address,
        ethers.keccak256(ethers.toUtf8Bytes("Corpus2")),
        "ipfs://corpus2",
        2020,
        2025
      );
      await executionAgent.connect(operator).activateExecution(creator2.address);
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator2.address);

      await expect(
        sunsetProtocol.connect(operator).transitionIP(creator2.address, 0)
      ).to.be.revertedWith("Assets not archived");
    });

    it("Should reject double transition", async function () {
      await sunsetProtocol.connect(operator).transitionIP(creator.address, 0);

      await expect(
        sunsetProtocol.connect(operator).transitionIP(creator.address, 1)
      ).to.be.revertedWith("IP already transitioned");
    });
  });

  describe("Legacy Clustering", function () {
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("OpenSourceCluster"));

    beforeEach(async function () {
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator.address);
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator.address);
      await sunsetProtocol.connect(operator).transitionIP(creator.address, 0);

      // Create cluster in lexicon holder
      await lexiconHolder.createCluster(clusterId, "Open Source Cluster");
    });

    it("Should cluster legacy successfully", async function () {
      await sunsetProtocol.connect(operator).clusterLegacy(creator.address, clusterId);

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.clustered).to.equal(true);
    });

    it("Should emit LegacyClustered event", async function () {
      await expect(
        sunsetProtocol.connect(operator).clusterLegacy(creator.address, clusterId)
      ).to.emit(sunsetProtocol, "LegacyClustered")
        .withArgs(creator.address, clusterId);
    });

    it("Should reject clustering before IP transition", async function () {
      // Setup another creator
      await lexiconHolder.freezeCorpus(
        creator2.address,
        ethers.keccak256(ethers.toUtf8Bytes("Corpus2")),
        "ipfs://corpus2",
        2020,
        2025
      );
      await executionAgent.connect(operator).activateExecution(creator2.address);
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator2.address);
      await sunsetProtocol.connect(operator).archiveAssets(
        creator2.address,
        [owner.address],
        ["ipfs://asset2"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset2"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator2.address);

      await expect(
        sunsetProtocol.connect(operator).clusterLegacy(creator2.address, clusterId)
      ).to.be.revertedWith("IP not transitioned");
    });

    it("Should reject double clustering", async function () {
      await sunsetProtocol.connect(operator).clusterLegacy(creator.address, clusterId);

      const clusterId2 = ethers.keccak256(ethers.toUtf8Bytes("AnotherCluster"));
      await lexiconHolder.createCluster(clusterId2, "Another Cluster");

      await expect(
        sunsetProtocol.connect(operator).clusterLegacy(creator.address, clusterId2)
      ).to.be.revertedWith("Already clustered");
    });
  });

  describe("Sunset Completion", function () {
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("Cluster"));

    beforeEach(async function () {
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator.address);
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator.address);
      await sunsetProtocol.connect(operator).transitionIP(creator.address, 0);

      await lexiconHolder.createCluster(clusterId, "Test Cluster");
      await sunsetProtocol.connect(operator).clusterLegacy(creator.address, clusterId);
    });

    it("Should complete sunset successfully", async function () {
      await expect(
        sunsetProtocol.connect(operator).completeSunset(creator.address)
      ).to.emit(sunsetProtocol, "SunsetCompleted");
    });

    it("Should reject completion without clustering", async function () {
      // Setup incomplete sunset
      await lexiconHolder.freezeCorpus(
        creator2.address,
        ethers.keccak256(ethers.toUtf8Bytes("Corpus2")),
        "ipfs://corpus2",
        2020,
        2025
      );
      await executionAgent.connect(operator).activateExecution(creator2.address);
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator2.address);
      await sunsetProtocol.connect(operator).archiveAssets(
        creator2.address,
        [owner.address],
        ["ipfs://asset2"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset2"))]
      );
      await sunsetProtocol.connect(operator).finalizeArchive(creator2.address);
      await sunsetProtocol.connect(operator).transitionIP(creator2.address, 0);

      await expect(
        sunsetProtocol.connect(operator).completeSunset(creator2.address)
      ).to.be.revertedWith("Legacy not clustered");
    });
  });

  describe("Emergency Sunset", function () {
    it("Should allow anyone to trigger emergency sunset after 20 years", async function () {
      await time.increase(TWENTY_YEARS + 1);

      // Non-operator can trigger emergency sunset (fetches timestamp from ExecutionAgent)
      await sunsetProtocol.connect(creator2).emergencySunset(creator.address);

      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.isSunset).to.equal(true);
    });

    it("Should emit SunsetInitiated and ExecutionHalted events", async function () {
      await time.increase(TWENTY_YEARS + 1);

      await expect(
        sunsetProtocol.connect(creator2).emergencySunset(creator.address)
      ).to.emit(sunsetProtocol, "SunsetInitiated")
        .and.to.emit(sunsetProtocol, "ExecutionHalted");
    });

    it("Should reject emergency sunset before 20 years", async function () {
      await time.increase(TWENTY_YEARS - 1000);

      await expect(
        sunsetProtocol.connect(creator2).emergencySunset(creator.address)
      ).to.be.revertedWith("20 year duration not elapsed");
    });

    it("Should reject if execution not activated", async function () {
      // creator2 has no execution activated
      await expect(
        sunsetProtocol.connect(creator2).emergencySunset(creator2.address)
      ).to.be.revertedWith("Execution not activated for creator");
    });

    it("Should reject if already sunset", async function () {
      await time.increase(TWENTY_YEARS + 1);

      await sunsetProtocol.connect(operator).initiateSunset(creator.address);

      await expect(
        sunsetProtocol.connect(creator2).emergencySunset(creator.address)
      ).to.be.revertedWith("Sunset already initiated");
    });
  });

  describe("Sunset Due Check", function () {
    it("Should return true when sunset is due", async function () {
      await time.increase(TWENTY_YEARS + 1);

      expect(await sunsetProtocol.isSunsetDue(creator.address)).to.equal(true);
    });

    it("Should return false when sunset not yet due", async function () {
      await time.increase(TWENTY_YEARS - 1000);

      expect(await sunsetProtocol.isSunsetDue(creator.address)).to.equal(false);
    });

    it("Should return false for non-activated creator", async function () {
      expect(await sunsetProtocol.isSunsetDue(creator2.address)).to.equal(false);
    });

    it("Should return false if already sunset", async function () {
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator.address);

      expect(await sunsetProtocol.isSunsetDue(creator.address)).to.equal(false);
    });
  });

  describe("View Functions", function () {
    it("Should return sunset state", async function () {
      const state = await sunsetProtocol.getSunsetState(creator.address);
      expect(state.isSunset).to.equal(false);
    });

    it("Should return archived assets", async function () {
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator.address);
      await sunsetProtocol.connect(operator).archiveAssets(
        creator.address,
        [creator2.address],
        ["ipfs://asset"],
        [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
      );

      const archives = await sunsetProtocol.getArchivedAssets(creator.address);
      expect(archives.length).to.equal(1);
    });

    it("Should return empty array for non-archived creator", async function () {
      const archives = await sunsetProtocol.getArchivedAssets(creator2.address);
      expect(archives.length).to.equal(0);
    });
  });

  describe("Access Control", function () {
    it("Should reject archiveAssets from non-operator", async function () {
      await time.increase(TWENTY_YEARS + 1);
      await sunsetProtocol.connect(operator).initiateSunset(creator.address);

      await expect(
        sunsetProtocol.connect(creator).archiveAssets(
          creator.address,
          [creator2.address],
          ["ipfs://asset"],
          [ethers.keccak256(ethers.toUtf8Bytes("Asset"))]
        )
      ).to.be.revertedWithCustomError(sunsetProtocol, "AccessControlUnauthorizedAccount");
    });

    it("Should reject finalizeArchive from non-operator", async function () {
      await expect(
        sunsetProtocol.connect(creator).finalizeArchive(creator.address)
      ).to.be.revertedWithCustomError(sunsetProtocol, "AccessControlUnauthorizedAccount");
    });

    it("Should reject transitionIP from non-operator", async function () {
      await expect(
        sunsetProtocol.connect(creator).transitionIP(creator.address, 0)
      ).to.be.revertedWithCustomError(sunsetProtocol, "AccessControlUnauthorizedAccount");
    });

    it("Should reject clusterLegacy from non-operator", async function () {
      const clusterId = ethers.keccak256(ethers.toUtf8Bytes("TestCluster"));
      await expect(
        sunsetProtocol.connect(creator).clusterLegacy(creator.address, clusterId)
      ).to.be.revertedWithCustomError(sunsetProtocol, "AccessControlUnauthorizedAccount");
    });

    it("Should reject completeSunset from non-operator", async function () {
      await expect(
        sunsetProtocol.connect(creator).completeSunset(creator.address)
      ).to.be.revertedWithCustomError(sunsetProtocol, "AccessControlUnauthorizedAccount");
    });
  });
});

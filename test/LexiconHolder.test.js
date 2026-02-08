const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LexiconHolder", function () {
  let lexiconHolder;
  let owner, indexer, creator, creator2;

  beforeEach(async function () {
    [owner, indexer, creator, creator2] = await ethers.getSigners();

    const LexiconHolder = await ethers.getContractFactory("LexiconHolder");
    lexiconHolder = await LexiconHolder.deploy();
    await lexiconHolder.waitForDeployment();

    // Grant indexer role
    const INDEXER_ROLE = await lexiconHolder.INDEXER_ROLE();
    await lexiconHolder.grantRole(INDEXER_ROLE, indexer.address);
  });

  describe("Deployment", function () {
    it("Should grant admin role to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await lexiconHolder.DEFAULT_ADMIN_ROLE();
      expect(await lexiconHolder.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });

    it("Should grant indexer role to deployer", async function () {
      const INDEXER_ROLE = await lexiconHolder.INDEXER_ROLE();
      expect(await lexiconHolder.hasRole(INDEXER_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("Corpus Freezing", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus Content"));

    it("Should freeze corpus successfully", async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus-uri",
        2020,
        2025
      );

      const corpus = await lexiconHolder.getCorpus(creator.address);
      expect(corpus.corpusHash).to.equal(corpusHash);
      expect(corpus.storageURI).to.equal("ipfs://corpus-uri");
      expect(corpus.startYear).to.equal(2020);
      expect(corpus.endYear).to.equal(2025);
      expect(corpus.isFrozen).to.equal(true);
    });

    it("Should emit CorpusFrozen event", async function () {
      await expect(
        lexiconHolder.connect(indexer).freezeCorpus(
          creator.address,
          corpusHash,
          "ipfs://corpus-uri",
          2020,
          2025
        )
      ).to.emit(lexiconHolder, "CorpusFrozen")
        .withArgs(creator.address, corpusHash, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
    });

    it("Should reject double freezing", async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus-uri",
        2020,
        2025
      );

      const newHash = ethers.keccak256(ethers.toUtf8Bytes("New Corpus"));
      await expect(
        lexiconHolder.connect(indexer).freezeCorpus(
          creator.address,
          newHash,
          "ipfs://new-corpus-uri",
          2021,
          2026
        )
      ).to.be.revertedWith("Corpus already frozen");
    });

    it("Should reject invalid time window", async function () {
      await expect(
        lexiconHolder.connect(indexer).freezeCorpus(
          creator.address,
          corpusHash,
          "ipfs://corpus-uri",
          2025,
          2020 // End before start
        )
      ).to.be.revertedWith("Invalid time window");
    });

    it("Should reject same start and end year", async function () {
      await expect(
        lexiconHolder.connect(indexer).freezeCorpus(
          creator.address,
          corpusHash,
          "ipfs://corpus-uri",
          2025,
          2025
        )
      ).to.be.revertedWith("Invalid time window");
    });

    it("Should reject from non-indexer", async function () {
      await expect(
        lexiconHolder.connect(creator).freezeCorpus(
          creator.address,
          corpusHash,
          "ipfs://corpus-uri",
          2020,
          2025
        )
      ).to.be.revertedWithCustomError(lexiconHolder, "AccessControlUnauthorizedAccount");
    });

    it("Should allow multiple creators to have frozen corpus", async function () {
      const corpus1Hash = ethers.keccak256(ethers.toUtf8Bytes("Corpus 1"));
      const corpus2Hash = ethers.keccak256(ethers.toUtf8Bytes("Corpus 2"));

      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpus1Hash,
        "ipfs://corpus1",
        2020,
        2025
      );

      await lexiconHolder.connect(indexer).freezeCorpus(
        creator2.address,
        corpus2Hash,
        "ipfs://corpus2",
        2021,
        2028
      );

      const corpus1 = await lexiconHolder.getCorpus(creator.address);
      const corpus2 = await lexiconHolder.getCorpus(creator2.address);

      expect(corpus1.corpusHash).to.equal(corpus1Hash);
      expect(corpus2.corpusHash).to.equal(corpus2Hash);
    });
  });

  describe("Semantic Index Creation", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );
    });

    it("Should create semantic index", async function () {
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "funding",
        ["Citation 1", "Citation 2"],
        [90, 85]
      );

      const index = await lexiconHolder.getSemanticIndex(creator.address, "funding");
      expect(index.keyword).to.equal("funding");
      expect(index.citations.length).to.equal(2);
      expect(index.citations[0]).to.equal("Citation 1");
      expect(index.relevanceScores[0]).to.equal(90);
    });

    it("Should emit SemanticIndexCreated event", async function () {
      await expect(
        lexiconHolder.connect(indexer).createSemanticIndex(
          creator.address,
          "licensing",
          ["License citation"],
          [95]
        )
      ).to.emit(lexiconHolder, "SemanticIndexCreated")
        .withArgs(creator.address, "licensing");
    });

    it("Should reject if corpus not frozen", async function () {
      await expect(
        lexiconHolder.connect(indexer).createSemanticIndex(
          creator2.address, // No frozen corpus
          "keyword",
          ["citation"],
          [80]
        )
      ).to.be.revertedWith("Corpus not frozen");
    });

    it("Should reject array length mismatch", async function () {
      await expect(
        lexiconHolder.connect(indexer).createSemanticIndex(
          creator.address,
          "keyword",
          ["Citation 1", "Citation 2"],
          [80] // Only one score
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should reject from non-indexer", async function () {
      await expect(
        lexiconHolder.connect(creator).createSemanticIndex(
          creator.address,
          "keyword",
          ["citation"],
          [80]
        )
      ).to.be.revertedWithCustomError(lexiconHolder, "AccessControlUnauthorizedAccount");
    });

    it("Should allow updating existing index", async function () {
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "keyword",
        ["Old citation"],
        [70]
      );

      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "keyword",
        ["New citation 1", "New citation 2"],
        [95, 92]
      );

      const index = await lexiconHolder.getSemanticIndex(creator.address, "keyword");
      expect(index.citations.length).to.equal(2);
      expect(index.citations[0]).to.equal("New citation 1");
    });
  });

  describe("Ambiguity Resolution", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "funding",
        ["Primary citation about funding", "Secondary citation"],
        [97, 85]
      );
    });

    it("Should resolve ambiguity with highest relevance", async function () {
      const result = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "funding",
        corpusHash
      );

      expect(result.citation).to.equal("Primary citation about funding");
      expect(result.confidence).to.equal(97);
    });

    it("Should emit AmbiguityResolved event", async function () {
      await expect(
        lexiconHolder.resolveAmbiguity(creator.address, "funding", corpusHash)
      ).to.emit(lexiconHolder, "AmbiguityResolved")
        .withArgs(creator.address, "funding", "Primary citation about funding", 97);
    });

    it("Should reject corpus hash mismatch", async function () {
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("Wrong Corpus"));
      await expect(
        lexiconHolder.resolveAmbiguity(creator.address, "funding", wrongHash)
      ).to.be.revertedWith("Corpus hash mismatch");
    });

    it("Should reject if corpus not frozen", async function () {
      await expect(
        lexiconHolder.resolveAmbiguity(creator2.address, "funding", corpusHash)
      ).to.be.revertedWith("Corpus hash mismatch");
    });

    it("Should return empty for non-existent keyword", async function () {
      const result = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "nonexistent",
        corpusHash
      );

      expect(result.citation).to.equal("");
      expect(result.confidence).to.equal(0);
    });

    it("Should handle single citation", async function () {
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "single",
        ["Only citation"],
        [88]
      );

      const result = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "single",
        corpusHash
      );

      expect(result.citation).to.equal("Only citation");
      expect(result.confidence).to.equal(88);
    });

    it("Should handle multiple citations with same score", async function () {
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "equal",
        ["Citation A", "Citation B"],
        [90, 90]
      );

      const result = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "equal",
        corpusHash
      );

      // Should return first one found with max score
      expect(result.citation).to.equal("Citation A");
      expect(result.confidence).to.equal(90);
    });
  });

  describe("Cluster Management", function () {
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("OpenSource"));

    it("Should create cluster", async function () {
      await lexiconHolder.connect(indexer).createCluster(
        clusterId,
        "Open Source Projects Cluster"
      );

      const cluster = await lexiconHolder.getCluster(clusterId);
      expect(cluster.clusterId).to.equal(clusterId);
      expect(cluster.description).to.equal("Open Source Projects Cluster");
      expect(cluster.legacies.length).to.equal(0);
    });

    it("Should emit ClusterCreated event", async function () {
      await expect(
        lexiconHolder.connect(indexer).createCluster(clusterId, "Description")
      ).to.emit(lexiconHolder, "ClusterCreated")
        .withArgs(clusterId, "Description");
    });

    it("Should reject duplicate cluster", async function () {
      await lexiconHolder.connect(indexer).createCluster(clusterId, "First");

      await expect(
        lexiconHolder.connect(indexer).createCluster(clusterId, "Second")
      ).to.be.revertedWith("Cluster already exists");
    });

    it("Should reject from non-indexer", async function () {
      await expect(
        lexiconHolder.connect(creator).createCluster(clusterId, "Description")
      ).to.be.revertedWithCustomError(lexiconHolder, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Legacy Assignment to Cluster", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("Cluster1"));

    beforeEach(async function () {
      // Freeze corpus
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      // Create cluster
      await lexiconHolder.connect(indexer).createCluster(clusterId, "Test Cluster");
    });

    it("Should assign legacy to cluster", async function () {
      await lexiconHolder.connect(indexer).assignLegacyToCluster(creator.address, clusterId);

      const cluster = await lexiconHolder.getCluster(clusterId);
      expect(cluster.legacies.length).to.equal(1);
      expect(cluster.legacies[0]).to.equal(creator.address);

      expect(await lexiconHolder.getLegacyCluster(creator.address)).to.equal(clusterId);
    });

    it("Should emit LegacyAssigned event", async function () {
      await expect(
        lexiconHolder.connect(indexer).assignLegacyToCluster(creator.address, clusterId)
      ).to.emit(lexiconHolder, "LegacyAssigned")
        .withArgs(creator.address, clusterId);
    });

    it("Should reject assignment to non-existent cluster", async function () {
      const fakeClusterId = ethers.keccak256(ethers.toUtf8Bytes("Fake"));
      await expect(
        lexiconHolder.connect(indexer).assignLegacyToCluster(creator.address, fakeClusterId)
      ).to.be.revertedWith("Cluster does not exist");
    });

    it("Should reject if corpus not frozen", async function () {
      await expect(
        lexiconHolder.connect(indexer).assignLegacyToCluster(creator2.address, clusterId)
      ).to.be.revertedWith("Corpus not frozen");
    });

    it("Should assign multiple legacies to same cluster", async function () {
      // Freeze corpus for creator2
      const corpus2Hash = ethers.keccak256(ethers.toUtf8Bytes("Corpus2"));
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator2.address,
        corpus2Hash,
        "ipfs://corpus2",
        2020,
        2025
      );

      await lexiconHolder.connect(indexer).assignLegacyToCluster(creator.address, clusterId);
      await lexiconHolder.connect(indexer).assignLegacyToCluster(creator2.address, clusterId);

      const cluster = await lexiconHolder.getCluster(clusterId);
      expect(cluster.legacies.length).to.equal(2);
    });
  });

  describe("Batch Index Creation", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );
    });

    it("Should batch create indices", async function () {
      const keywords = ["keyword1", "keyword2", "keyword3"];
      const citationsArray = [
        ["Citation 1a", "Citation 1b"],
        ["Citation 2a"],
        ["Citation 3a", "Citation 3b", "Citation 3c"]
      ];
      const scoresArray = [
        [95, 85],
        [90],
        [98, 87, 75]
      ];

      await lexiconHolder.connect(indexer).batchCreateIndices(
        creator.address,
        keywords,
        citationsArray,
        scoresArray
      );

      const index1 = await lexiconHolder.getSemanticIndex(creator.address, "keyword1");
      const index2 = await lexiconHolder.getSemanticIndex(creator.address, "keyword2");
      const index3 = await lexiconHolder.getSemanticIndex(creator.address, "keyword3");

      expect(index1.citations.length).to.equal(2);
      expect(index2.citations.length).to.equal(1);
      expect(index3.citations.length).to.equal(3);
    });

    it("Should emit SemanticIndexCreated for each keyword", async function () {
      const tx = await lexiconHolder.connect(indexer).batchCreateIndices(
        creator.address,
        ["k1", "k2"],
        [["c1"], ["c2"]],
        [[90], [85]]
      );

      await expect(tx).to.emit(lexiconHolder, "SemanticIndexCreated").withArgs(creator.address, "k1");
      await expect(tx).to.emit(lexiconHolder, "SemanticIndexCreated").withArgs(creator.address, "k2");
    });

    it("Should reject keywords/citations length mismatch", async function () {
      await expect(
        lexiconHolder.connect(indexer).batchCreateIndices(
          creator.address,
          ["k1", "k2"],
          [["c1"]], // Only one citations array
          [[90], [85]]
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should reject keywords/scores length mismatch", async function () {
      await expect(
        lexiconHolder.connect(indexer).batchCreateIndices(
          creator.address,
          ["k1", "k2"],
          [["c1"], ["c2"]],
          [[90]] // Only one scores array
        )
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("View Functions", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );
    });

    it("Should return corpus entry", async function () {
      const corpus = await lexiconHolder.getCorpus(creator.address);
      expect(corpus.isFrozen).to.equal(true);
    });

    it("Should return empty corpus for non-existent creator", async function () {
      const corpus = await lexiconHolder.getCorpus(creator2.address);
      expect(corpus.isFrozen).to.equal(false);
      expect(corpus.corpusHash).to.equal(ethers.ZeroHash);
    });

    it("Should return empty semantic index for non-existent keyword", async function () {
      const index = await lexiconHolder.getSemanticIndex(creator.address, "nonexistent");
      expect(index.keyword).to.equal("");
      expect(index.citations.length).to.equal(0);
    });

    it("Should return zero legacy cluster for unassigned creator", async function () {
      expect(await lexiconHolder.getLegacyCluster(creator.address)).to.equal(ethers.ZeroHash);
    });
  });

  describe("Limit Enforcement", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );
    });

    it("Should reject semantic index with more than MAX_CITATIONS_PER_INDEX (100) citations", async function () {
      const citations = new Array(101).fill("Citation");
      const scores = new Array(101).fill(80);

      await expect(
        lexiconHolder.connect(indexer).createSemanticIndex(
          creator.address,
          "keyword",
          citations,
          scores
        )
      ).to.be.revertedWith("Too many citations");
    });

    it("Should reject batch creation exceeding MAX_BATCH_SIZE (50)", async function () {
      const keywords = new Array(51).fill("keyword").map((k, i) => `${k}${i}`);
      const citationsArray = new Array(51).fill(["Citation"]);
      const scoresArray = new Array(51).fill([80]);

      await expect(
        lexiconHolder.connect(indexer).batchCreateIndices(
          creator.address,
          keywords,
          citationsArray,
          scoresArray
        )
      ).to.be.revertedWith("Batch size exceeds limit");
    });
  });
});

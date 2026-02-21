import { expect } from "chai";
import { ethers } from "hardhat";

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

    it("Should resolve ambiguity as a view function without state change", async function () {
      const result = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "funding",
        corpusHash
      );

      expect(result.citation).to.equal("Primary citation about funding");
      expect(result.confidence).to.equal(97);

      // Call again to confirm no state was modified — same result
      const result2 = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "funding",
        corpusHash
      );

      expect(result2.citation).to.equal(result.citation);
      expect(result2.confidence).to.equal(result.confidence);
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

  describe("Resolution Cache", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      // Also create a semantic index for "funding" so we can test cache-vs-index preference
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "funding",
        ["Index citation about funding", "Index secondary citation"],
        [90, 80]
      );
    });

    it("Should submit resolution successfully", async function () {
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "grant allocation",
        ["Cached citation A", "Cached citation B"],
        [95, 88]
      );

      const res = await lexiconHolder.getResolution(creator.address, "grant allocation");
      expect(res.citations.length).to.equal(2);
      expect(res.citations[0]).to.equal("Cached citation A");
      expect(res.citations[1]).to.equal("Cached citation B");
      expect(res.confidences[0]).to.equal(95);
      expect(res.confidences[1]).to.equal(88);
      expect(res.resolvedAt).to.be.greaterThan(0);
    });

    it("Should emit ResolutionSubmitted event", async function () {
      await expect(
        lexiconHolder.connect(indexer).submitResolution(
          creator.address,
          "grant allocation",
          ["Citation 1", "Citation 2"],
          [95, 88]
        )
      ).to.emit(lexiconHolder, "ResolutionSubmitted")
        .withArgs(creator.address, "grant allocation", 2);
    });

    it("Should reject empty resolution", async function () {
      await expect(
        lexiconHolder.connect(indexer).submitResolution(
          creator.address,
          "empty query",
          [],
          []
        )
      ).to.be.revertedWith("Empty resolution");
    });

    it("Should reject array length mismatch", async function () {
      await expect(
        lexiconHolder.connect(indexer).submitResolution(
          creator.address,
          "mismatched",
          ["Citation 1", "Citation 2"],
          [95] // Only one confidence
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should reject too many results (> MAX_TOPK_RESULTS)", async function () {
      const citations = new Array(11).fill("Citation");
      const confidences = new Array(11).fill(80);

      await expect(
        lexiconHolder.connect(indexer).submitResolution(
          creator.address,
          "too many",
          citations,
          confidences
        )
      ).to.be.revertedWith("Too many results");
    });

    it("Should reject from non-indexer", async function () {
      await expect(
        lexiconHolder.connect(creator).submitResolution(
          creator.address,
          "unauthorized",
          ["Citation"],
          [90]
        )
      ).to.be.revertedWithCustomError(lexiconHolder, "AccessControlUnauthorizedAccount");
    });

    it("Should reject if corpus not frozen", async function () {
      await expect(
        lexiconHolder.connect(indexer).submitResolution(
          creator2.address, // No frozen corpus
          "no corpus",
          ["Citation"],
          [90]
        )
      ).to.be.revertedWith("Corpus not frozen");
    });

    it("resolveAmbiguity should prefer cached resolution over semantic index", async function () {
      // Submit a resolution for "funding" with DIFFERENT citations than the semantic index
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "funding",
        ["Cached resolution citation for funding"],
        [99]
      );

      // resolveAmbiguity should return the cached result, not the semantic index
      const result = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "funding",
        corpusHash
      );

      // Cached citation should win over index citation ("Index citation about funding")
      expect(result.citation).to.equal("Cached resolution citation for funding");
      expect(result.confidence).to.equal(99);
    });

    it("Should allow updating existing resolution", async function () {
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "updatable",
        ["Old cached citation"],
        [70]
      );

      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "updatable",
        ["New cached citation 1", "New cached citation 2"],
        [98, 91]
      );

      const res = await lexiconHolder.getResolution(creator.address, "updatable");
      expect(res.citations.length).to.equal(2);
      expect(res.citations[0]).to.equal("New cached citation 1");
      expect(res.confidences[0]).to.equal(98);
    });
  });

  describe("Resolution Batch Submission", function () {
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

    it("Should batch submit resolutions", async function () {
      await lexiconHolder.connect(indexer).submitResolutionBatch(
        creator.address,
        ["query1", "query2", "query3"],
        [
          ["Q1 Citation A", "Q1 Citation B"],
          ["Q2 Citation A"],
          ["Q3 Citation A", "Q3 Citation B", "Q3 Citation C"]
        ],
        [
          [95, 88],
          [92],
          [97, 85, 74]
        ]
      );

      const res1 = await lexiconHolder.getResolution(creator.address, "query1");
      const res2 = await lexiconHolder.getResolution(creator.address, "query2");
      const res3 = await lexiconHolder.getResolution(creator.address, "query3");

      expect(res1.citations.length).to.equal(2);
      expect(res1.citations[0]).to.equal("Q1 Citation A");
      expect(res2.citations.length).to.equal(1);
      expect(res2.citations[0]).to.equal("Q2 Citation A");
      expect(res3.citations.length).to.equal(3);
      expect(res3.confidences[0]).to.equal(97);
    });

    it("Should emit ResolutionSubmitted for each query", async function () {
      const tx = await lexiconHolder.connect(indexer).submitResolutionBatch(
        creator.address,
        ["batchQ1", "batchQ2"],
        [["C1"], ["C2a", "C2b"]],
        [[90], [85, 78]]
      );

      await expect(tx).to.emit(lexiconHolder, "ResolutionSubmitted")
        .withArgs(creator.address, "batchQ1", 1);
      await expect(tx).to.emit(lexiconHolder, "ResolutionSubmitted")
        .withArgs(creator.address, "batchQ2", 2);
    });

    it("Should reject batch too large (> MAX_RESOLUTION_BATCH)", async function () {
      const queries = new Array(21).fill("q").map((q, i) => `${q}${i}`);
      const citationsArray = new Array(21).fill(["Citation"]);
      const confidencesArray = new Array(21).fill([80]);

      await expect(
        lexiconHolder.connect(indexer).submitResolutionBatch(
          creator.address,
          queries,
          citationsArray,
          confidencesArray
        )
      ).to.be.revertedWith("Batch too large");
    });

    it("Should reject inner array mismatch", async function () {
      await expect(
        lexiconHolder.connect(indexer).submitResolutionBatch(
          creator.address,
          ["q1"],
          [["C1", "C2"]], // 2 citations
          [[90]]          // 1 confidence
        )
      ).to.be.revertedWith("Inner array mismatch");
    });

    it("Should reject empty resolution in batch", async function () {
      await expect(
        lexiconHolder.connect(indexer).submitResolutionBatch(
          creator.address,
          ["q1", "q2"],
          [["C1"], []], // second query has empty citations
          [[90], []]
        )
      ).to.be.revertedWith("Empty resolution in batch");
    });
  });

  describe("Top-K Resolution", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      // Submit a cached resolution with multiple results
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "topk-cached",
        ["Cached Best", "Cached Second", "Cached Third", "Cached Fourth", "Cached Fifth"],
        [98, 90, 85, 72, 60]
      );

      // Create a semantic index for fallback testing
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "topk-indexed",
        ["Indexed Best", "Indexed Second", "Indexed Third"],
        [95, 88, 70]
      );
    });

    it("Should return top-k results from resolution cache", async function () {
      const result = await lexiconHolder.resolveAmbiguityTopK.staticCall(
        creator.address,
        "topk-cached",
        corpusHash,
        3
      );

      expect(result.citations.length).to.equal(3);
      expect(result.confidences.length).to.equal(3);
      expect(result.citations[0]).to.equal("Cached Best");
      expect(result.confidences[0]).to.equal(98);
      expect(result.citations[1]).to.equal("Cached Second");
      expect(result.confidences[1]).to.equal(90);
      expect(result.citations[2]).to.equal("Cached Third");
      expect(result.confidences[2]).to.equal(85);
    });

    it("Should return top-k results from semantic index fallback", async function () {
      const result = await lexiconHolder.resolveAmbiguityTopK.staticCall(
        creator.address,
        "topk-indexed",
        corpusHash,
        2
      );

      expect(result.citations.length).to.equal(2);
      expect(result.citations[0]).to.equal("Indexed Best");
      expect(result.confidences[0]).to.equal(95);
      expect(result.citations[1]).to.equal("Indexed Second");
      expect(result.confidences[1]).to.equal(88);
    });

    it("Should return fewer than k if fewer results exist", async function () {
      const result = await lexiconHolder.resolveAmbiguityTopK.staticCall(
        creator.address,
        "topk-indexed",
        corpusHash,
        10 // Only 3 results exist in the index
      );

      expect(result.citations.length).to.equal(3);
      expect(result.confidences.length).to.equal(3);
    });

    it("Should reject k=0", async function () {
      await expect(
        lexiconHolder.resolveAmbiguityTopK(
          creator.address,
          "topk-cached",
          corpusHash,
          0
        )
      ).to.be.revertedWith("Invalid k value");
    });

    it("Should reject k > MAX_TOPK_RESULTS", async function () {
      await expect(
        lexiconHolder.resolveAmbiguityTopK(
          creator.address,
          "topk-cached",
          corpusHash,
          11
        )
      ).to.be.revertedWith("Invalid k value");
    });

    it("Should return results sorted by confidence (descending)", async function () {
      // Submit a resolution with intentionally unsorted confidences
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "unsorted-query",
        ["Low", "High", "Mid"],
        [50, 99, 75]
      );

      const result = await lexiconHolder.resolveAmbiguityTopK.staticCall(
        creator.address,
        "unsorted-query",
        corpusHash,
        3
      );

      expect(result.confidences[0]).to.equal(99);
      expect(result.confidences[1]).to.equal(75);
      expect(result.confidences[2]).to.equal(50);
      expect(result.citations[0]).to.equal("High");
      expect(result.citations[1]).to.equal("Mid");
      expect(result.citations[2]).to.equal("Low");
    });

    it("Should return empty arrays for non-existent query", async function () {
      const result = await lexiconHolder.resolveAmbiguityTopK.staticCall(
        creator.address,
        "nonexistent-topk-query",
        corpusHash,
        5
      );

      expect(result.citations.length).to.equal(0);
      expect(result.confidences.length).to.equal(0);
    });
  });

  describe("Batch Ambiguity Resolution", function () {
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await lexiconHolder.connect(indexer).freezeCorpus(
        creator.address,
        corpusHash,
        "ipfs://corpus",
        2020,
        2025
      );

      // Create semantic index entries
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "indexed-term",
        ["Indexed citation for term"],
        [91]
      );

      // Submit cached resolutions
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "cached-term",
        ["Cached citation for term"],
        [96]
      );
    });

    it("Should resolve multiple queries in one call", async function () {
      const result = await lexiconHolder.resolveAmbiguityBatch.staticCall(
        creator.address,
        ["cached-term", "indexed-term"],
        corpusHash
      );

      expect(result.citations.length).to.equal(2);
      expect(result.confidences.length).to.equal(2);
      expect(result.citations[0]).to.equal("Cached citation for term");
      expect(result.confidences[0]).to.equal(96);
      expect(result.citations[1]).to.equal("Indexed citation for term");
      expect(result.confidences[1]).to.equal(91);
    });

    it("Should handle mix of cached and indexed queries", async function () {
      // Also submit a cached resolution for "indexed-term" to prove cache takes precedence
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "indexed-term",
        ["Cache override for indexed-term"],
        [99]
      );

      const result = await lexiconHolder.resolveAmbiguityBatch.staticCall(
        creator.address,
        ["cached-term", "indexed-term"],
        corpusHash
      );

      // Both should come from cache now
      expect(result.citations[0]).to.equal("Cached citation for term");
      expect(result.confidences[0]).to.equal(96);
      expect(result.citations[1]).to.equal("Cache override for indexed-term");
      expect(result.confidences[1]).to.equal(99);
    });

    it("Should return empty for non-existent queries", async function () {
      const result = await lexiconHolder.resolveAmbiguityBatch.staticCall(
        creator.address,
        ["nonexistent1", "nonexistent2"],
        corpusHash
      );

      expect(result.citations[0]).to.equal("");
      expect(result.confidences[0]).to.equal(0);
      expect(result.citations[1]).to.equal("");
      expect(result.confidences[1]).to.equal(0);
    });

    it("Should reject batch too large", async function () {
      const queries = new Array(21).fill("q").map((q, i) => `${q}${i}`);

      await expect(
        lexiconHolder.resolveAmbiguityBatch(
          creator.address,
          queries,
          corpusHash
        )
      ).to.be.revertedWith("Batch too large");
    });
  });

  describe("Resolution View Functions", function () {
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

    it("getResolution should return cached resolution", async function () {
      await lexiconHolder.connect(indexer).submitResolution(
        creator.address,
        "view-test-query",
        ["View Citation 1", "View Citation 2"],
        [93, 81]
      );

      const res = await lexiconHolder.getResolution(creator.address, "view-test-query");
      expect(res.citations.length).to.equal(2);
      expect(res.citations[0]).to.equal("View Citation 1");
      expect(res.citations[1]).to.equal("View Citation 2");
      expect(res.confidences[0]).to.equal(93);
      expect(res.confidences[1]).to.equal(81);
      expect(res.resolvedAt).to.be.greaterThan(0);
    });

    it("getResolution should return empty for non-existent query", async function () {
      const res = await lexiconHolder.getResolution(creator.address, "does-not-exist");
      expect(res.citations.length).to.equal(0);
      expect(res.confidences.length).to.equal(0);
      expect(res.resolvedAt).to.equal(0);
    });

    it("resolveAmbiguity should be callable as view (no state change)", async function () {
      await lexiconHolder.connect(indexer).createSemanticIndex(
        creator.address,
        "view-check",
        ["View check citation"],
        [87]
      );

      // Use staticCall to confirm it is a pure view call
      const result = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "view-check",
        corpusHash
      );

      expect(result.citation).to.equal("View check citation");
      expect(result.confidence).to.equal(87);

      // Call a second time — should produce the same result, proving no state mutation
      const result2 = await lexiconHolder.resolveAmbiguity.staticCall(
        creator.address,
        "view-check",
        corpusHash
      );

      expect(result2.citation).to.equal(result.citation);
      expect(result2.confidence).to.equal(result.confidence);
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

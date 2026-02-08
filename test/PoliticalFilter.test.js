const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoliticalFilter", function () {
  let executionAgent, lexiconHolder;
  let owner, creator, executor;
  const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

  beforeEach(async function () {
    [owner, creator, executor] = await ethers.getSigners();

    const LexiconHolder = await ethers.getContractFactory("LexiconHolder");
    lexiconHolder = await LexiconHolder.deploy();
    await lexiconHolder.waitForDeployment();

    const ExecutionAgent = await ethers.getContractFactory("ExecutionAgent");
    executionAgent = await ExecutionAgent.deploy(await lexiconHolder.getAddress());
    await executionAgent.waitForDeployment();

    const EXECUTOR_ROLE = await executionAgent.EXECUTOR_ROLE();
    await executionAgent.grantRole(EXECUTOR_ROLE, executor.address);

    await lexiconHolder.freezeCorpus(creator.address, corpusHash, "ipfs://corpus", 2020, 2025);
    await executionAgent.connect(executor).activateExecution(creator.address);
  });

  // Helper: try to execute action and expect political block revert.
  // Creates a semantic index first (unnecessary since the revert fires before
  // lexicon resolution, but keeps setup consistent).
  async function expectPoliticalBlock(action) {
    await lexiconHolder.createSemanticIndex(creator.address, action, ["Citation"], [98]);
    await expect(
      executionAgent.connect(executor).executeAction(creator.address, action, action, corpusHash)
    ).to.be.revertedWith("Action violates No Political Agency Clause");
  }

  // Helper: action should pass through political filter and execute successfully.
  async function expectAllowed(action) {
    await lexiconHolder.createSemanticIndex(creator.address, action, ["Citation"], [98]);
    await executionAgent.connect(executor).executeAction(creator.address, action, action, corpusHash);
  }

  // ==========================================================================
  // Layer 1: Exact Hash Matching
  // ==========================================================================
  describe("Layer 1 - Exact Hash Matching", function () {
    it("should block 'electoral_activity'", async function () {
      await expectPoliticalBlock("electoral_activity");
    });

    it("should block 'political_advocacy'", async function () {
      await expectPoliticalBlock("political_advocacy");
    });

    it("should block 'lobbying'", async function () {
      await expectPoliticalBlock("lobbying");
    });

    it("should block 'policy_influence'", async function () {
      await expectPoliticalBlock("policy_influence");
    });

    it("should block 'campaign_donation'", async function () {
      await expectPoliticalBlock("campaign_donation");
    });

    it("should block 'political_endorsement'", async function () {
      await expectPoliticalBlock("political_endorsement");
    });

    it("should block 'voter_registration'", async function () {
      await expectPoliticalBlock("voter_registration");
    });

    it("should block 'political_party_support'", async function () {
      await expectPoliticalBlock("political_party_support");
    });

    it("should block 'legislative_advocacy'", async function () {
      await expectPoliticalBlock("legislative_advocacy");
    });

    it("should block 'government_lobbying'", async function () {
      await expectPoliticalBlock("government_lobbying");
    });
  });

  // ==========================================================================
  // Layer 2: Primary Keyword Detection (case-insensitive)
  // ==========================================================================
  describe("Layer 2 - Primary Keyword Detection", function () {
    describe("case insensitivity", function () {
      it("should block 'ELECTORAL' (all uppercase)", async function () {
        await expectPoliticalBlock("ELECTORAL_action");
      });

      it("should block 'Electoral' (mixed case)", async function () {
        await expectPoliticalBlock("Electoral_action");
      });

      it("should block 'electoral' (all lowercase)", async function () {
        await expectPoliticalBlock("electoral_action");
      });
    });

    describe("electoral keywords", function () {
      it("should block actions containing 'election'", async function () {
        await expectPoliticalBlock("run_in_election");
      });

      it("should block actions containing 'campaign'", async function () {
        await expectPoliticalBlock("start_campaign_now");
      });

      it("should block actions containing 'ballot'", async function () {
        await expectPoliticalBlock("prepare_ballot_materials");
      });

      it("should block actions containing 'vote'", async function () {
        await expectPoliticalBlock("cast_a_vote");
      });

      it("should block actions containing 'voting'", async function () {
        await expectPoliticalBlock("support_voting_rights");
      });

      it("should block actions containing 'voter'", async function () {
        await expectPoliticalBlock("reach_every_voter");
      });
    });

    describe("lobbying keywords", function () {
      it("should block actions containing 'lobby'", async function () {
        await expectPoliticalBlock("lobby_for_change");
      });

      it("should block actions containing 'lobbying'", async function () {
        await expectPoliticalBlock("corporate_lobbying_effort");
      });

      it("should block actions containing 'lobbyist'", async function () {
        await expectPoliticalBlock("hire_a_lobbyist");
      });
    });

    describe("political keywords", function () {
      it("should block actions containing 'political'", async function () {
        await expectPoliticalBlock("political_action");
      });

      it("should block actions containing 'politician'", async function () {
        await expectPoliticalBlock("meet_the_politician");
      });

      it("should block actions containing 'partisan'", async function () {
        await expectPoliticalBlock("partisan_debate_prep");
      });
    });

    describe("policy keywords", function () {
      // NOTE: 'policy' was moved from primary to secondary (advisory-only)
      // to reduce false positives like "insurance policy distribution"
      it("should allow actions containing 'policy' (now secondary/advisory)", async function () {
        await expectAllowed("draft_new_policy");
      });

      it("should block actions containing 'legislation'", async function () {
        await expectPoliticalBlock("support_new_legislation");
      });

      it("should block actions containing 'legislative'", async function () {
        await expectPoliticalBlock("legislative_review");
      });

      it("should block actions containing 'lawmaker'", async function () {
        await expectPoliticalBlock("brief_the_lawmaker");
      });
    });

    describe("government keywords", function () {
      it("should block actions containing 'government'", async function () {
        await expectPoliticalBlock("petition_the_government");
      });

      it("should block actions containing 'senator'", async function () {
        await expectPoliticalBlock("meet_the_senator");
      });

      it("should block actions containing 'congressman'", async function () {
        await expectPoliticalBlock("write_to_congressman");
      });

      it("should block actions containing 'parliament'", async function () {
        await expectPoliticalBlock("address_parliament_members");
      });
    });
  });

  // ==========================================================================
  // Layer 2.5: Misspelling Detection
  // ==========================================================================
  describe("Layer 2.5 - Misspelling Detection", function () {
    describe("electoral misspellings", function () {
      it("should block 'electon' (misspelling of election)", async function () {
        await expectPoliticalBlock("run_in_electon");
      });

      it("should block 'elction' (misspelling of election)", async function () {
        await expectPoliticalBlock("elction_day_plans");
      });

      it("should block 'elektion' (misspelling of election)", async function () {
        await expectPoliticalBlock("prepare_for_elektion");
      });

      it("should block 'electorial' (misspelling of electoral)", async function () {
        await expectPoliticalBlock("electorial_process");
      });
    });

    describe("campaign misspellings", function () {
      it("should block 'campain' (misspelling of campaign)", async function () {
        await expectPoliticalBlock("start_a_campain");
      });

      it("should block 'campaing' (misspelling of campaign)", async function () {
        await expectPoliticalBlock("run_a_campaing");
      });

      it("should block 'campagne' (misspelling of campaign)", async function () {
        await expectPoliticalBlock("launch_campagne");
      });
    });

    describe("political misspellings", function () {
      it("should block 'politcal' (misspelling of political)", async function () {
        await expectPoliticalBlock("a_politcal_act");
      });

      it("should block 'politacal' (misspelling of political)", async function () {
        await expectPoliticalBlock("politacal_movement");
      });

      it("should block 'poilitical' (misspelling of political)", async function () {
        await expectPoliticalBlock("poilitical_stance");
      });
    });

    describe("lobbying misspellings", function () {
      it("should block 'lobying' (misspelling of lobbying)", async function () {
        await expectPoliticalBlock("corporate_lobying");
      });

      it("should block 'lobbiing' (misspelling of lobbying)", async function () {
        await expectPoliticalBlock("lobbiing_firm");
      });
    });
  });

  // ==========================================================================
  // Layer 3: Political Phrase Detection
  // ==========================================================================
  describe("Layer 3 - Political Phrase Detection", function () {
    it("should block 'get out the vote'", async function () {
      await expectPoliticalBlock("help_get out the vote_drive");
    });

    it("should block 'voter registration'", async function () {
      await expectPoliticalBlock("start_voter registration_drive");
    });

    it("should block 'campaign contribution'", async function () {
      await expectPoliticalBlock("make_a_campaign contribution");
    });

    it("should block 'contact your representative'", async function () {
      await expectPoliticalBlock("please_contact your representative_now");
    });

    it("should block 'call your senator'", async function () {
      await expectPoliticalBlock("please_call your senator_today");
    });
  });

  // ==========================================================================
  // Layer 4: Secondary Keyword Detection
  // ==========================================================================
  // ==========================================================================
  // Layer 4: Secondary Keyword Detection (ADVISORY ONLY — non-blocking)
  // Secondary matches return isProhibited: false, so these actions should
  // pass through the filter and execute successfully.
  // ==========================================================================
  describe("Layer 4 - Secondary Keyword Detection (advisory, non-blocking)", function () {
    describe("advocacy terms — should allow (advisory only)", function () {
      it("should allow actions containing 'advocacy'", async function () {
        await expectAllowed("start_advocacy_group");
      });

      it("should allow actions containing 'advocate'", async function () {
        await expectAllowed("advocate_for_changes");
      });

      it("should allow actions containing 'endorse'", async function () {
        await expectAllowed("endorse_a_candidate");
      });

      it("should allow actions containing 'endorsement'", async function () {
        await expectAllowed("seek_an_endorsement");
      });
    });

    describe("regulatory terms — should allow (advisory only)", function () {
      it("should allow actions containing 'regulatory'", async function () {
        await expectAllowed("fight_regulatory_burden");
      });

      it("should allow actions containing 'regulation'", async function () {
        await expectAllowed("oppose_this_regulation");
      });

      it("should allow actions containing 'deregulation'", async function () {
        await expectAllowed("push_for_deregulation");
      });
    });

    describe("party terms — should allow (advisory only)", function () {
      it("should allow actions containing 'republican'", async function () {
        await expectAllowed("support_republican_party");
      });

      it("should allow actions containing 'democrat'", async function () {
        await expectAllowed("join_democrat_caucus");
      });

      it("should allow actions containing 'conservative'", async function () {
        await expectAllowed("fund_conservative_group");
      });

      it("should allow actions containing 'liberal'", async function () {
        await expectAllowed("liberal_agenda_support");
      });
    });
  });

  // ==========================================================================
  // Layer 0: Non-ASCII / Homoglyph Detection
  // ==========================================================================
  describe("Layer 0 - Non-ASCII / Homoglyph Detection", function () {
    it("should block actions with Cyrillic characters (homoglyph attack)", async function () {
      // Cyrillic 'а' (U+0430) looks like Latin 'a' but is non-ASCII
      const homoglyphAction = "fund_\u0430ction";
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address, homoglyphAction, homoglyphAction, corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("should block actions with Cyrillic 'р' (U+0440) resembling Latin 'p'", async function () {
      const homoglyphAction = "\u0440roject_funding";
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address, homoglyphAction, homoglyphAction, corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("should block actions with multi-byte UTF-8 characters", async function () {
      // Chinese character embedded in otherwise benign string
      const nonAsciiAction = "fund_\u4e16\u754c_project";
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address, nonAsciiAction, nonAsciiAction, corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });

    it("should block actions with accented Latin characters", async function () {
      // 'e' with acute accent (U+00E9) is multi-byte in UTF-8
      const accentedAction = "cr\u00e9ate_fund";
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address, accentedAction, accentedAction, corpusHash
        )
      ).to.be.revertedWith("Action violates No Political Agency Clause");
    });
  });

  // ==========================================================================
  // MAX_FILTER_STRING_LENGTH boundary (1000 chars)
  // ==========================================================================
  describe("MAX_FILTER_STRING_LENGTH boundary", function () {
    it("should allow a 1000-character benign string (at boundary)", async function () {
      // 1000 chars of 'a' with underscores - no political keywords
      const action = "a".repeat(1000);
      await lexiconHolder.createSemanticIndex(creator.address, action, ["Citation"], [98]);
      // This passes both ExecutionAgent's MAX_ACTION_LENGTH (1000) and
      // PoliticalFilter's MAX_FILTER_STRING_LENGTH (1000). Since the string
      // contains no political terms, it should execute successfully.
      await executionAgent.connect(executor).executeAction(
        creator.address, action, action, corpusHash
      );
    });

    it("should block a 1001-character string at ExecutionAgent level", async function () {
      // 1001 chars exceeds ExecutionAgent.MAX_ACTION_LENGTH (1000).
      // ExecutionAgent's require() fires BEFORE PoliticalFilter.checkAction()
      // is reached, so the revert message is "Action string too long" rather
      // than PoliticalFilter's "string_too_long" matched term.
      const action = "b".repeat(1001);
      await expect(
        executionAgent.connect(executor).executeAction(
          creator.address, action, action, corpusHash
        )
      ).to.be.revertedWith("Action string too long");
    });
  });

  // ==========================================================================
  // False Negative / Benign Actions (should pass the filter)
  // ==========================================================================
  describe("Benign Actions - should NOT be blocked", function () {
    it("should allow 'fund_open_source_project'", async function () {
      await expectAllowed("fund_open_source_project");
    });

    it("should allow 'license_music_catalog'", async function () {
      await expectAllowed("license_music_catalog");
    });

    it("should allow 'distribute_royalties'", async function () {
      await expectAllowed("distribute_royalties");
    });

    it("should allow 'archive_digital_assets'", async function () {
      await expectAllowed("archive_digital_assets");
    });

    it("should allow 'transfer_copyright_proceeds'", async function () {
      await expectAllowed("transfer_copyright_proceeds");
    });

    it("should allow plain ASCII action strings", async function () {
      await expectAllowed("simple_benign_action_123");
    });
  });

  // ==========================================================================
  // Word Boundary Regression Tests
  // ==========================================================================
  describe("Word Boundary - 'vote' regression tests", function () {
    it("should block standalone 'vote' at word boundary", async function () {
      await expectPoliticalBlock("cast_a_vote");
    });

    it("should block 'vote' at start of string", async function () {
      await expectPoliticalBlock("vote_for_candidate");
    });

    it("should block 'vote' at end of string", async function () {
      await expectPoliticalBlock("please_vote");
    });

    it("should allow 'devote' (vote embedded in larger word)", async function () {
      await expectAllowed("devote_resources_to_development");
    });

    it("should allow 'devoted' (vote embedded)", async function () {
      await expectAllowed("devoted_team_member");
    });

    it("should allow 'invoke' (no word-boundary match)", async function () {
      await expectAllowed("invoke_emergency_protocol");
    });

    it("should allow 'provoke' (no word-boundary match)", async function () {
      await expectAllowed("provoke_discussion_on_roadmap");
    });

    it("should allow 'evoke' (no word-boundary match)", async function () {
      await expectAllowed("evoke_memories_through_art");
    });

    it("should allow 'revoke' (no word-boundary match)", async function () {
      await expectAllowed("revoke_access_permissions");
    });

    it("should block 'VOTE' in uppercase at word boundary", async function () {
      await expectPoliticalBlock("VOTE_NOW_for_best_design");
    });
  });

  // ==========================================================================
  // False Positive Regression Tests (Phase 3 targets)
  // ==========================================================================
  describe("False Positive Regression - previously blocked, now allowed", function () {
    it("should allow 'insurance policy distribution'", async function () {
      await expectAllowed("insurance_policy_distribution");
    });

    it("should allow 'conservative estimate of costs'", async function () {
      await expectAllowed("conservative_estimate_of_costs");
    });

    it("should allow 'liberal interpretation of terms'", async function () {
      await expectAllowed("liberal_interpretation_of_terms");
    });

    it("should allow 'advocate for better tooling'", async function () {
      await expectAllowed("advocate_for_better_tooling");
    });

    it("should allow 'regulatory compliance review'", async function () {
      await expectAllowed("regulatory_compliance_review");
    });

    it("should allow 'area of influence in market'", async function () {
      await expectAllowed("area_of_influence_in_market");
    });

    it("should allow 'update privacy policy'", async function () {
      await expectAllowed("update_privacy_policy");
    });

    it("should allow 'strengthen password policy'", async function () {
      await expectAllowed("strengthen_password_policy");
    });

    it("should allow 'endorse this software version'", async function () {
      await expectAllowed("endorse_this_software_version");
    });
  });

  // ==========================================================================
  // Parameterized Corpus Tests (from test/fixtures/political-filter-corpus.json)
  // ==========================================================================
  describe("Corpus Test Suite", function () {
    const corpus = require("./fixtures/political-filter-corpus.json");

    describe("Must-block actions", function () {
      corpus.must_block.forEach(({ action, reason }) => {
        it(`should block: "${action}" (${reason})`, async function () {
          await expectPoliticalBlock(action);
        });
      });
    });

    describe("Must-allow actions", function () {
      corpus.must_allow.forEach(({ action, reason }) => {
        it(`should allow: "${action}" (${reason})`, async function () {
          await expectAllowed(action);
        });
      });
    });

    describe("Edge cases", function () {
      corpus.edge_cases.forEach(({ action, expected, reason }) => {
        if (expected === "blocked") {
          it(`should block: "${action}" (${reason})`, async function () {
            await expectPoliticalBlock(action);
          });
        } else {
          // "allowed" and "advisory" both execute successfully
          // (advisory = non-blocking secondary match)
          it(`should allow: "${action}" (${reason})`, async function () {
            await expectAllowed(action);
          });
        }
      });
    });
  });
});

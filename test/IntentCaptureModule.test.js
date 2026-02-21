import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("IntentCaptureModule", function () {
  let intentModule, ipToken;
  let owner, creator, creator2, trustedSigner, triggerMechanism;

  beforeEach(async function () {
    [owner, creator, creator2, trustedSigner, triggerMechanism] = await ethers.getSigners();

    const IntentCaptureModule = await ethers.getContractFactory("IntentCaptureModule");
    intentModule = await IntentCaptureModule.deploy();
    await intentModule.waitForDeployment();

    const IPToken = await ethers.getContractFactory("IPToken");
    ipToken = await IPToken.deploy();
    await ipToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set deployer as owner", async function () {
      expect(await intentModule.owner()).to.equal(owner.address);
    });

    it("Should start with no trigger mechanism set", async function () {
      expect(await intentModule.triggerMechanism()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Intent Capture", function () {
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent Document"));
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("My Contextual Corpus"));

    it("Should capture intent with valid parameters", async function () {
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
      expect(intent.corpusURI).to.equal("ipfs://corpus-uri");
      expect(intent.assetsURI).to.equal("ipfs://assets-uri");
      expect(intent.corpusStartYear).to.equal(2020);
      expect(intent.corpusEndYear).to.equal(2025);
      expect(intent.isRevoked).to.equal(false);
      expect(intent.isTriggered).to.equal(false);
    });

    it("Should emit IntentCaptured event", async function () {
      await expect(
        intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus-uri",
          "ipfs://assets-uri",
          2020,
          2025,
          [await ipToken.getAddress()]
        )
      ).to.emit(intentModule, "IntentCaptured")
        .withArgs(creator.address, intentHash, corpusHash, await time.latest() + 1);
    });

    it("Should allow updating intent before trigger", async function () {
      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus-uri",
        "ipfs://assets-uri",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      const newIntentHash = ethers.keccak256(ethers.toUtf8Bytes("Updated Intent"));
      await intentModule.connect(creator).captureIntent(
        newIntentHash,
        corpusHash,
        "ipfs://new-corpus-uri",
        "ipfs://new-assets-uri",
        2021,
        2026,
        [await ipToken.getAddress()]
      );

      const intent = await intentModule.getIntent(creator.address);
      expect(intent.intentHash).to.equal(newIntentHash);
    });

    describe("Corpus Window Validation", function () {
      it("Should reject corpus window less than 5 years", async function () {
        await expect(
          intentModule.connect(creator).captureIntent(
            intentHash,
            corpusHash,
            "ipfs://corpus",
            "ipfs://assets",
            2020,
            2022, // Only 2 years
            [await ipToken.getAddress()]
          )
        ).to.be.revertedWith("Corpus window must be 5-10 years");
      });

      it("Should reject corpus window more than 10 years", async function () {
        await expect(
          intentModule.connect(creator).captureIntent(
            intentHash,
            corpusHash,
            "ipfs://corpus",
            "ipfs://assets",
            2010,
            2025, // 15 years
            [await ipToken.getAddress()]
          )
        ).to.be.revertedWith("Corpus window must be 5-10 years");
      });

      it("Should accept exactly 5 year corpus window", async function () {
        await intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus",
          "ipfs://assets",
          2020,
          2025, // Exactly 5 years
          [await ipToken.getAddress()]
        );

        const intent = await intentModule.getIntent(creator.address);
        expect(intent.intentHash).to.equal(intentHash);
      });

      it("Should accept exactly 10 year corpus window", async function () {
        await intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus",
          "ipfs://assets",
          2015,
          2025, // Exactly 10 years
          [await ipToken.getAddress()]
        );

        const intent = await intentModule.getIntent(creator.address);
        expect(intent.intentHash).to.equal(intentHash);
      });

      it("Should reject end year before start year", async function () {
        await expect(
          intentModule.connect(creator).captureIntent(
            intentHash,
            corpusHash,
            "ipfs://corpus",
            "ipfs://assets",
            2025,
            2020, // End before start
            [await ipToken.getAddress()]
          )
        ).to.be.revertedWith("Invalid corpus window");
      });

      it("Should reject same start and end year", async function () {
        await expect(
          intentModule.connect(creator).captureIntent(
            intentHash,
            corpusHash,
            "ipfs://corpus",
            "ipfs://assets",
            2025,
            2025, // Same year
            [await ipToken.getAddress()]
          )
        ).to.be.revertedWith("Invalid corpus window");
      });
    });

    describe("Asset Address Validation", function () {
      it("Should reject empty asset addresses", async function () {
        await expect(
          intentModule.connect(creator).captureIntent(
            intentHash,
            corpusHash,
            "ipfs://corpus",
            "ipfs://assets",
            2020,
            2025,
            [] // Empty array
          )
        ).to.be.revertedWith("Must specify at least one asset");
      });

      it("Should accept multiple asset addresses", async function () {
        const asset1 = await ipToken.getAddress();
        const asset2 = creator2.address; // Using another address as dummy asset

        await intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus",
          "ipfs://assets",
          2020,
          2025,
          [asset1, asset2]
        );

        const intent = await intentModule.getIntent(creator.address);
        expect(intent.assetAddresses.length).to.equal(2);
      });
    });
  });

  describe("Goals", function () {
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent"));
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
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

    it("Should add a goal successfully", async function () {
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("No political use"));
      await intentModule.connect(creator).addGoal(
        "Fund open source projects",
        constraintsHash,
        90
      );

      const goals = await intentModule.getGoals(creator.address);
      expect(goals.length).to.equal(1);
      expect(goals[0].description).to.equal("Fund open source projects");
      expect(goals[0].constraintsHash).to.equal(constraintsHash);
      expect(goals[0].priority).to.equal(90);
    });

    it("Should emit GoalAdded event", async function () {
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
      await expect(
        intentModule.connect(creator).addGoal("My Goal", constraintsHash, 50)
      ).to.emit(intentModule, "GoalAdded")
        .withArgs(creator.address, "My Goal", 50);
    });

    it("Should add multiple goals", async function () {
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));

      await intentModule.connect(creator).addGoal("Goal 1", constraintsHash, 100);
      await intentModule.connect(creator).addGoal("Goal 2", constraintsHash, 75);
      await intentModule.connect(creator).addGoal("Goal 3", constraintsHash, 50);

      const goals = await intentModule.getGoals(creator.address);
      expect(goals.length).to.equal(3);
      expect(goals[0].priority).to.equal(100);
      expect(goals[1].priority).to.equal(75);
      expect(goals[2].priority).to.equal(50);
    });

    describe("Priority Validation", function () {
      it("Should reject priority of 0", async function () {
        const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
        await expect(
          intentModule.connect(creator).addGoal("Goal", constraintsHash, 0)
        ).to.be.revertedWith("Priority must be 1-100");
      });

      it("Should reject priority above 100", async function () {
        const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
        await expect(
          intentModule.connect(creator).addGoal("Goal", constraintsHash, 101)
        ).to.be.revertedWith("Priority must be 1-100");
      });

      it("Should accept minimum priority of 1", async function () {
        const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
        await intentModule.connect(creator).addGoal("Low Priority Goal", constraintsHash, 1);

        const goals = await intentModule.getGoals(creator.address);
        expect(goals[0].priority).to.equal(1);
      });

      it("Should accept maximum priority of 100", async function () {
        const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
        await intentModule.connect(creator).addGoal("High Priority Goal", constraintsHash, 100);

        const goals = await intentModule.getGoals(creator.address);
        expect(goals[0].priority).to.equal(100);
      });
    });

    it("Should reject goal if no intent captured", async function () {
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
      await expect(
        intentModule.connect(creator2).addGoal("Goal", constraintsHash, 50)
      ).to.be.revertedWith("Intent not captured");
    });
  });

  describe("Version Signing", function () {
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent"));
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));
    const versionHash = ethers.keccak256(ethers.toUtf8Bytes("Version 1"));

    beforeEach(async function () {
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

    it("Should sign a version", async function () {
      await intentModule.connect(creator).signVersion(versionHash);
      expect(await intentModule.isVersionSigned(creator.address, versionHash)).to.equal(true);
    });

    it("Should not return true for unsigned version", async function () {
      const unsignedHash = ethers.keccak256(ethers.toUtf8Bytes("Unsigned"));
      expect(await intentModule.isVersionSigned(creator.address, unsignedHash)).to.equal(false);
    });

    it("Should allow signing multiple versions", async function () {
      const version2 = ethers.keccak256(ethers.toUtf8Bytes("Version 2"));
      const version3 = ethers.keccak256(ethers.toUtf8Bytes("Version 3"));

      await intentModule.connect(creator).signVersion(versionHash);
      await intentModule.connect(creator).signVersion(version2);
      await intentModule.connect(creator).signVersion(version3);

      expect(await intentModule.isVersionSigned(creator.address, versionHash)).to.equal(true);
      expect(await intentModule.isVersionSigned(creator.address, version2)).to.equal(true);
      expect(await intentModule.isVersionSigned(creator.address, version3)).to.equal(true);
    });

    it("Should reject version signing if no intent captured", async function () {
      await expect(
        intentModule.connect(creator2).signVersion(versionHash)
      ).to.be.revertedWith("Intent not captured");
    });
  });

  describe("Revocation", function () {
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent"));
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
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

    it("Should revoke intent", async function () {
      await intentModule.connect(creator).revokeIntent();

      const intent = await intentModule.getIntent(creator.address);
      expect(intent.isRevoked).to.equal(true);
    });

    it("Should emit IntentRevoked event", async function () {
      await expect(intentModule.connect(creator).revokeIntent())
        .to.emit(intentModule, "IntentRevoked");
    });

    it("Should not allow re-capture after revocation", async function () {
      await intentModule.connect(creator).revokeIntent();

      await expect(
        intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus",
          "ipfs://assets",
          2020,
          2025,
          [await ipToken.getAddress()]
        )
      ).to.be.revertedWith("Intent has been revoked");
    });

    it("Should not allow adding goals after revocation", async function () {
      await intentModule.connect(creator).revokeIntent();
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));

      await expect(
        intentModule.connect(creator).addGoal("Goal", constraintsHash, 50)
      ).to.be.revertedWith("Intent has been revoked");
    });

    it("Should not allow signing versions after revocation", async function () {
      await intentModule.connect(creator).revokeIntent();
      const versionHash = ethers.keccak256(ethers.toUtf8Bytes("Version"));

      await expect(
        intentModule.connect(creator).signVersion(versionHash)
      ).to.be.revertedWith("Intent has been revoked");
    });

    it("Should reject revocation if no intent captured", async function () {
      await expect(
        intentModule.connect(creator2).revokeIntent()
      ).to.be.revertedWith("Intent not captured");
    });
  });

  describe("Trigger Mechanism Management", function () {
    it("Should set trigger mechanism as owner", async function () {
      await intentModule.connect(owner).setTriggerMechanism(triggerMechanism.address);
      expect(await intentModule.triggerMechanism()).to.equal(triggerMechanism.address);
    });

    it("Should emit TriggerMechanismSet event", async function () {
      await expect(
        intentModule.connect(owner).setTriggerMechanism(triggerMechanism.address)
      ).to.emit(intentModule, "TriggerMechanismSet")
        .withArgs(ethers.ZeroAddress, triggerMechanism.address);
    });

    it("Should reject zero address for trigger mechanism", async function () {
      await expect(
        intentModule.connect(owner).setTriggerMechanism(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("Should reject non-owner setting trigger mechanism", async function () {
      await expect(
        intentModule.connect(creator).setTriggerMechanism(triggerMechanism.address)
      ).to.be.revertedWithCustomError(intentModule, "OwnableUnauthorizedAccount");
    });

    it("Should allow updating trigger mechanism", async function () {
      await intentModule.connect(owner).setTriggerMechanism(triggerMechanism.address);
      await intentModule.connect(owner).setTriggerMechanism(creator.address);

      expect(await intentModule.triggerMechanism()).to.equal(creator.address);
    });
  });

  describe("Triggering Intent", function () {
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My Intent"));
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    beforeEach(async function () {
      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      await intentModule.connect(owner).setTriggerMechanism(triggerMechanism.address);
    });

    it("Should trigger intent from trigger mechanism", async function () {
      await intentModule.connect(triggerMechanism).triggerIntent(creator.address);

      const intent = await intentModule.getIntent(creator.address);
      expect(intent.isTriggered).to.equal(true);
    });

    it("Should emit IntentTriggered event", async function () {
      await expect(intentModule.connect(triggerMechanism).triggerIntent(creator.address))
        .to.emit(intentModule, "IntentTriggered");
    });

    it("Should reject trigger from non-trigger mechanism", async function () {
      await expect(
        intentModule.connect(owner).triggerIntent(creator.address)
      ).to.be.revertedWith("Only TriggerMechanism can trigger");
    });

    it("Should reject triggering revoked intent", async function () {
      await intentModule.connect(creator).revokeIntent();

      await expect(
        intentModule.connect(triggerMechanism).triggerIntent(creator.address)
      ).to.be.revertedWith("Intent has been revoked");
    });

    it("Should reject triggering non-existent intent", async function () {
      await expect(
        intentModule.connect(triggerMechanism).triggerIntent(creator2.address)
      ).to.be.revertedWith("Intent not captured");
    });

    it("Should reject triggering already triggered intent", async function () {
      await intentModule.connect(triggerMechanism).triggerIntent(creator.address);

      await expect(
        intentModule.connect(triggerMechanism).triggerIntent(creator.address)
      ).to.be.revertedWith("Already triggered");
    });

    it("Should not allow capture after trigger", async function () {
      await intentModule.connect(triggerMechanism).triggerIntent(creator.address);

      await expect(
        intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus",
          "ipfs://assets",
          2020,
          2025,
          [await ipToken.getAddress()]
        )
      ).to.be.revertedWith("Intent already triggered");
    });

    it("Should not allow adding goals after trigger", async function () {
      await intentModule.connect(triggerMechanism).triggerIntent(creator.address);
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));

      await expect(
        intentModule.connect(creator).addGoal("Goal", constraintsHash, 50)
      ).to.be.revertedWith("Intent already triggered");
    });

    it("Should not allow signing versions after trigger", async function () {
      await intentModule.connect(triggerMechanism).triggerIntent(creator.address);
      const versionHash = ethers.keccak256(ethers.toUtf8Bytes("Version"));

      await expect(
        intentModule.connect(creator).signVersion(versionHash)
      ).to.be.revertedWith("Intent already triggered");
    });

    it("Should not allow revocation after trigger", async function () {
      await intentModule.connect(triggerMechanism).triggerIntent(creator.address);

      await expect(
        intentModule.connect(creator).revokeIntent()
      ).to.be.revertedWith("Intent already triggered");
    });
  });

  describe("Limit Enforcement", function () {
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Intent"));
    const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Corpus"));

    it("Should reject adding more than MAX_GOALS (50) goals", async function () {
      await intentModule.connect(creator).captureIntent(
        intentHash,
        corpusHash,
        "ipfs://corpus",
        "ipfs://assets",
        2020,
        2025,
        [await ipToken.getAddress()]
      );

      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("Constraints"));
      for (let i = 0; i < 50; i++) {
        await intentModule.connect(creator).addGoal(`Goal ${i}`, constraintsHash, 50);
      }

      await expect(
        intentModule.connect(creator).addGoal("Goal 51", constraintsHash, 50)
      ).to.be.revertedWith("Maximum goals reached");
    });

    it("Should reject capturing intent with more than MAX_ASSETS (100) addresses", async function () {
      const assets = new Array(101).fill(await ipToken.getAddress());

      await expect(
        intentModule.connect(creator).captureIntent(
          intentHash,
          corpusHash,
          "ipfs://corpus",
          "ipfs://assets",
          2020,
          2025,
          assets
        )
      ).to.be.revertedWith("Too many assets");
    });
  });
});

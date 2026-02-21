import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TriggerMechanism", function () {
  let intentModule, triggerMechanism, ipToken;
  let owner, creator, signer1, signer2, signer3, oracle1, oracle2;

  const THIRTY_DAYS = 30 * 24 * 60 * 60;
  const NINETY_DAYS = 90 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, creator, signer1, signer2, signer3, oracle1, oracle2] = await ethers.getSigners();

    // Deploy IntentCaptureModule
    const IntentCaptureModule = await ethers.getContractFactory("IntentCaptureModule");
    intentModule = await IntentCaptureModule.deploy();
    await intentModule.waitForDeployment();

    // Deploy TriggerMechanism
    const TriggerMechanism = await ethers.getContractFactory("TriggerMechanism");
    triggerMechanism = await TriggerMechanism.deploy(await intentModule.getAddress());
    await triggerMechanism.waitForDeployment();

    // Link TriggerMechanism to IntentModule
    await intentModule.setTriggerMechanism(await triggerMechanism.getAddress());

    // Deploy IPToken for asset registration
    const IPToken = await ethers.getContractFactory("IPToken");
    ipToken = await IPToken.deploy();
    await ipToken.waitForDeployment();

    // Capture intent for creator
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

  describe("Deployment", function () {
    it("Should set correct intent module address", async function () {
      expect(await triggerMechanism.intentModule()).to.equal(await intentModule.getAddress());
    });

    it("Should set deployer as owner", async function () {
      expect(await triggerMechanism.owner()).to.equal(owner.address);
    });

    it("Should have correct MIN_CONFIDENCE_THRESHOLD", async function () {
      expect(await triggerMechanism.MIN_CONFIDENCE_THRESHOLD()).to.equal(95);
    });
  });

  describe("Deadman Switch", function () {
    describe("Configuration", function () {
      it("Should configure deadman switch with valid interval", async function () {
        await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.isConfigured).to.equal(true);
        expect(config.triggerType).to.equal(0); // DeadmanSwitch
        expect(config.deadmanInterval).to.equal(NINETY_DAYS);
        expect(config.isTriggered).to.equal(false);
      });

      it("Should emit TriggerConfigured event", async function () {
        await expect(
          triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS)
        ).to.emit(triggerMechanism, "TriggerConfigured")
          .withArgs(creator.address, 0); // DeadmanSwitch = 0
      });

      it("Should reject interval less than 30 days", async function () {
        const twentyNineDays = 29 * 24 * 60 * 60;
        await expect(
          triggerMechanism.connect(creator).configureDeadmanSwitch(twentyNineDays)
        ).to.be.revertedWith("Interval must be at least 30 days");
      });

      it("Should accept exactly 30 days", async function () {
        await triggerMechanism.connect(creator).configureDeadmanSwitch(THIRTY_DAYS);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.deadmanInterval).to.equal(THIRTY_DAYS);
      });

      it("Should set lastCheckIn to current timestamp", async function () {
        await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        const blockTimestamp = await time.latest();
        expect(config.lastCheckIn).to.equal(blockTimestamp);
      });
    });

    describe("Check-In", function () {
      beforeEach(async function () {
        await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);
      });

      it("Should update lastCheckIn on check-in", async function () {
        await time.increase(THIRTY_DAYS);
        await triggerMechanism.connect(creator).checkIn();

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        const blockTimestamp = await time.latest();
        expect(config.lastCheckIn).to.equal(blockTimestamp);
      });

      it("Should emit DeadmanCheckIn event", async function () {
        await time.increase(THIRTY_DAYS);

        await expect(triggerMechanism.connect(creator).checkIn())
          .to.emit(triggerMechanism, "DeadmanCheckIn");
      });

      it("Should reject check-in if trigger not configured", async function () {
        await expect(
          triggerMechanism.connect(signer1).checkIn()
        ).to.be.revertedWith("Trigger not configured");
      });

      it("Should reject check-in if not a deadman switch", async function () {
        // Configure as quorum instead
        await triggerMechanism.connect(signer1).configureTrustedQuorum(
          [signer2.address, signer3.address],
          2
        );

        await expect(
          triggerMechanism.connect(signer1).checkIn()
        ).to.be.revertedWith("Not a deadman switch");
      });
    });

    describe("Execution", function () {
      beforeEach(async function () {
        await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);
      });

      it("Should execute deadman switch after interval elapsed", async function () {
        await time.increase(NINETY_DAYS + 1);

        await triggerMechanism.executeDeadmanSwitch(creator.address);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.isTriggered).to.equal(true);

        const intent = await intentModule.getIntent(creator.address);
        expect(intent.isTriggered).to.equal(true);
      });

      it("Should emit IntentTriggered event", async function () {
        await time.increase(NINETY_DAYS + 1);

        await expect(triggerMechanism.executeDeadmanSwitch(creator.address))
          .to.emit(triggerMechanism, "IntentTriggered");
      });

      it("Should reject if interval not elapsed", async function () {
        await time.increase(NINETY_DAYS - 100);

        await expect(
          triggerMechanism.executeDeadmanSwitch(creator.address)
        ).to.be.revertedWith("Deadman interval not elapsed");
      });

      it("Should reject if already triggered", async function () {
        await time.increase(NINETY_DAYS + 1);
        await triggerMechanism.executeDeadmanSwitch(creator.address);

        await expect(
          triggerMechanism.executeDeadmanSwitch(creator.address)
        ).to.be.revertedWith("Already triggered");
      });

      it("Should reset timer with check-in", async function () {
        await time.increase(NINETY_DAYS - 100);
        await triggerMechanism.connect(creator).checkIn();

        await time.increase(NINETY_DAYS - 100);

        // Should fail because check-in reset the timer
        await expect(
          triggerMechanism.executeDeadmanSwitch(creator.address)
        ).to.be.revertedWith("Deadman interval not elapsed");
      });
    });
  });

  describe("Trusted Quorum", function () {
    describe("Configuration", function () {
      it("Should configure trusted quorum", async function () {
        await triggerMechanism.connect(creator).configureTrustedQuorum(
          [signer1.address, signer2.address, signer3.address],
          2
        );

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.isConfigured).to.equal(true);
        expect(config.triggerType).to.equal(1); // TrustedQuorum
        expect(config.requiredSignatures).to.equal(2);
      });

      it("Should emit TriggerConfigured event", async function () {
        await expect(
          triggerMechanism.connect(creator).configureTrustedQuorum(
            [signer1.address, signer2.address],
            2
          )
        ).to.emit(triggerMechanism, "TriggerConfigured")
          .withArgs(creator.address, 1); // TrustedQuorum = 1
      });

      it("Should reject if required signatures less than 2", async function () {
        await expect(
          triggerMechanism.connect(creator).configureTrustedQuorum(
            [signer1.address, signer2.address],
            1
          )
        ).to.be.revertedWith("Must require at least 2 signatures");
      });

      it("Should reject if not enough signers for required signatures", async function () {
        await expect(
          triggerMechanism.connect(creator).configureTrustedQuorum(
            [signer1.address],
            2
          )
        ).to.be.revertedWith("Not enough signers");
      });
    });

    describe("Signature Submission", function () {
      beforeEach(async function () {
        await triggerMechanism.connect(creator).configureTrustedQuorum(
          [signer1.address, signer2.address, signer3.address],
          2
        );
      });

      it("Should accept signature from trusted signer", async function () {
        await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);

        expect(await triggerMechanism.hasSignedTrigger(creator.address, signer1.address)).to.equal(true);
        expect(await triggerMechanism.signatureCount(creator.address)).to.equal(1);
      });

      it("Should emit TrustedSignatureReceived event", async function () {
        await expect(
          triggerMechanism.connect(signer1).submitTrustedSignature(creator.address)
        ).to.emit(triggerMechanism, "TrustedSignatureReceived")
          .withArgs(creator.address, signer1.address);
      });

      it("Should reject signature from non-trusted signer", async function () {
        await expect(
          triggerMechanism.connect(oracle1).submitTrustedSignature(creator.address)
        ).to.be.revertedWith("Not a trusted signer");
      });

      it("Should reject duplicate signature", async function () {
        await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);

        await expect(
          triggerMechanism.connect(signer1).submitTrustedSignature(creator.address)
        ).to.be.revertedWith("Already signed");
      });

      it("Should trigger when quorum reached", async function () {
        await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);
        await triggerMechanism.connect(signer2).submitTrustedSignature(creator.address);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.isTriggered).to.equal(true);

        const intent = await intentModule.getIntent(creator.address);
        expect(intent.isTriggered).to.equal(true);
      });

      it("Should not trigger before quorum", async function () {
        await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.isTriggered).to.equal(false);
      });
    });
  });

  describe("Oracle Verified (Legacy Direct Mode)", function () {
    describe("Configuration", function () {
      it("Should configure oracle verified trigger", async function () {
        await triggerMechanism.connect(creator).configureOracleVerified([oracle1.address, oracle2.address]);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.isConfigured).to.equal(true);
        expect(config.triggerType).to.equal(2); // OracleVerified

        const oracleConfig = await triggerMechanism.getOracleConfig(creator.address);
        expect(oracleConfig.mode).to.equal(0); // Direct
      });

      it("Should emit TriggerConfigured event", async function () {
        await expect(
          triggerMechanism.connect(creator).configureOracleVerified([oracle1.address])
        ).to.emit(triggerMechanism, "TriggerConfigured")
          .withArgs(creator.address, 2); // OracleVerified = 2
      });

      it("Should reject empty oracle array", async function () {
        await expect(
          triggerMechanism.connect(creator).configureOracleVerified([])
        ).to.be.revertedWith("Must specify at least one oracle");
      });
    });

    describe("Oracle Proof Submission", function () {
      beforeEach(async function () {
        await triggerMechanism.connect(creator).configureOracleVerified([oracle1.address, oracle2.address]);
      });

      it("Should accept proof from authorized oracle", async function () {
        const proof = ethers.toUtf8Bytes("ZK proof data");
        await triggerMechanism.connect(oracle1).submitOracleProof(creator.address, proof);

        const config = await triggerMechanism.getTriggerConfig(creator.address);
        expect(config.isTriggered).to.equal(true);
      });

      it("Should emit OracleProofSubmitted event", async function () {
        const proof = ethers.toUtf8Bytes("ZK proof data");
        await expect(
          triggerMechanism.connect(oracle1).submitOracleProof(creator.address, proof)
        ).to.emit(triggerMechanism, "OracleProofSubmitted")
          .withArgs(creator.address, oracle1.address);
      });

      it("Should reject proof from unauthorized oracle", async function () {
        const proof = ethers.toUtf8Bytes("ZK proof data");
        await expect(
          triggerMechanism.connect(signer1).submitOracleProof(creator.address, proof)
        ).to.be.revertedWith("Not an authorized oracle");
      });

      it("Should reject proof for already triggered intent", async function () {
        const proof = ethers.toUtf8Bytes("ZK proof data");
        await triggerMechanism.connect(oracle1).submitOracleProof(creator.address, proof);

        await expect(
          triggerMechanism.connect(oracle2).submitOracleProof(creator.address, proof)
        ).to.be.revertedWith("Already triggered");
      });
    });
  });

  describe("Oracle Registry Setup", function () {
    it("Should set oracle registry", async function () {
      const dummyRegistryAddress = signer1.address;
      await triggerMechanism.connect(owner).setOracleRegistry(dummyRegistryAddress);

      expect(await triggerMechanism.oracleRegistry()).to.equal(dummyRegistryAddress);
    });

    it("Should emit OracleRegistrySet event", async function () {
      const dummyRegistryAddress = signer1.address;
      await expect(
        triggerMechanism.connect(owner).setOracleRegistry(dummyRegistryAddress)
      ).to.emit(triggerMechanism, "OracleRegistrySet");
    });

    it("Should reject zero address", async function () {
      await expect(
        triggerMechanism.connect(owner).setOracleRegistry(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid registry address");
    });

    it("Should reject from non-owner", async function () {
      await expect(
        triggerMechanism.connect(creator).setOracleRegistry(signer1.address)
      ).to.be.revertedWithCustomError(triggerMechanism, "OwnableUnauthorizedAccount");
    });
  });

  describe("ZK Verifier Setup", function () {
    it("Should set ZK verifier", async function () {
      const dummyVerifierAddress = signer1.address;
      await triggerMechanism.connect(owner).setZKVerifier(dummyVerifierAddress);

      expect(await triggerMechanism.zkVerifier()).to.equal(dummyVerifierAddress);
    });

    it("Should emit ZKVerifierSet event", async function () {
      const dummyVerifierAddress = signer1.address;
      await expect(
        triggerMechanism.connect(owner).setZKVerifier(dummyVerifierAddress)
      ).to.emit(triggerMechanism, "ZKVerifierSet");
    });

    it("Should reject zero address", async function () {
      await expect(
        triggerMechanism.connect(owner).setZKVerifier(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid verifier address");
    });

    it("Should reject from non-owner", async function () {
      await expect(
        triggerMechanism.connect(creator).setZKVerifier(signer1.address)
      ).to.be.revertedWithCustomError(triggerMechanism, "OwnableUnauthorizedAccount");
    });
  });

  describe("Reconfiguration Prevention", function () {
    it("Should reject reconfiguring after trigger - deadman", async function () {
      await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);
      await time.increase(NINETY_DAYS + 1);
      await triggerMechanism.executeDeadmanSwitch(creator.address);

      await expect(
        triggerMechanism.connect(creator).configureDeadmanSwitch(THIRTY_DAYS)
      ).to.be.revertedWith("Already triggered");
    });

    it("Should reject reconfiguring after trigger - quorum", async function () {
      await triggerMechanism.connect(creator).configureTrustedQuorum(
        [signer1.address, signer2.address],
        2
      );
      await triggerMechanism.connect(signer1).submitTrustedSignature(creator.address);
      await triggerMechanism.connect(signer2).submitTrustedSignature(creator.address);

      await expect(
        triggerMechanism.connect(creator).configureTrustedQuorum([signer3.address, oracle1.address], 2)
      ).to.be.revertedWith("Already triggered");
    });

    it("Should reject reconfiguring after trigger - oracle", async function () {
      await triggerMechanism.connect(creator).configureOracleVerified([oracle1.address]);
      const proof = ethers.toUtf8Bytes("proof");
      await triggerMechanism.connect(oracle1).submitOracleProof(creator.address, proof);

      await expect(
        triggerMechanism.connect(creator).configureOracleVerified([oracle2.address])
      ).to.be.revertedWith("Already triggered");
    });
  });

  describe("View Functions", function () {
    it("Should return empty config for unconfigured trigger", async function () {
      const config = await triggerMechanism.getTriggerConfig(signer1.address);
      expect(config.isConfigured).to.equal(false);
    });

    it("Should return correct oracle config after setup", async function () {
      await triggerMechanism.connect(creator).configureOracleVerified([oracle1.address]);

      const oracleConfig = await triggerMechanism.getOracleConfig(creator.address);
      expect(oracleConfig.mode).to.equal(0); // Direct
      expect(oracleConfig.requiredConfidence).to.equal(95);
    });

    it("Should return false for verification pending on unconfigured", async function () {
      expect(await triggerMechanism.isVerificationPending(creator.address)).to.equal(false);
    });
  });

  describe("Limit Enforcement", function () {
    it("Should reject configuring quorum with more than MAX_TRUSTED_SIGNERS (20)", async function () {
      const signers = [];
      for (let i = 0; i < 21; i++) {
        const wallet = ethers.Wallet.createRandom();
        signers.push(wallet.address);
      }

      await expect(
        triggerMechanism.connect(creator).configureTrustedQuorum(signers, 2)
      ).to.be.revertedWith("Too many signers");
    });

    it("Should reject configuring oracle with more than MAX_ORACLES (10)", async function () {
      const oracles = [];
      for (let i = 0; i < 11; i++) {
        const wallet = ethers.Wallet.createRandom();
        oracles.push(wallet.address);
      }

      await expect(
        triggerMechanism.connect(creator).configureOracleVerified(oracles)
      ).to.be.revertedWith("Too many oracles");
    });

    it("Should reject submitOracleProof with empty proof data", async function () {
      await triggerMechanism.connect(creator).configureOracleVerified([oracle1.address]);

      await expect(
        triggerMechanism.connect(oracle1).submitOracleProof(creator.address, "0x")
      ).to.be.revertedWith("Proof data required");
    });

    it("Should reject check-in after deadman switch has triggered", async function () {
      await triggerMechanism.connect(creator).configureDeadmanSwitch(NINETY_DAYS);
      await time.increase(NINETY_DAYS + 1);
      await triggerMechanism.executeDeadmanSwitch(creator.address);

      await expect(
        triggerMechanism.connect(creator).checkIn()
      ).to.be.revertedWith("Already triggered");
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("IPToken", function () {
  let ipToken;
  let owner, minter, executor, creator, licensee, recipient;

  const ONE_YEAR = 365 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, minter, executor, creator, licensee, recipient] = await ethers.getSigners();

    const IPToken = await ethers.getContractFactory("IPToken");
    ipToken = await IPToken.deploy();
    await ipToken.waitForDeployment();

    // Grant roles
    const MINTER_ROLE = await ipToken.MINTER_ROLE();
    const EXECUTOR_ROLE = await ipToken.EXECUTOR_ROLE();
    await ipToken.grantRole(MINTER_ROLE, minter.address);
    await ipToken.grantRole(EXECUTOR_ROLE, executor.address);
  });

  describe("Deployment", function () {
    it("Should set correct name and symbol", async function () {
      expect(await ipToken.name()).to.equal("Finite Intent IP Token");
      expect(await ipToken.symbol()).to.equal("FIIPT");
    });

    it("Should grant admin, minter, and executor roles to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await ipToken.DEFAULT_ADMIN_ROLE();
      const MINTER_ROLE = await ipToken.MINTER_ROLE();
      const EXECUTOR_ROLE = await ipToken.EXECUTOR_ROLE();

      expect(await ipToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await ipToken.hasRole(MINTER_ROLE, owner.address)).to.equal(true);
      expect(await ipToken.hasRole(EXECUTOR_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("IP Minting", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Article content"));

    it("Should mint IP token successfully", async function () {
      await ipToken.connect(minter).mintIP(
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
      expect(ipAsset.description).to.equal("A groundbreaking article");
      expect(ipAsset.ipType).to.equal("article");
      expect(ipAsset.creator).to.equal(creator.address);
      expect(ipAsset.contentHash).to.equal(contentHash);
      expect(ipAsset.isPublicDomain).to.equal(false);
      expect(ipAsset.licenseType).to.equal("CC-BY-4.0");
    });

    it("Should emit IPMinted event", async function () {
      await expect(
        ipToken.connect(minter).mintIP(
          creator.address,
          "My Article",
          "Description",
          "article",
          contentHash,
          "ipfs://uri",
          "CC-BY"
        )
      ).to.emit(ipToken, "IPMinted")
        .withArgs(0, creator.address, "My Article", "article");
    });

    it("Should assign token to creator", async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "code",
        contentHash,
        "ipfs://uri",
        "MIT"
      );

      expect(await ipToken.ownerOf(0)).to.equal(creator.address);
    });

    it("Should set default royalty to 10%", async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "code",
        contentHash,
        "ipfs://uri",
        "MIT"
      );

      const royaltyInfo = await ipToken.getRoyaltyInfo(0);
      expect(royaltyInfo.recipient).to.equal(creator.address);
      expect(royaltyInfo.percentage).to.equal(1000); // 10%
    });

    it("Should track creator tokens", async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "Work 1",
        "Desc 1",
        "article",
        contentHash,
        "ipfs://uri1",
        "CC-BY"
      );

      await ipToken.connect(minter).mintIP(
        creator.address,
        "Work 2",
        "Desc 2",
        "code",
        ethers.keccak256(ethers.toUtf8Bytes("Code")),
        "ipfs://uri2",
        "MIT"
      );

      const tokens = await ipToken.getCreatorTokens(creator.address);
      expect(tokens.length).to.equal(2);
      expect(tokens[0]).to.equal(0);
      expect(tokens[1]).to.equal(1);
    });

    it("Should increment token IDs", async function () {
      await ipToken.connect(minter).mintIP(creator.address, "W1", "D1", "a", contentHash, "u1", "L1");
      await ipToken.connect(minter).mintIP(licensee.address, "W2", "D2", "b", contentHash, "u2", "L2");
      await ipToken.connect(minter).mintIP(recipient.address, "W3", "D3", "c", contentHash, "u3", "L3");

      expect(await ipToken.ownerOf(0)).to.equal(creator.address);
      expect(await ipToken.ownerOf(1)).to.equal(licensee.address);
      expect(await ipToken.ownerOf(2)).to.equal(recipient.address);
    });

    it("Should set token URI", async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "music",
        contentHash,
        "ipfs://metadata-uri",
        "CC-BY"
      );

      expect(await ipToken.tokenURI(0)).to.equal("ipfs://metadata-uri");
    });

    it("Should reject from non-minter", async function () {
      await expect(
        ipToken.connect(creator).mintIP(
          creator.address,
          "Work",
          "Desc",
          "art",
          contentHash,
          "uri",
          "CC-BY"
        )
      ).to.be.revertedWithCustomError(ipToken, "AccessControlUnauthorizedAccount");
    });

    it("Should support different IP types", async function () {
      const types = ["article", "code", "music", "art", "video", "research"];

      for (let i = 0; i < types.length; i++) {
        await ipToken.connect(minter).mintIP(
          creator.address,
          `Work ${i}`,
          `Desc ${i}`,
          types[i],
          ethers.keccak256(ethers.toUtf8Bytes(`Content ${i}`)),
          `ipfs://uri${i}`,
          "CC-BY"
        );

        const asset = await ipToken.getIPAsset(i);
        expect(asset.ipType).to.equal(types[i]);
      }
    });
  });

  describe("License Granting", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "code",
        contentHash,
        "ipfs://uri",
        "MIT"
      );
    });

    it("Should grant license successfully", async function () {
      await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);

      const licenses = await ipToken.getLicenses(0);
      expect(licenses.length).to.equal(1);
      expect(licenses[0].licensee).to.equal(licensee.address);
      expect(licenses[0].royaltyPercentage).to.equal(500);
      expect(licenses[0].isActive).to.equal(true);
    });

    it("Should emit LicenseGranted event", async function () {
      await expect(
        ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR)
      ).to.emit(ipToken, "LicenseGranted")
        .withArgs(0, licensee.address, 500, ONE_YEAR);
    });

    it("Should set correct license duration", async function () {
      const tx = await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      const licenses = await ipToken.getLicenses(0);
      expect(licenses[0].startTime).to.equal(block.timestamp);
      expect(licenses[0].endTime).to.equal(block.timestamp + ONE_YEAR);
    });

    it("Should allow multiple licenses", async function () {
      await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);
      await ipToken.connect(executor).grantLicense(0, recipient.address, 300, ONE_YEAR * 2);

      const licenses = await ipToken.getLicenses(0);
      expect(licenses.length).to.equal(2);
    });

    it("Should reject royalty above 100%", async function () {
      await expect(
        ipToken.connect(executor).grantLicense(0, licensee.address, 10001, ONE_YEAR)
      ).to.be.revertedWith("Royalty cannot exceed 100%");
    });

    it("Should accept exactly 100% royalty", async function () {
      await ipToken.connect(executor).grantLicense(0, licensee.address, 10000, ONE_YEAR);

      const licenses = await ipToken.getLicenses(0);
      expect(licenses[0].royaltyPercentage).to.equal(10000);
    });

    it("Should reject for non-existent token", async function () {
      await expect(
        ipToken.connect(executor).grantLicense(999, licensee.address, 500, ONE_YEAR)
      ).to.be.revertedWith("Token does not exist");
    });

    it("Should reject for public domain IP", async function () {
      await ipToken.connect(executor).transitionToPublicDomain(0);

      await expect(
        ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR)
      ).to.be.revertedWith("IP is in public domain");
    });

    it("Should reject from non-executor", async function () {
      await expect(
        ipToken.connect(creator).grantLicense(0, licensee.address, 500, ONE_YEAR)
      ).to.be.revertedWithCustomError(ipToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Royalty Payment", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));
    const paymentAmount = ethers.parseEther("1.0");

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "code",
        contentHash,
        "ipfs://uri",
        "MIT"
      );

      await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);
    });

    it("Should pay royalty successfully", async function () {
      const creatorBalanceBefore = await ethers.provider.getBalance(creator.address);

      await ipToken.connect(recipient).payRoyalty(0, { value: paymentAmount });

      const creatorBalanceAfter = await ethers.provider.getBalance(creator.address);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(paymentAmount);
    });

    it("Should emit RoyaltyPaid event", async function () {
      await expect(
        ipToken.connect(recipient).payRoyalty(0, { value: paymentAmount })
      ).to.emit(ipToken, "RoyaltyPaid")
        .withArgs(0, recipient.address, creator.address, paymentAmount);
    });

    it("Should emit RevenueCollected event", async function () {
      await expect(
        ipToken.connect(recipient).payRoyalty(0, { value: paymentAmount })
      ).to.emit(ipToken, "RevenueCollected")
        .withArgs(0, paymentAmount);
    });

    it("Should track revenue for active license", async function () {
      await ipToken.connect(recipient).payRoyalty(0, { value: paymentAmount });

      const licenses = await ipToken.getLicenses(0);
      expect(licenses[0].revenueGenerated).to.equal(paymentAmount);
    });

    it("Should reject zero payment", async function () {
      await expect(
        ipToken.connect(recipient).payRoyalty(0, { value: 0 })
      ).to.be.revertedWith("Must send payment");
    });

    it("Should reject for non-existent token", async function () {
      await expect(
        ipToken.connect(recipient).payRoyalty(999, { value: paymentAmount })
      ).to.be.revertedWith("Token does not exist");
    });

    it("Should not track revenue for expired license", async function () {
      await time.increase(ONE_YEAR + 1);

      await ipToken.connect(recipient).payRoyalty(0, { value: paymentAmount });

      const licenses = await ipToken.getLicenses(0);
      expect(licenses[0].revenueGenerated).to.equal(0);
    });

    it("Should handle multiple royalty payments", async function () {
      await ipToken.connect(recipient).payRoyalty(0, { value: paymentAmount });
      await ipToken.connect(licensee).payRoyalty(0, { value: paymentAmount });

      const licenses = await ipToken.getLicenses(0);
      expect(licenses[0].revenueGenerated).to.equal(paymentAmount * 2n);
    });
  });

  describe("Public Domain Transition", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "music",
        contentHash,
        "ipfs://uri",
        "All Rights Reserved"
      );

      await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);
    });

    it("Should transition to public domain", async function () {
      await ipToken.connect(executor).transitionToPublicDomain(0);

      const ipAsset = await ipToken.getIPAsset(0);
      expect(ipAsset.isPublicDomain).to.equal(true);
      expect(ipAsset.licenseType).to.equal("CC0");
    });

    it("Should emit TransitionedToPublicDomain event", async function () {
      await expect(
        ipToken.connect(executor).transitionToPublicDomain(0)
      ).to.emit(ipToken, "TransitionedToPublicDomain");
    });

    it("Should deactivate all licenses", async function () {
      await ipToken.connect(executor).grantLicense(0, recipient.address, 300, ONE_YEAR);

      await ipToken.connect(executor).transitionToPublicDomain(0);

      const licenses = await ipToken.getLicenses(0);
      expect(licenses[0].isActive).to.equal(false);
      expect(licenses[1].isActive).to.equal(false);
    });

    it("Should reject double transition", async function () {
      await ipToken.connect(executor).transitionToPublicDomain(0);

      await expect(
        ipToken.connect(executor).transitionToPublicDomain(0)
      ).to.be.revertedWith("Already public domain");
    });

    it("Should reject for non-existent token", async function () {
      await expect(
        ipToken.connect(executor).transitionToPublicDomain(999)
      ).to.be.revertedWith("Token does not exist");
    });

    it("Should reject from non-executor", async function () {
      await expect(
        ipToken.connect(creator).transitionToPublicDomain(0)
      ).to.be.revertedWithCustomError(ipToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Royalty Info Update", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "art",
        contentHash,
        "ipfs://uri",
        "CC-BY"
      );
    });

    it("Should update royalty info", async function () {
      await ipToken.connect(executor).setRoyaltyInfo(0, recipient.address, 2000);

      const royaltyInfo = await ipToken.getRoyaltyInfo(0);
      expect(royaltyInfo.recipient).to.equal(recipient.address);
      expect(royaltyInfo.percentage).to.equal(2000);
    });

    it("Should reject percentage above 100%", async function () {
      await expect(
        ipToken.connect(executor).setRoyaltyInfo(0, recipient.address, 10001)
      ).to.be.revertedWith("Percentage cannot exceed 100%");
    });

    it("Should accept exactly 100%", async function () {
      await ipToken.connect(executor).setRoyaltyInfo(0, recipient.address, 10000);

      const royaltyInfo = await ipToken.getRoyaltyInfo(0);
      expect(royaltyInfo.percentage).to.equal(10000);
    });

    it("Should reject for non-existent token", async function () {
      await expect(
        ipToken.connect(executor).setRoyaltyInfo(999, recipient.address, 1000)
      ).to.be.revertedWith("Token does not exist");
    });

    it("Should reject from non-executor", async function () {
      await expect(
        ipToken.connect(creator).setRoyaltyInfo(0, recipient.address, 1000)
      ).to.be.revertedWithCustomError(ipToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("License Active Check", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "code",
        contentHash,
        "ipfs://uri",
        "MIT"
      );

      await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);
    });

    it("Should return true for active license", async function () {
      expect(await ipToken.isLicenseActive(0, 0)).to.equal(true);
    });

    it("Should return false for expired license", async function () {
      await time.increase(ONE_YEAR + 1);
      expect(await ipToken.isLicenseActive(0, 0)).to.equal(false);
    });

    it("Should return false for deactivated license", async function () {
      await ipToken.connect(executor).transitionToPublicDomain(0);
      expect(await ipToken.isLicenseActive(0, 0)).to.equal(false);
    });

    it("Should reject invalid license index", async function () {
      await expect(
        ipToken.isLicenseActive(0, 999)
      ).to.be.revertedWith("Invalid license index");
    });
  });

  describe("ERC721 Interface", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "art",
        contentHash,
        "ipfs://uri",
        "CC-BY"
      );
    });

    it("Should support ERC721 interface", async function () {
      // ERC721 interface ID
      expect(await ipToken.supportsInterface("0x80ac58cd")).to.equal(true);
    });

    it("Should support ERC721Metadata interface", async function () {
      // ERC721Metadata interface ID
      expect(await ipToken.supportsInterface("0x5b5e139f")).to.equal(true);
    });

    it("Should support AccessControl interface", async function () {
      // AccessControl interface ID
      expect(await ipToken.supportsInterface("0x7965db0b")).to.equal(true);
    });

    it("Should allow token transfer", async function () {
      await ipToken.connect(creator).transferFrom(creator.address, recipient.address, 0);
      expect(await ipToken.ownerOf(0)).to.equal(recipient.address);
    });

    it("Should track balance correctly", async function () {
      expect(await ipToken.balanceOf(creator.address)).to.equal(1);

      await ipToken.connect(minter).mintIP(
        creator.address,
        "Work 2",
        "Desc",
        "code",
        contentHash,
        "ipfs://uri2",
        "MIT"
      );

      expect(await ipToken.balanceOf(creator.address)).to.equal(2);
    });
  });

  describe("View Functions", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "art",
        contentHash,
        "ipfs://uri",
        "CC-BY"
      );
    });

    it("Should return IP asset details", async function () {
      const asset = await ipToken.getIPAsset(0);
      expect(asset.title).to.equal("My Work");
      expect(asset.creator).to.equal(creator.address);
    });

    it("Should return creator tokens", async function () {
      const tokens = await ipToken.getCreatorTokens(creator.address);
      expect(tokens.length).to.equal(1);
      expect(tokens[0]).to.equal(0);
    });

    it("Should return empty array for creator with no tokens", async function () {
      const tokens = await ipToken.getCreatorTokens(recipient.address);
      expect(tokens.length).to.equal(0);
    });

    it("Should return licenses", async function () {
      await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);

      const licenses = await ipToken.getLicenses(0);
      expect(licenses.length).to.equal(1);
    });

    it("Should return royalty info", async function () {
      const royaltyInfo = await ipToken.getRoyaltyInfo(0);
      expect(royaltyInfo.recipient).to.equal(creator.address);
    });
  });

  describe("License Limit Enforcement", function () {
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Content"));

    beforeEach(async function () {
      await ipToken.connect(minter).mintIP(
        creator.address,
        "My Work",
        "Description",
        "code",
        contentHash,
        "ipfs://uri",
        "MIT"
      );
    });

    it("Should reject license duration below MIN_LICENSE_DURATION (1 day)", async function () {
      await expect(
        ipToken.connect(executor).grantLicense(0, licensee.address, 500, 86399)
      ).to.be.revertedWith("License duration too short");
    });

    it("Should reject license duration above MAX_LICENSE_DURATION (20 years)", async function () {
      const MAX_LICENSE_DURATION = 20 * 365 * 24 * 60 * 60;
      await expect(
        ipToken.connect(executor).grantLicense(0, licensee.address, 500, MAX_LICENSE_DURATION + 1)
      ).to.be.revertedWith("License duration too long");
    });

    it("Should reject granting more than MAX_LICENSES_PER_TOKEN (100)", async function () {
      for (let i = 0; i < 100; i++) {
        await ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR);
      }

      await expect(
        ipToken.connect(executor).grantLicense(0, licensee.address, 500, ONE_YEAR)
      ).to.be.revertedWith("License limit reached");
    });
  });
});

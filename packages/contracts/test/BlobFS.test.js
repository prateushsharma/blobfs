const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BlobFS Contracts", function () {
  let registry, market;
  let owner, creator, buyer, treasury;

  const MANIFEST_HASH = ethers.encodeBytes32String("manifest_blob_txhash1");
  const RECEIPT_HASH  = ethers.encodeBytes32String("receipt_blob_txhash_1");
  const FILE_HASH     = ethers.encodeBytes32String("sha256_file_hash____1");
  const PRICE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, creator, buyer, treasury] = await ethers.getSigners();
    const DatasetRegistry = await ethers.getContractFactory("DatasetRegistry");
    registry = await DatasetRegistry.deploy();
    const LicenseMarket = await ethers.getContractFactory("LicenseMarket");
    market = await LicenseMarket.deploy(await registry.getAddress(), treasury.address);
  });

  describe("DatasetRegistry", function () {
    it("publishes dataset and returns id=1", async function () {
      await expect(
        registry.connect(creator).publishDataset(
          MANIFEST_HASH, PRICE, 1, "ImageNet 10k", "Desc",
          "application/zip", 524288000n, 5n, FILE_HASH
        )
      ).to.emit(registry, "DatasetPublished")
        .withArgs(1, creator.address, MANIFEST_HASH, PRICE, 1, "ImageNet 10k");
      expect(await registry.totalDatasets()).to.equal(1);
    });

    it("stores correct dataset data", async function () {
      await registry.connect(creator).publishDataset(
        MANIFEST_HASH, PRICE, 0, "My Dataset", "Desc", "text/csv", 1000n, 1n, FILE_HASH
      );
      const ds = await registry.getDataset(1);
      expect(ds.creator).to.equal(creator.address);
      expect(ds.active).to.equal(true);
    });

    it("rejects duplicate manifest hashes", async function () {
      await registry.connect(creator).publishDataset(
        MANIFEST_HASH, PRICE, 0, "D1", "", "text/csv", 1000n, 1n, FILE_HASH
      );
      await expect(
        registry.connect(creator).publishDataset(
          MANIFEST_HASH, PRICE, 0, "D2", "", "text/csv", 1000n, 1n, FILE_HASH
        )
      ).to.be.revertedWithCustomError(registry, "ManifestAlreadyRegistered");
    });

    it("allows creator to update price", async function () {
      await registry.connect(creator).publishDataset(
        MANIFEST_HASH, PRICE, 0, "D", "", "text/csv", 1000n, 1n, FILE_HASH
      );
      const newPrice = ethers.parseEther("0.05");
      await expect(registry.connect(creator).updatePrice(1, newPrice))
        .to.emit(registry, "DatasetPriceUpdated").withArgs(1, PRICE, newPrice);
    });

    it("returns creator dataset list", async function () {
      const hash2 = ethers.encodeBytes32String("manifest2_unique_hash");
      await registry.connect(creator).publishDataset(
        MANIFEST_HASH, PRICE, 0, "D1", "", "text/csv", 1000n, 1n, FILE_HASH
      );
      await registry.connect(creator).publishDataset(
        hash2, PRICE, 0, "D2", "", "text/csv", 1000n, 1n, FILE_HASH
      );
      const ids = await registry.getCreatorDatasets(creator.address);
      expect(ids.length).to.equal(2);
    });
  });

  describe("LicenseMarket", function () {
    beforeEach(async function () {
      await registry.connect(creator).publishDataset(
        MANIFEST_HASH, PRICE, 1, "ImageNet 10k", "Desc",
        "application/zip", 524288000n, 5n, FILE_HASH
      );
    });

    it("splits fees 97.5% creator / 2.5% protocol", async function () {
      const creatorBefore  = await ethers.provider.getBalance(creator.address);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: PRICE });
      const protocolFee  = (PRICE * 250n) / 10000n;
      const creatorShare = PRICE - protocolFee;
      expect((await ethers.provider.getBalance(creator.address))  - creatorBefore).to.equal(creatorShare);
      expect((await ethers.provider.getBalance(treasury.address)) - treasuryBefore).to.equal(protocolFee);
    });

    it("emits LicensePurchased event", async function () {
      const protocolFee  = (PRICE * 250n) / 10000n;
      const creatorShare = PRICE - protocolFee;
      await expect(
        market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: PRICE })
      ).to.emit(market, "LicensePurchased")
        .withArgs(1, buyer.address, creator.address, RECEIPT_HASH, PRICE, creatorShare, protocolFee);
    });

    it("verifies license after purchase", async function () {
      expect(await market.verifyLicense(1, buyer.address)).to.equal(false);
      await market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: PRICE });
      expect(await market.verifyLicense(1, buyer.address)).to.equal(true);
    });

    it("stores receipt tx hash", async function () {
      await market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: PRICE });
      expect(await market.getLicenseReceipt(1, buyer.address)).to.equal(RECEIPT_HASH);
    });

    it("rejects double purchase", async function () {
      await market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: PRICE });
      await expect(
        market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: PRICE })
      ).to.be.revertedWithCustomError(market, "AlreadyLicensed");
    });

    it("rejects insufficient payment", async function () {
      await expect(
        market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: ethers.parseEther("0.001") })
      ).to.be.revertedWithCustomError(market, "InsufficientPayment");
    });

    it("calculateFeeSplit returns correct values", async function () {
      const [creatorShare, protocolFee] = await market.calculateFeeSplit(ethers.parseEther("1"));
      expect(protocolFee).to.equal(ethers.parseEther("0.025"));
      expect(creatorShare).to.equal(ethers.parseEther("0.975"));
    });

    it("tracks dataset sales stats", async function () {
      await market.connect(buyer).purchaseDataset(1, RECEIPT_HASH, { value: PRICE });
      const [licenses, earnings] = await market.getDatasetStats(1);
      expect(licenses).to.equal(1n);
      expect(earnings).to.equal(PRICE - (PRICE * 250n) / 10000n);
    });
  });
});
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying BlobFS contracts...");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // 1. Deploy DatasetRegistry
  console.log("1. Deploying DatasetRegistry...");
  const DatasetRegistry = await ethers.getContractFactory("DatasetRegistry");
  const registry = await DatasetRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("   DatasetRegistry:", registryAddress);

  // 2. Deploy LicenseMarket
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("\n2. Deploying LicenseMarket...");
  const LicenseMarket = await ethers.getContractFactory("LicenseMarket");
  const market = await LicenseMarket.deploy(registryAddress, treasuryAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("   LicenseMarket:", marketAddress);

  console.log("\n─────────────────────────────────────");
  console.log("DATASET_REGISTRY_ADDRESS=" + registryAddress);
  console.log("LICENSE_MARKET_ADDRESS=" + marketAddress);
  console.log("TREASURY_ADDRESS=" + treasuryAddress);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
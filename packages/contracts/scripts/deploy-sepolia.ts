import { ethers, run, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n=== BlobFS Contract Deployment — Sepolia ===\n');

  // Validate env
  const treasury = process.env.TREASURY_ADDRESS;
  if (!treasury || !ethers.isAddress(treasury)) {
    throw new Error('TREASURY_ADDRESS missing or invalid in .env');
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log(`Deployer:  ${deployerAddress}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`Treasury:  ${treasury}`);
  console.log(`Network:   ${network.name}\n`);

  if (balance < ethers.parseEther('0.05')) {
    throw new Error('Deployer balance too low — need at least 0.05 Sepolia ETH');
  }

  // ── Deploy DatasetRegistry ──────────────────────────────────

  console.log('Deploying DatasetRegistry...');
  const RegistryFactory = await ethers.getContractFactory('DatasetRegistry');
  const registry = await RegistryFactory.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`✓ DatasetRegistry: ${registryAddress}`);

  // ── Deploy LicenseMarket ────────────────────────────────────

  console.log('Deploying LicenseMarket...');
  const MarketFactory = await ethers.getContractFactory('LicenseMarket');
  const market = await MarketFactory.deploy(
    registryAddress,
    treasury
  );
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`✓ LicenseMarket:   ${marketAddress}`);

  // ── Wait for block confirmations before verifying ───────────

  console.log('\nWaiting for 5 block confirmations...');
  await registry.deploymentTransaction()?.wait(5);
  await market.deploymentTransaction()?.wait(5);
  console.log('✓ Confirmations received');

  // ── Verify on Etherscan ─────────────────────────────────────

  if (process.env.ETHERSCAN_API_KEY) {
    console.log('\nVerifying contracts on Etherscan...');
    try {
      await run('verify:verify', {
        address: registryAddress,
        constructorArguments: [],
      });
      console.log('✓ DatasetRegistry verified');
    } catch (e: any) {
      console.log(`  DatasetRegistry verify skipped: ${e.message}`);
    }

    try {
      await run('verify:verify', {
        address: marketAddress,
        constructorArguments: [registryAddress, treasury, 250],
      });
      console.log('✓ LicenseMarket verified');
    } catch (e: any) {
      console.log(`  LicenseMarket verify skipped: ${e.message}`);
    }
  } else {
    console.log('\nNo ETHERSCAN_API_KEY — skipping verification');
  }

  // ── Write deployment output ─────────────────────────────────

  const deployment = {
    network: 'sepolia',
    chainId: 11155111,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    treasury,
    contracts: {
      DatasetRegistry: {
        address: registryAddress,
        etherscan: `https://sepolia.etherscan.io/address/${registryAddress}`,
      },
      LicenseMarket: {
        address: marketAddress,
        etherscan: `https://sepolia.etherscan.io/address/${marketAddress}`,
      },
    },
  };

  // Save to deployments/
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outPath = path.join(deploymentsDir, 'sepolia.json');
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`\n✓ Deployment saved to: ${outPath}`);

  // ── Print .env snippet ──────────────────────────────────────

  console.log('\n=== Copy these into your .env files ===\n');
  console.log('# packages/backend/.env');
  console.log(`DATASET_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`LICENSE_MARKET_ADDRESS=${marketAddress}`);
  console.log('');
  console.log('# frontend/.env');
  console.log(`VITE_DATASET_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VITE_LICENSE_MARKET_ADDRESS=${marketAddress}`);
  console.log('\n========================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n✗ Deployment failed:', e.message);
    process.exit(1);
  });
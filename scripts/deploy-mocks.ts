import { ethers } from "hardhat";
import { parseEther } from "ethers";
import { MockToken, MockAavePool, MockDex } from "../typechain-types";

async function main() {
  console.log("Desplegando contratos mock...");

  // Obtener signer
  const [deployer] = await ethers.getSigners();
  console.log("Desplegando con la cuenta:", deployer.address);

  // 1. Desplegar tokens mock
  console.log("\nDesplegando tokens...");
  
  const MockTokenFactory = await ethers.getContractFactory("MockToken");
  
  const weth = (await MockTokenFactory.deploy("Wrapped Ether", "WETH", 18)) as MockToken;
  await weth.waitForDeployment();
  console.log("WETH desplegado en:", await weth.getAddress());
  
  const usdc = (await MockTokenFactory.deploy("USD Coin", "USDC", 6)) as MockToken;
  await usdc.waitForDeployment();
  console.log("USDC desplegado en:", await usdc.getAddress());
  
  const usdt = (await MockTokenFactory.deploy("Tether", "USDT", 6)) as MockToken;
  await usdt.waitForDeployment();
  console.log("USDT desplegado en:", await usdt.getAddress());

  // 2. Desplegar Aave mock
  console.log("\nDesplegando Aave Pool...");
  const MockAavePoolFactory = await ethers.getContractFactory("MockAavePool");
  const aavePool = (await MockAavePoolFactory.deploy()) as MockAavePool;
  await aavePool.waitForDeployment();
  console.log("Aave Pool desplegado en:", await aavePool.getAddress());

  // 3. Desplegar DEXs mock
  console.log("\nDesplegando DEXs...");
  const MockDexFactory = await ethers.getContractFactory("MockDex");
  
  const dexA = (await MockDexFactory.deploy()) as MockDex;
  await dexA.waitForDeployment();
  console.log("DEX A desplegado en:", await dexA.getAddress());
  
  const dexB = (await MockDexFactory.deploy()) as MockDex;
  await dexB.waitForDeployment();
  console.log("DEX B desplegado en:", await dexB.getAddress());

  // 4. Configurar precios iniciales
  console.log("\nConfigurando precios iniciales...");
  
  // WETH/USDC en DEX A
  await dexA.setPrice(
    await weth.getAddress(),
    await usdc.getAddress(),
    parseEther("1800") // 1 ETH = 1800 USDC
  );
  await dexA.setPrice(
    await usdc.getAddress(),
    await weth.getAddress(),
    parseEther("0.00055555555") // 1 USDC = 0.00055555555 ETH (1/1800)
  );
  
  // WETH/USDC en DEX B (0.3% más alto)
  await dexB.setPrice(
    await weth.getAddress(),
    await usdc.getAddress(),
    parseEther("1805.4") // 1 ETH = 1805.4 USDC
  );
  await dexB.setPrice(
    await usdc.getAddress(),
    await weth.getAddress(),
    parseEther("0.00055389387") // 1 USDC = 0.00055389387 ETH (1/1805.4)
  );
  
  // WETH/USDT en DEX A
  await dexA.setPrice(
    await weth.getAddress(),
    await usdt.getAddress(),
    parseEther("1801") // 1 ETH = 1801 USDT
  );
  await dexA.setPrice(
    await usdt.getAddress(),
    await weth.getAddress(),
    parseEther("0.00055524708") // 1 USDT = 0.00055524708 ETH (1/1801)
  );
  
  // WETH/USDT en DEX B (0.2% más bajo)
  await dexB.setPrice(
    await weth.getAddress(),
    await usdt.getAddress(),
    parseEther("1797.4") // 1 ETH = 1797.4 USDT
  );
  await dexB.setPrice(
    await usdt.getAddress(),
    await weth.getAddress(),
    parseEther("0.00055635918") // 1 USDT = 0.00055635918 ETH (1/1797.4)
  );

  // 5. Acuñar tokens iniciales
  console.log("\nAcuñando tokens iniciales...");
  
  // Para Aave Pool
  await weth.mint(await aavePool.getAddress(), parseEther("1000")); // 1000 WETH
  await usdc.mint(await aavePool.getAddress(), 1000000n * 1000000n); // 1M USDC
  await usdt.mint(await aavePool.getAddress(), 1000000n * 1000000n); // 1M USDT
  
  // Para DEX A
  await weth.mint(await dexA.getAddress(), parseEther("100")); // 100 WETH
  await usdc.mint(await dexA.getAddress(), 200000n * 1000000n); // 200k USDC
  await usdt.mint(await dexA.getAddress(), 200000n * 1000000n); // 200k USDT
  
  // Para DEX B
  await weth.mint(await dexB.getAddress(), parseEther("100")); // 100 WETH
  await usdc.mint(await dexB.getAddress(), 200000n * 1000000n); // 200k USDC
  await usdt.mint(await dexB.getAddress(), 200000n * 1000000n); // 200k USDT

  console.log("\nDespliegue completado!");
  console.log("------------------------");
  console.log("WETH:", await weth.getAddress());
  console.log("USDC:", await usdc.getAddress());
  console.log("USDT:", await usdt.getAddress());
  console.log("Aave Pool:", await aavePool.getAddress());
  console.log("DEX A:", await dexA.getAddress());
  console.log("DEX B:", await dexB.getAddress());
  console.log("------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 
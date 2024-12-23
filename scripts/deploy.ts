import { ethers, run } from "hardhat";

async function main() {
  console.log("Iniciando despliegue del contrato FlashLoanArbitrage...");

  // Direcciones de Aave V3 Pool Address Provider
  const AAVE_POOL_PROVIDER = {
    arbitrum: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
    base: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D"
  };

  // Direcciones de Uniswap V3 SwapRouter
  const UNISWAP_ROUTER = {
    arbitrum: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    base: "0xE592427A0AEce92De3Edee1F18E0157C05861564"
  };

  // Obtener la red actual
  const network = await ethers.provider.getNetwork();
  const networkName = network.name;

  console.log(`Desplegando en la red: ${networkName}`);

  // Seleccionar las direcciones correctas según la red
  const poolProvider = networkName === "arbitrum" ? AAVE_POOL_PROVIDER.arbitrum : AAVE_POOL_PROVIDER.base;
  const swapRouter = networkName === "arbitrum" ? UNISWAP_ROUTER.arbitrum : UNISWAP_ROUTER.base;

  // Desplegar el contrato
  const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
  console.log("Desplegando contrato...");
  
  const flashLoanArbitrage = await FlashLoanArbitrage.deploy(
    poolProvider,
    swapRouter,
    {
      gasLimit: 3000000 // Añadimos un límite de gas explícito
    }
  );

  console.log("Esperando confirmación del despliegue...");
  await flashLoanArbitrage.waitForDeployment();

  const contractAddress = await flashLoanArbitrage.getAddress();
  console.log(`Contrato FlashLoanArbitrage desplegado en: ${contractAddress}`);

  // Esperar unos segundos para asegurarnos que el contrato está bien desplegado
  console.log("Esperando 30 segundos para asegurar la propagación en la red...");
  await new Promise(resolve => setTimeout(resolve, 30000));

  console.log("Despliegue completado!");
  console.log("----------------------------------------");
  console.log("Resumen del Despliegue:");
  console.log(`Red: ${networkName}`);
  console.log(`Dirección del Contrato: ${contractAddress}`);
  console.log(`Pool Provider: ${poolProvider}`);
  console.log(`Swap Router: ${swapRouter}`);
  console.log("----------------------------------------");

  // Verificar el contrato en el explorador
  if (process.env.VERIFY_CONTRACT === "true") {
    console.log("Verificando contrato en el explorador...");
    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [poolProvider, swapRouter],
      });
      console.log("Contrato verificado exitosamente!");
    } catch (error) {
      console.log("Error en la verificación:", error);
    }
  }

  // Guardar la dirección del contrato en un archivo para futuro uso
  const fs = require('fs');
  const deployInfo = {
    network: networkName,
    contractAddress,
    poolProvider,
    swapRouter,
    deploymentDate: new Date().toISOString()
  };

  fs.writeFileSync(
    `deployment-${networkName}.json`,
    JSON.stringify(deployInfo, null, 2)
  );
  console.log(`Información del despliegue guardada en deployment-${networkName}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error en el despliegue:", error);
    process.exit(1);
  }); 
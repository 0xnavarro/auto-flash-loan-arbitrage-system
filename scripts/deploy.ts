import { ethers, run } from "hardhat";
import { config } from "dotenv";

config();

interface NetworkAddresses {
  aavePool: string;
  dexA: string;
  dexB: string;
  stargateRouter: string;
}

// Direcciones de contratos en diferentes redes
const ADDRESSES: { [key: string]: NetworkAddresses } = {
  arbitrum: {
    aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    dexA: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap
    dexB: "0xc873fEcbd354f5A56E00E710B90EF4201db2448d",  // Camelot
    stargateRouter: "0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614"
  },
  base: {
    aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    dexA: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86", // BaseSwap
    dexB: "0x8c1A3cF8f83074169fe5D7aD50B978e1cD6b37c7", // SwapBased
    stargateRouter: "0x45f1A95A4D3f3836523F5c83673c797f4d4d263B"
  },
  bsc: {
    aavePool: "0x116F3E0F45E37dF7c3d75312B1DE505F8b53cc9C",
    dexA: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap
    dexB: "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8",  // BiSwap
    stargateRouter: "0x4a364f8c717cAAD9A442737Eb7b8A55cc6cf18D8"
  }
};

async function main() {
  // Obtener signer
  const [deployer] = await ethers.getSigners();
  console.log("Desplegando contratos con la cuenta:", deployer.address);

  // Obtener balance inicial
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Balance de la cuenta:", ethers.formatEther(balance), "ETH");

  // Obtener network
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("Network:", network.name, "ChainId:", chainId);

  // Seleccionar direcciones según la red
  let addresses: NetworkAddresses;
  if (chainId === 42161) {
    addresses = ADDRESSES.arbitrum;
  } else if (chainId === 8453) {
    addresses = ADDRESSES.base;
  } else if (chainId === 56) {
    addresses = ADDRESSES.bsc;
  } else {
    throw new Error("Red no soportada");
  }

  // Desplegar IntraChainArbitrage
  console.log("\nDesplegando IntraChainArbitrage...");
  const IntraChainArbitrage = await ethers.getContractFactory("IntraChainArbitrage");
  const intraChainArbitrage = await IntraChainArbitrage.deploy(
    addresses.aavePool,
    addresses.dexA,
    addresses.dexB
  );
  await intraChainArbitrage.waitForDeployment();
  console.log("IntraChainArbitrage desplegado en:", await intraChainArbitrage.getAddress());

  // Desplegar CrossChainArbitrage
  console.log("\nDesplegando CrossChainArbitrage...");
  const CrossChainArbitrage = await ethers.getContractFactory("CrossChainArbitrage");
  const crossChainArbitrage = await CrossChainArbitrage.deploy(
    addresses.aavePool,
    addresses.dexA,
    addresses.stargateRouter
  );
  await crossChainArbitrage.waitForDeployment();
  console.log("CrossChainArbitrage desplegado en:", await crossChainArbitrage.getAddress());

  // Verificar contratos en el explorador
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\nVerificando contratos...");
    try {
      await verifyContract(await intraChainArbitrage.getAddress(), [
        addresses.aavePool,
        addresses.dexA,
        addresses.dexB
      ]);
      console.log("IntraChainArbitrage verificado");

      await verifyContract(await crossChainArbitrage.getAddress(), [
        addresses.aavePool,
        addresses.dexA,
        addresses.stargateRouter
      ]);
      console.log("CrossChainArbitrage verificado");
    } catch (error) {
      console.error("Error al verificar contratos:", error);
    }
  }

  // Imprimir resumen
  console.log("\nResumen del despliegue:");
  console.log("------------------------");
  console.log("Network:", network.name);
  console.log("IntraChainArbitrage:", await intraChainArbitrage.getAddress());
  console.log("CrossChainArbitrage:", await crossChainArbitrage.getAddress());
  console.log("------------------------");
}

async function verifyContract(address: string, constructorArguments: any[]) {
  await run("verify:verify", {
    address,
    constructorArguments,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 
import { ethers } from "hardhat";
import { config } from "dotenv";
import { IntraChainArbitrage, CrossChainArbitrage } from "../typechain-types";
import { formatEther, parseEther } from "ethers";

config();

// Tokens a monitorear
const TOKENS = {
  arbitrum: {
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548"
  },
  base: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"
  },
  bsc: {
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"
  }
};

// Configuración
const MIN_PROFIT_THRESHOLD = parseEther("0.01"); // 0.01 ETH
const CHECK_INTERVAL = 3000; // 3 segundos
const GAS_PRICE_LIMIT = parseEther("0.00001"); // 10 Gwei

async function main() {
  // Obtener signer
  const [deployer] = await ethers.getSigners();
  console.log("Monitoreando con la cuenta:", deployer.address);

  // Obtener network
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("Network:", network.name, "ChainId:", chainId);

  // Seleccionar tokens según la red
  let tokens: { [key: string]: string };
  if (chainId === 42161) {
    tokens = TOKENS.arbitrum;
  } else if (chainId === 8453) {
    tokens = TOKENS.base;
  } else if (chainId === 56) {
    tokens = TOKENS.bsc;
  } else {
    throw new Error("Red no soportada");
  }

  // Obtener contratos
  const intraChainArbitrage = await getIntraChainArbitrage();
  const crossChainArbitrage = await getCrossChainArbitrage();

  console.log("\nIniciando monitoreo...");
  console.log("------------------------");
  console.log("Threshold de beneficio:", formatEther(MIN_PROFIT_THRESHOLD), "ETH");
  console.log("Intervalo de chequeo:", CHECK_INTERVAL / 1000, "segundos");
  console.log("Límite de gas price:", formatEther(GAS_PRICE_LIMIT), "ETH");
  console.log("------------------------\n");

  // Monitoreo continuo
  while (true) {
    try {
      // Verificar gas price
      const gasPrice = await ethers.provider.getFeeData();
      if (gasPrice.gasPrice && gasPrice.gasPrice > GAS_PRICE_LIMIT) {
        console.log("Gas price muy alto:", formatEther(gasPrice.gasPrice), "ETH");
        continue;
      }

      // Verificar oportunidades intra-chain
      await checkIntraChainOpportunities(intraChainArbitrage, tokens);

      // Verificar oportunidades cross-chain
      if (chainId !== 56) { // No BSC para cross-chain
        await checkCrossChainOpportunities(crossChainArbitrage, tokens);
      }

      // Esperar intervalo
      await sleep(CHECK_INTERVAL);
    } catch (error) {
      console.error("Error en el monitoreo:", error);
      await sleep(CHECK_INTERVAL);
    }
  }
}

async function checkIntraChainOpportunities(
  contract: IntraChainArbitrage,
  tokens: { [key: string]: string }
) {
  for (const [tokenASymbol, tokenAAddress] of Object.entries(tokens)) {
    for (const [tokenBSymbol, tokenBAddress] of Object.entries(tokens)) {
      if (tokenAAddress === tokenBAddress) continue;

      try {
        // Calcular beneficio potencial
        const [profit, dexAToB] = await contract.calculateArbitrage(
          tokenAAddress,
          tokenBAddress,
          parseEther("1") // 1 token como prueba
        );

        if (profit > MIN_PROFIT_THRESHOLD) {
          console.log(`\nOportunidad Intra-Chain encontrada!`);
          console.log(`${tokenASymbol} -> ${tokenBSymbol}`);
          console.log(`Beneficio estimado: ${formatEther(profit)} ETH`);
          console.log(`Dirección: ${dexAToB ? "DEX A -> DEX B" : "DEX B -> DEX A"}`);

          // Ejecutar arbitraje
          const tx = await contract.executeArbitrage(
            tokenAAddress,
            parseEther("1"),
            tokenBAddress,
            dexAToB,
            0 // minAmountOut, calcular mejor valor
          );
          console.log("Transacción enviada:", tx.hash);
          
          // Esperar confirmación
          const receipt = await tx.wait();
          console.log("Transacción confirmada!");
        }
      } catch (error) {
        console.error(`Error al verificar par ${tokenASymbol}/${tokenBSymbol}:`, error);
      }
    }
  }
}

async function checkCrossChainOpportunities(
  contract: CrossChainArbitrage,
  tokens: { [key: string]: string }
) {
  // Implementar verificación cross-chain
  // Requiere obtener precios de otras cadenas
  console.log("Verificación cross-chain no implementada");
}

async function getIntraChainArbitrage(): Promise<IntraChainArbitrage> {
  const address = process.env.INTRA_CHAIN_ADDRESS;
  if (!address) throw new Error("Dirección de IntraChainArbitrage no configurada");

  const IntraChainArbitrage = await ethers.getContractFactory("IntraChainArbitrage");
  return IntraChainArbitrage.attach(address) as unknown as IntraChainArbitrage;
}

async function getCrossChainArbitrage(): Promise<CrossChainArbitrage> {
  const address = process.env.CROSS_CHAIN_ADDRESS;
  if (!address) throw new Error("Dirección de CrossChainArbitrage no configurada");

  const CrossChainArbitrage = await ethers.getContractFactory("CrossChainArbitrage");
  return CrossChainArbitrage.attach(address) as unknown as CrossChainArbitrage;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 
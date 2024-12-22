import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { formatEther, parseEther, formatUnits } from "@ethersproject/units";

interface TokenConfig {
  WETH?: string;
  WBNB?: string;
  USDC?: string;
  USDT?: string;
  BUSD?: string;
}

interface NetworkConfig {
  name: string;
  rpc: string;
  dexs: {
    [key: string]: string;
  };
  tokens: TokenConfig;
}

// Configuración de DEXs y tokens por cadena
const config: Record<string, NetworkConfig> = {
  arbitrum: {
    name: "Arbitrum",
    rpc: "https://arb1.arbitrum.io/rpc",
    dexs: {
      uniswapV3: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Router
      sushiswap: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
    },
    tokens: {
      WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
    }
  },
  base: {
    name: "Base",
    rpc: "https://mainnet.base.org",
    dexs: {
      baseswap: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
      uniswapV3: "0x2626664c2603336E57B271c5C0b26F421741e481"
    },
    tokens: {
      WETH: "0x4200000000000000000000000000000000000006",
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    }
  },
  bsc: {
    name: "BSC",
    rpc: "https://bsc-dataseed.binance.org",
    dexs: {
      pancakeswap: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
      biswap: "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8"
    },
    tokens: {
      WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
      USDT: "0x55d398326f99059fF775485246999027B3197955"
    }
  }
};

// Función para obtener el precio de un token en un DEX
async function getPriceFromDex(
  dexAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<string> {
  try {
    // Primero intentamos con la interfaz de Uniswap V3
    try {
      const quoter = await ethers.getContractAt("IQuoter", dexAddress);
      const amountOut = await quoter.quoteExactInputSingle(
        tokenIn,
        tokenOut,
        3000,
        amountIn,
        0
      );
      return amountOut.toString();
    } catch {
      // Si falla, intentamos con la interfaz de Uniswap V2
      const router = await ethers.getContractAt("IUniswapV2Router02", dexAddress);
      const path = [tokenIn, tokenOut];
      const amounts = await router.getAmountsOut(amountIn, path);
      return amounts[1].toString();
    }
  } catch (error) {
    console.error(`Error getting price from ${dexAddress}:`, error);
    return "0";
  }
}

// Función para calcular el beneficio potencial
function calculateProfit(
  buyPrice: string,
  sellPrice: string,
  amount: string
): {profitUSD: number; profitPercentage: number} {
  try {
    const buyPriceBN = BigNumber.from(buyPrice || "0");
    const sellPriceBN = BigNumber.from(sellPrice || "0");
    const amountBN = BigNumber.from(amount || "0");
    
    if (buyPriceBN.eq(0) || sellPriceBN.eq(0)) return { profitUSD: 0, profitPercentage: 0 };
    
    const cost = amountBN.mul(buyPriceBN).div(parseEther("1"));
    const revenue = amountBN.mul(sellPriceBN).div(parseEther("1"));
    const profit = revenue.sub(cost);
    
    const profitUSD = parseFloat(formatUnits(profit, 6)); // Asumiendo USDC/USDT con 6 decimales
    const profitPercentage = (profitUSD / parseFloat(formatUnits(cost, 6))) * 100;
    
    return { profitUSD, profitPercentage };
  } catch (error) {
    console.error("Error calculating profit:", error);
    return { profitUSD: 0, profitPercentage: 0 };
  }
}

// Función para obtener el token estable de una red
function getStablecoin(tokens: TokenConfig): string {
  return tokens.USDC || tokens.USDT || tokens.BUSD || "";
}

// Función para obtener el token base de una red
function getBaseToken(tokens: TokenConfig): string {
  return tokens.WETH || tokens.WBNB || "";
}

// Función principal de monitoreo
async function monitorPrices() {
  const networks = Object.keys(config);
  const amountIn = parseEther("1").toString(); // 1 token

  for (const network of networks) {
    const networkConfig = config[network];
    console.log(`\n📊 Monitoring ${networkConfig.name}`);
    
    const { dexs, tokens } = networkConfig;
    const stablecoin = getStablecoin(tokens);
    const baseToken = getBaseToken(tokens);

    if (!stablecoin || !baseToken) {
      console.log(`Skipping ${networkConfig.name} - Missing required tokens`);
      continue;
    }

    // Comparar precios entre DEXs
    const dexEntries = Object.entries(dexs);
    for (let i = 0; i < dexEntries.length; i++) {
      for (let j = i + 1; j < dexEntries.length; j++) {
        const [dex1Name, dex1Address] = dexEntries[i];
        const [dex2Name, dex2Address] = dexEntries[j];

        console.log(`\nChecking ${dex1Name} vs ${dex2Name}...`);

        const price1 = await getPriceFromDex(dex1Address, baseToken, stablecoin, amountIn);
        const price2 = await getPriceFromDex(dex2Address, baseToken, stablecoin, amountIn);

        if (price1 === "0" || price2 === "0") {
          console.log("Could not get prices from one or both DEXs");
          continue;
        }

        const { profitUSD, profitPercentage } = calculateProfit(price1, price2, amountIn);

        console.log(`
          ${baseToken.slice(-4)} Prices:
          ${dex1Name}: $${formatUnits(price1, 6)}
          ${dex2Name}: $${formatUnits(price2, 6)}
          Difference: $${Math.abs(profitUSD).toFixed(2)} (${Math.abs(profitPercentage).toFixed(2)}%)
        `);

        if (profitPercentage > 0.5) {
          console.log(`
            💰 Arbitrage Opportunity Found!
            Chain: ${networkConfig.name}
            Buy from: ${dex1Name}
            Sell to: ${dex2Name}
            Profit: $${profitUSD.toFixed(2)} (${profitPercentage.toFixed(2)}%)
            Required amount: 1 ${baseToken.slice(-4)}
          `);

          // Aquí podríamos llamar al contrato de arbitraje
          // await executeArbitrage(network, dex1Address, dex2Address, baseToken, stablecoin, amountIn);
        }
      }
    }
  }
}

// Función principal
async function main() {
  while (true) {
    const now = new Date();
    console.log(`\n⏰ ${now.toLocaleTimeString()} - Nueva iteración de monitoreo`);
    
    await monitorPrices();
    
    // Esperar 5 segundos antes de la siguiente iteración
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 
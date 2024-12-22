import { ethers } from "hardhat";
import { Contract } from "ethers";
import { DEX_CONFIGS, SUPPORTED_CHAINS, MAJOR_TOKENS } from "../config/dex.config";
import * as dotenv from "dotenv";

dotenv.config();

// ABIs necesarios
const ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)",
    "function factory() external pure returns (address)"
];

const FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const PAIR_ABI = [
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];

interface PriceData {
    dex: string;
    chain: string;
    price: number;
    liquidityUSD: number;
}

async function checkPriceAndLiquidity(
    router: Contract,
    factory: Contract,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    dexName: string,
    chainName: string
): Promise<PriceData | null> {
    try {
        // Verificar si existe el par
        const pairAddress = await factory.getPair(tokenIn, tokenOut);
        if (pairAddress === "0x0000000000000000000000000000000000000000") {
            return null;
        }

        // Obtener precio
        const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        const price = Number(amounts[1]) / Number(amountIn);

        // Obtener liquidez
        const pair = new ethers.Contract(pairAddress, PAIR_ABI, router.provider);
        const reserves = await pair.getReserves();
        const liquidityUSD = (Number(reserves[0]) * price + Number(reserves[1])) / 1e6; // Asumiendo USDC decimals

        return {
            dex: dexName,
            chain: chainName,
            price: price,
            liquidityUSD: liquidityUSD
        };
    } catch (error) {
        console.error(`Error checking ${dexName} on ${chainName}:`, error);
        return null;
    }
}

async function findArbitrageOpportunities(prices: PriceData[]) {
    for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
            const priceA = prices[i];
            const priceB = prices[j];

            if (!priceA || !priceB) continue;

            const priceDiff = Math.abs(priceA.price - priceB.price);
            const priceDiffPercent = (priceDiff / Math.min(priceA.price, priceB.price)) * 100;

            // Calcular el beneficio potencial
            const minLiquidity = Math.min(priceA.liquidityUSD, priceB.liquidityUSD);
            const maxTradeSize = minLiquidity * 0.1; // 10% de la liquidez más baja
            const potentialProfit = (maxTradeSize * priceDiffPercent) / 100;

            // Estrategias según el tipo de oportunidad
            if (priceDiffPercent >= 0.5) { // Oportunidad de arbitraje normal
                console.log("\n=== OPORTUNIDAD DE ARBITRAJE ENCONTRADA ===");
                console.log(`${priceA.dex} (${priceA.chain}) vs ${priceB.dex} (${priceB.chain})`);
                console.log(`Diferencia: ${priceDiffPercent.toFixed(2)}%`);
                console.log(`Beneficio potencial: $${potentialProfit.toFixed(2)}`);
                console.log(`Liquidez disponible: $${minLiquidity.toFixed(2)}`);
                console.log(`Tamaño máximo de trade: $${maxTradeSize.toFixed(2)}`);
            }
            
            // Estrategia para tokens de baja liquidez (más riesgosa)
            if (minLiquidity < 100000 && priceDiffPercent >= 2) {
                console.log("\n!!! OPORTUNIDAD DE ARBITRAJE DE ALTO RIESGO !!!");
                console.log(`Token con baja liquidez detectado`);
                console.log(`Diferencia de precio: ${priceDiffPercent.toFixed(2)}%`);
                console.log(`Liquidez: $${minLiquidity.toFixed(2)}`);
                console.log(`PRECAUCIÓN: Alto riesgo de manipulación y slippage`);
            }
        }
    }
}

async function main() {
    // Cantidad base para el arbitraje (ejemplo: 1 ETH)
    const baseAmount = ethers.parseEther("1");

    while (true) {
        console.log("\n=== Buscando oportunidades de arbitraje ===");
        console.log(new Date().toLocaleString());

        for (const chain of SUPPORTED_CHAINS) {
            const provider = new ethers.JsonRpcProvider(
                chain.rpc.replace("${ALCHEMY_KEY}", process.env.ALCHEMY_API_KEY || "")
            );

            const dexes = DEX_CONFIGS[chain.name] || [];
            const tokens = MAJOR_TOKENS[chain.name as keyof typeof MAJOR_TOKENS];

            if (!tokens) continue;

            const prices: PriceData[] = [];

            for (const dex of dexes) {
                const router = new ethers.Contract(dex.router, ROUTER_ABI, provider);
                const factory = new ethers.Contract(dex.factory, FACTORY_ABI, provider);

                // Comprobar pares principales
                for (const [tokenSymbol, tokenAddress] of Object.entries(tokens)) {
                    if (tokenSymbol === "WETH" || tokenSymbol === "WMATIC") continue;

                    const baseToken = tokens.WETH || tokens.WMATIC;
                    const priceData = await checkPriceAndLiquidity(
                        router,
                        factory,
                        baseToken,
                        tokenAddress,
                        baseAmount,
                        dex.name,
                        chain.name
                    );

                    if (priceData) {
                        prices.push(priceData);
                    }
                }
            }

            await findArbitrageOpportunities(prices);
        }

        // Esperar antes de la siguiente iteración
        await new Promise(resolve => setTimeout(resolve, 12000)); // ~12 segundos
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 
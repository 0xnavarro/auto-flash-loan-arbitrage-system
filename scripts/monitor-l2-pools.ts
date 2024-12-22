import { ethers } from "hardhat";
import { Contract, JsonRpcProvider } from "ethers";
import { DEX_CONFIGS, SUPPORTED_CHAINS, MAJOR_TOKENS } from "../config/dex.config";
import * as dotenv from "dotenv";
import colors from "colors";

dotenv.config();

// ABIs necesarios
const ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"
];

const FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const PAIR_ABI = [
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
];

interface PoolInfo {
    dex: string;
    chain: string;
    liquidityUSD: number;
    ethPrice: number;
    reserves: {
        eth: number;
        usdc: number;
    };
}

async function setupProvider(rpcUrl: string): Promise<JsonRpcProvider> {
    const provider = new JsonRpcProvider(
        rpcUrl.replace("${ALCHEMY_KEY}", process.env.ALCHEMY_API_KEY || ""),
        undefined,
        { staticNetwork: true }
    );
    await provider.ready;
    return provider;
}

async function getPoolInfo(
    provider: JsonRpcProvider,
    factory: Contract,
    dexName: string,
    chainName: string,
    weth: string,
    usdc: string
): Promise<PoolInfo | null> {
    try {
        // Obtener dirección del par
        const pairAddress = await factory.getPair(weth, usdc);
        if (pairAddress === "0x0000000000000000000000000000000000000000") {
            return null;
        }

        // Conectar al contrato del par
        const pair = new Contract(pairAddress, PAIR_ABI, provider);
        
        // Obtener tokens del par para saber el orden
        const token0 = await pair.token0();
        const token1 = await pair.token1();
        
        // Obtener reservas
        const reserves = await pair.getReserves();
        
        // Determinar qué reserva es ETH y cuál es USDC
        const isEthToken0 = token0.toLowerCase() === weth.toLowerCase();
        const ethReserve = isEthToken0 ? Number(reserves[0]) : Number(reserves[1]);
        const usdcReserve = isEthToken0 ? Number(reserves[1]) : Number(reserves[0]);
        
        // Calcular precio de ETH
        const ethPrice = (usdcReserve / 1e6) / (ethReserve / 1e18);
        
        // Calcular liquidez total en USD
        const liquidityUSD = (ethReserve / 1e18) * ethPrice;

        return {
            dex: dexName,
            chain: chainName,
            liquidityUSD,
            ethPrice,
            reserves: {
                eth: ethReserve / 1e18,
                usdc: usdcReserve / 1e6
            }
        };
    } catch (error) {
        console.error(`Error getting pool info for ${dexName} on ${chainName}:`, error);
        return null;
    }
}

async function findArbitrageOpportunities(pools: PoolInfo[]) {
    for (let i = 0; i < pools.length; i++) {
        for (let j = i + 1; j < pools.length; j++) {
            const poolA = pools[i];
            const poolB = pools[j];

            if (!poolA || !poolB) continue;

            const priceDiff = Math.abs(poolA.ethPrice - poolB.ethPrice);
            const priceDiffPercent = (priceDiff / Math.min(poolA.ethPrice, poolB.ethPrice)) * 100;

            if (priceDiffPercent >= 0.5) {
                console.log(colors.green("\n=== OPORTUNIDAD DE ARBITRAJE ENCONTRADA ==="));
                console.log(colors.yellow(`${poolA.dex} (${poolA.chain}) vs ${poolB.dex} (${poolB.chain})`));
                console.log(`Precio ETH en ${poolA.dex}: $${poolA.ethPrice.toFixed(2)}`);
                console.log(`Precio ETH en ${poolB.dex}: $${poolB.ethPrice.toFixed(2)}`);
                console.log(colors.green(`Diferencia: ${priceDiffPercent.toFixed(2)}%`));
                console.log(`Liquidez en ${poolA.dex}: $${poolA.liquidityUSD.toLocaleString()}`);
                console.log(`Liquidez en ${poolB.dex}: $${poolB.liquidityUSD.toLocaleString()}`);
                
                // Calcular el tamaño óptimo del trade
                const minLiquidity = Math.min(poolA.liquidityUSD, poolB.liquidityUSD);
                const maxTradeSize = minLiquidity * 0.03; // 3% de la liquidez más baja
                const potentialProfit = (maxTradeSize * priceDiffPercent) / 100;

                console.log(colors.cyan(`\nDetalles del trade:`));
                console.log(`Tamaño máximo recomendado: $${maxTradeSize.toLocaleString()}`);
                console.log(`Beneficio potencial: $${potentialProfit.toLocaleString()}`);
                
                // Mostrar reservas
                console.log(colors.cyan(`\nReservas ${poolA.dex}:`));
                console.log(`ETH: ${poolA.reserves.eth.toFixed(2)}`);
                console.log(`USDC: ${poolA.reserves.usdc.toFixed(2)}`);
                
                console.log(colors.cyan(`\nReservas ${poolB.dex}:`));
                console.log(`ETH: ${poolB.reserves.eth.toFixed(2)}`);
                console.log(`USDC: ${poolB.reserves.usdc.toFixed(2)}`);
            }
        }
    }
}

async function main() {
    console.log(colors.yellow("Iniciando monitoreo de pools ETH/USDC en L2s..."));

    // Configurar proveedores para cada cadena
    const providers: { [chainName: string]: JsonRpcProvider } = {};
    for (const chain of SUPPORTED_CHAINS) {
        providers[chain.name] = await setupProvider(chain.rpc);
    }

    while (true) {
        console.log(colors.cyan("\n=== Nueva ronda de monitoreo ==="));
        console.log(new Date().toLocaleString());

        for (const chain of SUPPORTED_CHAINS) {
            const provider = providers[chain.name];
            const dexes = DEX_CONFIGS[chain.name] || [];
            const tokens = MAJOR_TOKENS[chain.name as keyof typeof MAJOR_TOKENS];

            if (!tokens) continue;

            const pools: PoolInfo[] = [];

            for (const dex of dexes) {
                const factory = new Contract(dex.factory, FACTORY_ABI, provider);

                const poolInfo = await getPoolInfo(
                    provider,
                    factory,
                    dex.name,
                    chain.name,
                    tokens.WETH,
                    tokens.USDC
                );

                if (poolInfo) {
                    pools.push(poolInfo);
                    console.log(colors.gray(`${dex.name} en ${chain.name} - ETH: $${poolInfo.ethPrice.toFixed(2)}`));
                }
            }

            await findArbitrageOpportunities(pools);
        }

        // Esperar antes de la siguiente iteración
        await new Promise(resolve => setTimeout(resolve, 12000)); // ~12 segundos
    }
}

main().catch((error) => {
    console.error(colors.red("Error en el monitoreo:"), error);
    process.exitCode = 1;
}); 
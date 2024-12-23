import { ethers } from "hardhat";
import { Contract, JsonRpcProvider } from "ethers";
import { DEX_CONFIGS, SUPPORTED_CHAINS, MAJOR_TOKENS } from "../config/dex.config";
import * as dotenv from "dotenv";
import colors from "colors";

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
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
]; 

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
        const pairAddress = await factory.getPair(weth, usdc);
        if (pairAddress === ethers.constants.AddressZero) {
            return null;
        }

        const pair = new Contract(pairAddress, PAIR_ABI, provider);
        const token0 = await pair.token0();
        const token1 = await pair.token1();
        const reserves = await pair.getReserves();

        const isEthToken0 = token0.toLowerCase() === weth.toLowerCase();
        const ethReserve = isEthToken0 ? Number(reserves.reserve0) : Number(reserves.reserve1);
        const usdcReserve = isEthToken0 ? Number(reserves.reserve1) : Number(reserves.reserve0);

        const ethPrice = (usdcReserve / 1e6) / (ethReserve / 1e18);
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
        console.error(`Error obteniendo información del pool para ${dexName} en ${chainName}:`, error);
        return null;
    }
}

async function main() {
    console.log(colors.yellow("Iniciando monitoreo de pools ETH/USDC en L2s..."));

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
                try {
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
                } catch (error) {
                    console.error(`Error procesando ${dex.name} en ${chain.name}:`, error);
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
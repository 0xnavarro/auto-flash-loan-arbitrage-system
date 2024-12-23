import { ethers } from "hardhat";
import colors from "colors";
import { FlashLoanArbitrage__factory, IUniswapV3Pool__factory } from "../typechain-types";

interface Pool {
    pair: string;
    address: string;
    dex: string;
    token0: string;
    token1: string;
    fee: number;
    tvl: number;
}

interface ArbitrageOpportunity {
    buyPool: Pool;
    sellPool: Pool;
    priceA: number;
    priceB: number;
    spread: number;
    optimalAmount: number;
    expectedProfit: number;
    gasEstimate: number;
}

async function main() {
    console.log(colors.cyan("🔍 Iniciando monitorización de arbitraje en Arbitrum\n"));

    // Obtener signer
    const [signer] = await ethers.getSigners();
    
    // Conectar al contrato de arbitraje
    const ARBITRAGE_CONTRACT = "0x7fca7C822b78329c92F1d115479027a17a023d14";
    const flashLoanContract = FlashLoanArbitrage__factory.connect(
        ARBITRAGE_CONTRACT,
        signer
    );

    // Pools de Arbitrum (extraídas del archivo pools-info.md)
    const pools: Pool[] = [
        {
            pair: "WETH/USDC",
            address: "0xC6962004f452bE9203591991D15f6b388e09E8D0",
            dex: "Uniswap V3",
            token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
            token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
            fee: 0.0005,
            tvl: 54_000_000
        },
        {
            pair: "WETH/USDC",
            address: "0xf3Eb87C1F6020982173C908E7eB31aA66c1f0296",
            dex: "Sushiswap V3",
            token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
            token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
            fee: 0.0005,
            tvl: 6_700_000
        },
        {
            pair: "WETH/USDC",
            address: "0x7fCDC35463E3770c2fB992716Cd070B63540b947",
            dex: "PancakeSwap V3",
            token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
            token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
            fee: 0.0001,
            tvl: 1_500_000
        }
    ];

    async function getPoolPrice(pool: Pool): Promise<number> {
        const poolContract = IUniswapV3Pool__factory.connect(pool.address, signer);
        const slot0 = await poolContract.slot0();
        const sqrtPriceX96 = slot0.sqrtPriceX96;
        
        // Convertir el precio sqrt a decimal
        const sqrtPrice = Number(sqrtPriceX96);
        const price = (sqrtPrice * sqrtPrice * (10 ** 6)) / (2 ** 192);
        
        // Si token0 es WETH, necesitamos invertir el precio
        const isWETHToken0 = pool.token0.toLowerCase() === "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1".toLowerCase();
        
        return isWETHToken0 ? 1 / price : price;
    }

    async function findArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
        const opportunities: ArbitrageOpportunity[] = [];
        
        for (let i = 0; i < pools.length; i++) {
            for (let j = i + 1; j < pools.length; j++) {
                const poolA = pools[i];
                const poolB = pools[j];
                
                const [priceA, priceB] = await Promise.all([
                    getPoolPrice(poolA),
                    getPoolPrice(poolB)
                ]);
                
                const spread = Math.abs((priceA - priceB) / priceA) * 100;
                
                if (spread > 0.1) { // Spread mínimo de 0.1%
                    // Calcular cantidad óptima (0.5% del TVL más bajo)
                    const minTVL = Math.min(poolA.tvl, poolB.tvl);
                    const optimalAmount = minTVL * 0.005;
                    
                    // Calcular beneficio esperado
                    const expectedProfit = optimalAmount * (spread / 100);
                    const gasEstimate = 0.01; // $0.01 como mencionaste
                    
                    if (expectedProfit > gasEstimate) {
                        opportunities.push({
                            buyPool: priceA < priceB ? poolA : poolB,
                            sellPool: priceA < priceB ? poolB : poolA,
                            priceA,
                            priceB,
                            spread,
                            optimalAmount,
                            expectedProfit,
                            gasEstimate
                        });
                    }
                }
            }
        }
        
        return opportunities;
    }

    function displayOpportunity(opp: ArbitrageOpportunity) {
        console.log(colors.green("\n=== OPORTUNIDAD DE ARBITRAJE DETECTADA ==="));
        console.log(colors.yellow(`${opp.buyPool.dex} → ${opp.sellPool.dex}`));
        console.log("\nPrecios:");
        console.log(`Compra: ${opp.priceA.toFixed(2)} USDC`);
        console.log(`Venta: ${opp.priceB.toFixed(2)} USDC`);
        console.log(colors.cyan(`Spread: ${opp.spread.toFixed(4)}%`));
        
        console.log("\nDetalles:");
        console.log(`Cantidad óptima: ${opp.optimalAmount.toFixed(2)} USD`);
        console.log(`Beneficio esperado: ${opp.expectedProfit.toFixed(2)} USD`);
        console.log(`Coste de gas: ${opp.gasEstimate} USD`);
        console.log(colors.green(`Beneficio neto: ${(opp.expectedProfit - opp.gasEstimate).toFixed(2)} USD`));
        
        console.log("\nPools:");
        console.log(`Compra: ${opp.buyPool.address}`);
        console.log(`Venta: ${opp.sellPool.address}`);
        console.log("==========================================\n");
    }

    // Añadir función para mostrar información de las pools
    function displayPoolInfo(pool: Pool, price: number) {
        console.log(colors.blue(`\n=== ${pool.dex} ===`));
        console.log(`Par: ${pool.pair}`);
        console.log(`Dirección: ${pool.address}`);
        console.log(`Token0: ${pool.token0} (WETH)`);
        console.log(`Token1: ${pool.token1} (USDC)`);
        console.log(`Precio actual: ${price.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`);
        console.log(`TVL: $${pool.tvl.toLocaleString()}`);
        console.log(`Fee: ${(pool.fee * 100).toFixed(3)}%`);
        console.log(`Timestamp: ${new Date().toLocaleString()}`);
        console.log("-------------------");
    }

    async function monitorPools() {
        console.log(colors.yellow("\n📊 Estado actual de las pools:"));
        
        for (const pool of pools) {
            try {
                const price = await getPoolPrice(pool);
                displayPoolInfo(pool, price);
            } catch (error) {
                console.error(colors.red(`Error obteniendo datos de ${pool.dex}:`), error);
            }
        }
    }

    // Monitorización continua
    while (true) {
        try {
            console.log(colors.gray(`\n[${new Date().toISOString()}] Actualizando información...\n`));
            
            // Mostrar información de todas las pools
            await monitorPools();
            
            console.log(colors.gray("\nBuscando oportunidades de arbitraje..."));
            const opportunities = await findArbitrageOpportunities();
            
            if (opportunities.length > 0) {
                console.log(colors.green(`\n🎯 Se encontraron ${opportunities.length} oportunidades!`));
                opportunities.forEach(displayOpportunity);
            } else {
                console.log(colors.gray("\nNo se encontraron oportunidades rentables en este momento."));
            }
            
            console.log(colors.gray("\nEsperando 10 segundos para la siguiente actualización..."));
            await new Promise(resolve => setTimeout(resolve, 10000));
            
        } catch (error) {
            console.error(colors.red("\n❌ Error en la monitorización:"), error);
            console.log(colors.yellow("Reintentando en 30 segundos..."));
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }
}

main().catch((error) => {
    console.error(colors.red("Error fatal:"), error);
    process.exit(1);
}); 
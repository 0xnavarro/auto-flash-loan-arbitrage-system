import { ethers } from "hardhat";
import { ARBITRUM_CONFIG, type NetworkConfig } from "../config/arbitrage.config";
import { FlashLoanArbitrage__factory, IUniswapV3Pool__factory } from "../typechain-types";

interface PoolInfo {
    address: string;
    dex: string;
    price: number;          // Precio en términos del token1 (ej: USDC por WETH)
    liquidityUSD: number;   // Liquidez en USD
    fee: number;           // Fee en porcentaje (ej: 0.05)
    token0: string;
    token1: string;
}

interface ArbitrageOpportunity {
    poolBuy: PoolInfo;
    poolSell: PoolInfo;
    priceDifference: number;
    percentageDiff: number;
    optimalAmount: number;
    estimatedProfit: number;
    estimatedGasCost: number;
    netProfit: number;
}

async function monitorPools(network: NetworkConfig) {
    console.log(`Iniciando monitorización en ${network.name}...`);
    
    const [signer] = await ethers.getSigners();
    console.log(`Usando cuenta: ${signer.address}`);
    
    const flashLoanContract = FlashLoanArbitrage__factory.connect(
        network.flashLoanContract,
        signer
    );

    function getTokenSymbol(address: string): string {
        for (const [symbol, token] of Object.entries(network.tokens)) {
            if (token.address.toLowerCase() === address.toLowerCase()) {
                return symbol;
            }
        }
        return address.slice(0, 6) + "..." + address.slice(-4);
    }

    function formatUSD(amount: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    async function getPoolInfo(
        poolAddress: string,
        dexName: string,
        token0Address: string,
        token1Address: string
    ): Promise<PoolInfo | null> {
        try {
            const pool = IUniswapV3Pool__factory.connect(poolAddress, signer);
            const [slot0, liquidity, fee] = await Promise.all([
                pool.slot0(),
                pool.liquidity(),
                pool.fee()
            ]);

            const token0Symbol = getTokenSymbol(token0Address);
            const token1Symbol = getTokenSymbol(token1Address);
            const decimals0 = network.tokens[token0Symbol].decimals;
            const decimals1 = network.tokens[token1Symbol].decimals;

            // Calcular precio usando sqrtPriceX96
            const sqrtPriceX96 = slot0.sqrtPriceX96;
            const price = Number(sqrtPriceX96) * Number(sqrtPriceX96) * (10 ** (decimals1 - decimals0)) / (2 ** 192);

            // Estimar liquidez en USD (asumiendo precio de ETH = $2300 para el cálculo)
            const ethPrice = 2300;
            let liquidityUSD = 0;

            if (token1Symbol === 'USDC' || token1Symbol === 'USDT') {
                liquidityUSD = Number(liquidity) * price;
            } else if (token0Symbol === 'WETH') {
                liquidityUSD = Number(liquidity) * ethPrice;
            } else if (token1Symbol === 'WETH') {
                liquidityUSD = Number(liquidity) * price * ethPrice;
            }

            return {
                address: poolAddress,
                dex: dexName,
                price,
                liquidityUSD,
                fee: Number(fee) / 10000, // Convertir a porcentaje
                token0: token0Address,
                token1: token1Address
            };
        } catch (error) {
            console.error(`Error obteniendo datos de la pool ${poolAddress}:`, error);
            return null;
        }
    }

    function calculateArbitrageOpportunity(poolA: PoolInfo, poolB: PoolInfo): ArbitrageOpportunity | null {
        const FLASH_LOAN_FEE = 0.0005; // 0.05%
        const GAS_COST_USD = 15; // Estimado en USD

        // Identificar pool de compra y venta
        const [poolBuy, poolSell] = poolA.price < poolB.price ? [poolA, poolB] : [poolB, poolA];
        const priceDiff = poolSell.price - poolBuy.price;
        const avgPrice = (poolSell.price + poolBuy.price) / 2;
        const percentageDiff = (priceDiff / avgPrice) * 100;

        // Calcular cantidad óptima basada en la liquidez disponible
        const maxImpact = 0.005; // 0.5% máximo impacto en precio
        const optimalAmount = Math.min(
            poolBuy.liquidityUSD * maxImpact / poolBuy.price,
            poolSell.liquidityUSD * maxImpact / poolSell.price,
            20 // Máximo 20 ETH por operación
        );

        // Calcular beneficio estimado
        const totalFees = FLASH_LOAN_FEE + poolBuy.fee + poolSell.fee;
        const estimatedProfit = optimalAmount * priceDiff * (1 - totalFees);
        const netProfit = estimatedProfit - GAS_COST_USD;

        if (netProfit <= 0) return null;

        return {
            poolBuy,
            poolSell,
            priceDifference: priceDiff,
            percentageDiff,
            optimalAmount,
            estimatedProfit,
            estimatedGasCost: GAS_COST_USD,
            netProfit
        };
    }

    async function displayArbitrageOpportunity(opportunity: ArbitrageOpportunity) {
        const token0Symbol = getTokenSymbol(opportunity.poolBuy.token0);
        const token1Symbol = getTokenSymbol(opportunity.poolBuy.token1);

        console.log(`\n${new Date().toISOString()}`);
        console.log(`Par: ${token0Symbol}/${token1Symbol}`);
        
        console.log(`\nPool de Compra (${opportunity.poolBuy.dex}):`);
        console.log(`Precio: ${formatUSD(opportunity.poolBuy.price)}`);
        console.log(`Liquidez: ${formatUSD(opportunity.poolBuy.liquidityUSD)}`);
        console.log(`Fee: ${opportunity.poolBuy.fee}%`);

        console.log(`\nPool de Venta (${opportunity.poolSell.dex}):`);
        console.log(`Precio: ${formatUSD(opportunity.poolSell.price)}`);
        console.log(`Liquidez: ${formatUSD(opportunity.poolSell.liquidityUSD)}`);
        console.log(`Fee: ${opportunity.poolSell.fee}%`);

        console.log(`\nOportunidad de Arbitraje:`);
        console.log(`Diferencia: ${formatUSD(opportunity.priceDifference)} (${opportunity.percentageDiff.toFixed(4)}%)`);
        console.log(`Cantidad óptima: ${opportunity.optimalAmount.toFixed(4)} ${token0Symbol}`);
        console.log(`Beneficio bruto estimado: ${formatUSD(opportunity.estimatedProfit)}`);
        console.log(`Costo de gas estimado: ${formatUSD(opportunity.estimatedGasCost)}`);
        console.log(`Beneficio neto estimado: ${formatUSD(opportunity.netProfit)}`);
    }

    // Monitorización continua
    while (true) {
        try {
            for (let i = 0; i < network.pools.length; i++) {
                for (let j = i + 1; j < network.pools.length; j++) {
                    const poolA = network.pools[i];
                    const poolB = network.pools[j];
                    
                    if (
                        (poolA.token0 === poolB.token0 && poolA.token1 === poolB.token1) ||
                        (poolA.token0 === poolB.token1 && poolA.token1 === poolB.token0)
                    ) {
                        const poolInfoA = await getPoolInfo(poolA.address, poolA.dex, poolA.token0, poolA.token1);
                        const poolInfoB = await getPoolInfo(poolB.address, poolB.dex, poolB.token0, poolB.token1);
                        
                        if (poolInfoA && poolInfoB) {
                            const opportunity = calculateArbitrageOpportunity(poolInfoA, poolInfoB);
                            
                            if (opportunity && opportunity.netProfit > 100) {
                                await displayArbitrageOpportunity(opportunity);
                            }
                        }
                    }
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 10000));
            
        } catch (error) {
            console.error("Error en la monitorización:", error);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }
}

async function main() {
    await monitorPools(ARBITRUM_CONFIG);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { formatUnits } from "@ethersproject/units";
import { ARBITRUM_CONFIG } from "../config/arbitrage.config";
import { FlashLoanArbitrage__factory, IUniswapV3Pool__factory } from "../typechain-types";

// Dirección del contrato desplegado en Arbitrum
const FLASH_LOAN_CONTRACT = "0x7fca7C822b78329c92F1d115479027a17a023d14";

// Constantes para colores en consola
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

// Cache global para símbolos de tokens
const tokenSymbolCache: { [key: string]: string } = {};

// Función auxiliar para obtener el símbolo del token
async function getTokenSymbol(tokenAddress: string): Promise<string> {
  // Si la dirección está en el cache, devolver el símbolo cacheado
  if (tokenSymbolCache[tokenAddress.toLowerCase()]) {
    return tokenSymbolCache[tokenAddress.toLowerCase()];
  }

  // Buscar en la configuración primero
  const tokenConfig = Object.values(ARBITRUM_CONFIG.tokens).find(
    t => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );

  if (tokenConfig) {
    tokenSymbolCache[tokenAddress.toLowerCase()] = tokenConfig.symbol;
    return tokenConfig.symbol;
  }

  try {
    const token = await ethers.getContractAt("IERC20", tokenAddress);
    const symbol = await token.symbol();
    tokenSymbolCache[tokenAddress.toLowerCase()] = symbol;
    return symbol;
  } catch (error) {
    // Si falla, usar un símbolo genérico basado en la dirección
    const shortAddr = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
    tokenSymbolCache[tokenAddress.toLowerCase()] = shortAddr;
    return shortAddr;
  }
}

// Función para formatear USD
function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Función para obtener los decimales de un token
async function getTokenDecimals(tokenAddress: string): Promise<number> {
  const token = await ethers.getContractAt("IERC20", tokenAddress);
  try {
    return await token.decimals();
  } catch (error) {
    return 18; // Por defecto asumimos 18 decimales
  }
}

// Función para obtener el precio de una pool
async function getPoolPrice(poolContract: any): Promise<number> {
  try {
    const slot0 = await poolContract.slot0();
    
    // Obtener tokens de la pool
    const [token0, token1] = await Promise.all([
      poolContract.token0(),
      poolContract.token1()
    ]);

    // Obtener decimales de los tokens de la configuración
    const token0Config = Object.values(ARBITRUM_CONFIG.tokens).find(t => t.address.toLowerCase() === token0.toLowerCase());
    const token1Config = Object.values(ARBITRUM_CONFIG.tokens).find(t => t.address.toLowerCase() === token1.toLowerCase());

    if (!token0Config || !token1Config) {
      console.error(`Token no encontrado en la configuración:
        token0: ${token0} ${token0Config ? '✓' : '✗'}
        token1: ${token1} ${token1Config ? '✓' : '✗'}`);
      return 0;
    }

    // El precio en Uniswap V3 viene como sqrtPriceX96
    const sqrtPriceX96 = BigNumber.from(slot0.sqrtPriceX96);
    
    // Convertir sqrtPriceX96 a precio decimal
    // price = (sqrtPriceX96 * sqrtPriceX96) / (2^192)
    const Q192 = BigNumber.from(2).pow(192);
    const price = sqrtPriceX96.mul(sqrtPriceX96).div(Q192);
    
    // Ajustar por la diferencia de decimales
    const decimalDiff = token0Config.decimals - token1Config.decimals;
    
    // Para WBTC/WETH (8 - 18 = -10)
    // Para WETH/USDC (18 - 6 = 12)
    let adjustedPrice;
    
    if (token0Config.symbol === 'WBTC' && token1Config.symbol === 'WETH') {
        // WBTC/WETH
        const basePrice = sqrtPriceX96.mul(sqrtPriceX96).div(Q192);
        
        // Ajustamos por la diferencia de decimales (8 vs 18)
        const decimalDiff = BigNumber.from(10).pow(10);
        adjustedPrice = parseFloat(formatUnits(basePrice.mul(decimalDiff), 20)); // Dividimos por 100 adicional
    } else if ((token0Config.symbol === 'WETH' && (token1Config.symbol === 'USDC' || token1Config.symbol === 'USDT')) ||
               ((token0Config.symbol === 'USDC' || token0Config.symbol === 'USDT') && token1Config.symbol === 'WETH')) {
        // Caso WETH/USDC o WETH/USDT (en cualquier orden)
        const isWETHToken0 = token0Config.symbol === 'WETH';
        
        // Obtener el precio base
        const basePrice = sqrtPriceX96.mul(sqrtPriceX96).div(Q192);
        const priceInDecimals = parseFloat(formatUnits(basePrice, 6));
        
        // Ajustar según el orden de los tokens
        adjustedPrice = isWETHToken0 ? priceInDecimals : (priceInDecimals > 0 ? 1 / priceInDecimals : 0);
    } else {
        // Caso general
        adjustedPrice = parseFloat(formatUnits(price, token1Config.decimals));
    }
    
    // Verificar que el precio es válido
    if (isNaN(adjustedPrice) || !isFinite(adjustedPrice)) {
        return 0;
    }
    
    return adjustedPrice;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error obteniendo precio:", error.message);
      if (error.stack) {
        console.error("Stack:", error.stack.split('\n')[0]);
      }
    } else {
      console.error("Error desconocido obteniendo precio");
    }
    return 0;
  }
}

async function executeFlashLoan(
  flashLoanContract: any,
  tokenIn: string,
  amount: string,
  tokenOut: string,
  poolA: string,
  poolB: string,
  isPoolAFirst: boolean
): Promise<void> {
  console.log("\n🚀 Ejecutando Flash Loan...");
  
  try {
    // Verificar que somos el owner antes de proceder
    const owner = await flashLoanContract.owner();
    const signer = await ethers.provider.getSigner();
    const signerAddress = await signer.getAddress();
    
    if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
      console.error("❌ Error: No eres el dueño del contrato de flash loan");
      return;
    }

    // Configurar pools primero
    console.log("\n1️⃣ Configurando pools...");
    const configTx = await flashLoanContract.configurePools(poolA, poolB);
    console.log(`TX Hash (config): ${configTx.hash}`);
    await configTx.wait();
    console.log("✅ Pools configuradas correctamente");

    // Verificar configuración
    const [configuredPoolA, configuredPoolB] = await Promise.all([
      flashLoanContract.poolA(),
      flashLoanContract.poolB()
    ]);

    if (configuredPoolA.toLowerCase() !== poolA.toLowerCase() || 
        configuredPoolB.toLowerCase() !== poolB.toLowerCase()) {
      throw new Error("Error en la configuración de pools");
    }

    // Ejecutar flash loan
    console.log("\n2️⃣ Solicitando flash loan...");
    const tx = await flashLoanContract.requestFlashLoan(
      tokenIn,
      amount,
      tokenOut,
      isPoolAFirst,
      {
        gasLimit: 3000000
      }
    );

    console.log(`TX Hash (flash loan): ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log("\n✅ Flash loan ejecutado con éxito");
      
      // Procesar eventos
      const events = receipt.logs
        .map((log: any) => {
          try {
            return flashLoanContract.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      // Mostrar eventos relevantes
      for (const event of events) {
        if (!event) continue;
        
        switch (event.name) {
          case "ArbitrageExecuted":
            const profit = parseFloat(formatUnits(event.args.profit, 18));
            console.log(`\n💰 Beneficio obtenido: ${profit.toFixed(6)} ${await getTokenSymbol(tokenIn)}`);
            break;
          case "SwapCompleted":
            const amountIn = parseFloat(formatUnits(event.args.amountIn, 18));
            const amountOut = parseFloat(formatUnits(event.args.amountOut, 18));
            console.log(`Swap: ${amountIn.toFixed(6)} → ${amountOut.toFixed(6)}`);
            break;
        }
      }
    } else {
      console.log("\n❌ La transacción falló");
    }
  } catch (error: any) {
    console.error("\n❌ Error en el flash loan:");
    if (error.reason) console.error("Razón:", error.reason);
    console.error("Mensaje:", error.message);
  }
}

// Función para calcular el monto óptimo del flash loan
function calculateOptimalAmount(poolLiquidity: number, priceDiff: number): string {
  // Usamos una fórmula conservadora que tiene en cuenta:
  // 1. La liquidez disponible
  // 2. La diferencia de precio
  // 3. El impacto en el precio
  
  // A mayor diferencia de precios, podemos usar un porcentaje mayor de la liquidez
  // pero siempre manteniéndonos conservadores para evitar demasiado slippage
  const basePercentage = 0.002; // 0.2% base
  const maxPercentage = 0.01;   // 1% máximo
  
  // Ajustamos el porcentaje según la diferencia de precio
  // A mayor diferencia, más porcentaje usamos (hasta el máximo)
  const percentage = Math.min(
    maxPercentage,
    basePercentage + (priceDiff / 100) * 0.002
  );
  
  // Calculamos el monto en función del porcentaje de la liquidez
  const amount = poolLiquidity * percentage;
  
  // Convertimos a wei (18 decimales)
  return BigInt(Math.floor(amount * 1e18)).toString();
}

async function main() {
  console.log("🔄 Iniciando monitorización en Arbitrum...");
  
  const [signer] = await ethers.getSigners();
  console.log(`📝 Usando cuenta: ${signer.address}`);

  // Conectar al contrato de flash loan
  const flashLoanContract = FlashLoanArbitrage__factory.connect(
    FLASH_LOAN_CONTRACT,
    signer
  );

  while (true) {
    try {
      console.log("\n" + "=".repeat(50));
      console.log(`🕒 ${new Date().toISOString()}`);
      console.log("=".repeat(50) + "\n");

      // Monitorear cada par de pools
      for (const poolA of ARBITRUM_CONFIG.pools) {
        for (const poolB of ARBITRUM_CONFIG.pools) {
          // Solo comparar pools diferentes del mismo par
          if (poolA.address === poolB.address || 
              poolA.token0 !== poolB.token0 || 
              poolA.token1 !== poolB.token1) {
            continue;
          }

          // Obtener datos de las pools
          const poolAContract = IUniswapV3Pool__factory.connect(poolA.address, signer);
          const poolBContract = IUniswapV3Pool__factory.connect(poolB.address, signer);

          // Obtener símbolos de tokens (usando cache)
          let token0Symbol = tokenSymbolCache[poolA.token0];
          let token1Symbol = tokenSymbolCache[poolA.token1];
          
          if (!token0Symbol || !token1Symbol) {
            [token0Symbol, token1Symbol] = await Promise.all([
              getTokenSymbol(poolA.token0),
              getTokenSymbol(poolA.token1)
            ]);
            tokenSymbolCache[poolA.token0] = token0Symbol;
            tokenSymbolCache[poolA.token1] = token1Symbol;
          }

          // Obtener precios
          const [priceA, priceB] = await Promise.all([
            getPoolPrice(poolAContract),
            getPoolPrice(poolBContract)
          ]);

          if (priceA === 0 || priceB === 0) {
            console.log(`⚠️ No se pudo obtener precios para ${token0Symbol}/${token1Symbol}`);
            continue;
          }

          // Mostrar información de Pool A
          console.log(`\n📊 ${poolA.dex} ${token0Symbol}/${token1Symbol}:`);
          console.log(`💰 Liquidez por lado: ${formatUSD(poolA.tvl * 500000)}`);
          console.log(`💵 Fee: ${poolA.fee / 10000}%`);
          console.log(`📈 Precio: 1 ${token0Symbol} = ${priceA.toFixed(4)} ${token1Symbol}`);

          // Mostrar información de Pool B
          console.log(`\n📊 ${poolB.dex} ${token0Symbol}/${token1Symbol}:`);
          console.log(`💰 Liquidez por lado: ${formatUSD(poolB.tvl * 500000)}`);
          console.log(`💵 Fee: ${poolB.fee / 10000}%`);
          console.log(`📈 Precio: 1 ${token0Symbol} = ${priceB.toFixed(4)} ${token1Symbol}`);

          // Calcular y mostrar diferencia absoluta de precio
          const priceDiff = Math.abs(priceA - priceB);
          const priceDiffPercent = (priceDiff / Math.min(priceA, priceB)) * 100;
          console.log(`\n${YELLOW}📊 Diferencia: ${priceDiff.toFixed(4)} ${token1Symbol} (${priceDiffPercent.toFixed(3)}%)${RESET}`);

          // Calcular comisión total necesaria
          const totalFee = 0.05 + poolA.fee/10000 + poolB.fee/10000;
          console.log(`${YELLOW}💸 Comisión total: ${totalFee.toFixed(3)}%${RESET}`);
          console.log(`  • Aave: 0.05%`);
          console.log(`  • ${poolA.dex}: ${poolA.fee/10000}%`);
          console.log(`  • ${poolB.dex}: ${poolB.fee/10000}%`);

          // Si hay beneficio potencial
          if (priceDiffPercent > totalFee) {
            const expectedProfit = priceDiffPercent - totalFee;
            console.log(`\n${GREEN}🎯 ¡Oportunidad de Arbitraje Detectada!${RESET}`);
            console.log(`📈 Beneficio esperado: ${expectedProfit.toFixed(3)}%`);

            // Determinar la dirección del arbitraje
            const isPoolAFirst = priceA < priceB;
            const [buyPool, sellPool] = isPoolAFirst ? [poolA, poolB] : [poolB, poolA];
            const buyPrice = isPoolAFirst ? priceA : priceB;
            const sellPrice = isPoolAFirst ? priceB : priceA;

            // Calcular monto óptimo basado en la liquidez y la diferencia de precio
            const minTVL = Math.min(poolA.tvl, poolB.tvl) * 1000000;
            const amount = calculateOptimalAmount(minTVL, priceDiffPercent);

            console.log(`\n${GREEN}🔄 Ruta de Arbitraje Óptima:${RESET}`);
            console.log(`1. Flash Loan: Pedir prestado ${token0Symbol} de Aave`);
            console.log(`2. COMPRAR en ${buyPool.dex}:`);
            console.log(`   • Precio: 1 ${token0Symbol} = ${buyPrice.toFixed(4)} ${token1Symbol}`);
            console.log(`   • Pool: ${buyPool.address.slice(0, 6)}...${buyPool.address.slice(-4)}`);
            console.log(`3. VENDER en ${sellPool.dex}:`);
            console.log(`   • Precio: 1 ${token0Symbol} = ${sellPrice.toFixed(4)} ${token1Symbol}`);
            console.log(`   • Pool: ${sellPool.address.slice(0, 6)}...${sellPool.address.slice(-4)}`);
            console.log(`4. Repagar Flash Loan a Aave + beneficio`);

            // Mostrar detalles del monto
            const amountInEth = parseFloat(formatUnits(amount, 18));
            console.log(`\n💰 Monto del Flash Loan: ${amountInEth.toFixed(4)} ${token0Symbol}`);
            console.log(`   (${(amountInEth/minTVL*100).toFixed(3)}% de la liquidez del pool)`);

            // Ejecutar flash loan
            await executeFlashLoan(
              flashLoanContract,
              poolA.token0,
              amount,
              poolA.token1,
              buyPool.address,
              sellPool.address,
              isPoolAFirst
            );
          }
        }
      }

      // Esperar antes de la siguiente iteración
      console.log("\n⏳ Esperando 5 segundos...");
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error: any) {
      console.error("\n❌ Error en la monitorización:", error.message);
      // También reducimos el tiempo de espera en caso de error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
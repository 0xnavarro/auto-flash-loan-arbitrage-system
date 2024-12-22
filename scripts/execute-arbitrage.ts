import { ethers } from "hardhat";
import { parseEther, formatUnits } from "ethers";
import { IntraChainArbitrage } from "../typechain-types";

interface ArbitrageParams {
  chain: string;
  tokenAddress: string;
  amount: bigint;
  sourcePool: string;
  targetPool: string;
}

async function executeArbitrage({
  chain,
  tokenAddress,
  amount,
  sourcePool,
  targetPool
}: ArbitrageParams) {
  console.log(`\nEjecutando arbitraje en ${chain}...`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`Cantidad: ${formatUnits(amount, 18)}`);
  console.log(`Ruta: ${sourcePool} -> ${targetPool}`);

  try {
    // Obtener signer
    const [signer] = await ethers.getSigners();
    console.log(`Ejecutando desde: ${signer.address}`);

    // Obtener instancia del contrato de arbitraje según la cadena
    const arbitrageAddress = getArbitrageAddress(chain);
    const arbitrage = await ethers.getContractAt(
      "IntraChainArbitrage",
      arbitrageAddress
    ) as IntraChainArbitrage;

    // Verificar que el contrato tenga suficientes aprobaciones
    await checkAndSetApprovals(arbitrage, tokenAddress, amount);

    // Calcular beneficio esperado
    const [profit, dexAToB] = await arbitrage.calculateArbitrage(
      tokenAddress,
      amount,
      sourcePool,
      targetPool
    );

    console.log(`Beneficio esperado: ${formatUnits(profit, 6)} USDC`);

    // Establecer slippage mínimo aceptable (95% del beneficio calculado)
    const minProfit = profit * 95n / 100n;

    // Ejecutar arbitraje
    const tx = await arbitrage.executeArbitrage(
      tokenAddress,
      amount,
      dexAToB,
      minProfit,
      { gasLimit: 500000 } // Gas limit explícito para evitar fallos
    );

    console.log(`Transacción enviada: ${tx.hash}`);
    
    // Esperar confirmación
    const receipt = await tx.wait();
    
    if (receipt && receipt.status === 1) {
      console.log("\n¡Arbitraje ejecutado con éxito!");
      
      // Verificar eventos para confirmar beneficio real
      const profitEvent = receipt.logs.find(
        log => log.topics[0] === arbitrage.interface.getEventTopic("ArbitrageExecuted")
      );
      
      if (profitEvent) {
        const [actualProfit] = arbitrage.interface.decodeEventLog(
          "ArbitrageExecuted",
          profitEvent.data,
          profitEvent.topics
        );
        
        console.log(`Beneficio real: ${formatUnits(actualProfit, 6)} USDC`);
        console.log(`Gas usado: ${receipt.gasUsed.toString()}`);
      }
    } else {
      console.log("\n❌ Transacción fallida");
    }
  } catch (error) {
    console.error("\n❌ Error ejecutando arbitraje:", error);
    throw error;
  }
}

async function checkAndSetApprovals(
  arbitrage: IntraChainArbitrage,
  token: string,
  amount: bigint
) {
  const [signer] = await ethers.getSigners();
  const tokenContract = await ethers.getContractAt("IERC20", token);
  
  const allowance = await tokenContract.allowance(
    signer.address,
    await arbitrage.getAddress()
  );
  
  if (allowance < amount) {
    console.log("Configurando aprobaciones...");
    const tx = await tokenContract.approve(
      await arbitrage.getAddress(),
      ethers.MaxUint256
    );
    await tx.wait();
    console.log("Aprobaciones configuradas");
  }
}

function getArbitrageAddress(chain: string): string {
  const addresses = {
    arbitrum: "0x...", // Dirección del contrato en Arbitrum
    base: "0x...",     // Dirección del contrato en Base
    bsc: "0x..."       // Dirección del contrato en BSC
  };
  
  const address = addresses[chain as keyof typeof addresses];
  if (!address) throw new Error(`No hay contrato desplegado en ${chain}`);
  
  return address;
}

// Exportar función para usar desde monitor-pools.ts
export default executeArbitrage; 
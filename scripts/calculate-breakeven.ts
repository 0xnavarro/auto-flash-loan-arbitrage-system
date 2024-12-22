import { ethers } from "hardhat";
import { formatUnits, parseEther } from "ethers";

async function main() {
  console.log("Calculando punto de equilibrio para arbitraje...\n");

  // Parámetros de ejemplo
  const amount = parseEther("10"); // 10 ETH
  const ethPrice = 1800; // $1800 por ETH
  
  // Costos fijos (en gas)
  const gasUsed = {
    flashLoan: 100000,    // Gas para flash loan
    swap1: 150000,        // Primer swap
    swap2: 150000,        // Segundo swap
    overhead: 50000       // Gas adicional
  };
  
  const totalGas = Object.values(gasUsed).reduce((a, b) => a + b, 0);
  
  // Calcular costos para diferentes precios de gas
  const gasPrices = [20, 30, 40, 50]; // en gwei
  
  console.log("Desglose de gas:");
  console.log("----------------");
  console.log(`Flash Loan: ${gasUsed.flashLoan} gas`);
  console.log(`Primer Swap: ${gasUsed.swap1} gas`);
  console.log(`Segundo Swap: ${gasUsed.swap2} gas`);
  console.log(`Overhead: ${gasUsed.overhead} gas`);
  console.log(`Total Gas: ${totalGas} gas\n`);

  console.log("Análisis de rentabilidad por precio de gas:");
  console.log("------------------------------------------");
  
  for (const gwei of gasPrices) {
    // Costo de gas en ETH
    const gasCostEth = (totalGas * gwei) / 1e9;
    const gasCostUsd = gasCostEth * ethPrice;
    
    // Comisión de Aave (0.05%)
    const aaveFeeEth = Number(formatUnits(amount * 5n / 10000n, 18));
    const aaveFeeUsd = aaveFeeEth * ethPrice;
    
    // Comisiones DEX (0.3% cada uno)
    const dexFeesEth = Number(formatUnits(amount * 6n / 1000n, 18));
    const dexFeesUsd = dexFeesEth * ethPrice;
    
    // Costo total
    const totalCostUsd = gasCostUsd + aaveFeeUsd + dexFeesUsd;
    
    // Diferencia de precio mínima necesaria para break-even
    const amountUsd = Number(formatUnits(amount, 18)) * ethPrice;
    const minPriceDiff = (totalCostUsd / amountUsd) * 100;
    
    console.log(`\nPrecio de gas: ${gwei} gwei`);
    console.log(`Costo de gas: $${gasCostUsd.toFixed(2)}`);
    console.log(`Comisión Aave: $${aaveFeeUsd.toFixed(2)}`);
    console.log(`Comisiones DEX: $${dexFeesUsd.toFixed(2)}`);
    console.log(`Costo total: $${totalCostUsd.toFixed(2)}`);
    console.log(`Diferencia mínima de precio necesaria: ${minPriceDiff.toFixed(4)}%`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 
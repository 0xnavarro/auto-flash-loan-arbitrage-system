import { ethers } from "hardhat";
import { parseEther } from "ethers";
import { IntraChainArbitrage, MockToken } from "../typechain-types";

async function main() {
  console.log("Simulando operación de arbitraje...\n");

  // Obtener contratos desplegados
  const weth = await ethers.getContractAt("MockToken", "0xd19D3AC573Cb92D8A043724144f7F0080eA9650a");
  const usdc = await ethers.getContractAt("MockToken", "0x0E5C814c7BC24450F17DB1e261B7A40ED19fC98B");
  const aavePool = "0xe54659A546FA68f8250791f3d3096804Bf442Ad0";
  const dexA = "0xAB4F5f1Ee46Af26A9201c2C28af9C570727c582d";
  const dexB = "0xeAd2b58c1BD3B03F2EA10e368FeD8fF5AF02aaEb";

  // Desplegar contrato de arbitraje
  const IntraChainArbitrage = await ethers.getContractFactory("IntraChainArbitrage");
  const arbitrage = await IntraChainArbitrage.deploy(aavePool, dexA, dexB);
  await arbitrage.waitForDeployment();
  
  console.log("Contrato de arbitraje desplegado en:", await arbitrage.getAddress());

  // Calcular oportunidad de arbitraje
  const amount = parseEther("10"); // 10 WETH para tener un volumen más realista
  console.log("\nCalculando oportunidad de arbitraje para 10 WETH...");
  
  const [profit, dexAToB] = await arbitrage.calculateArbitrage(
    await weth.getAddress(),
    await usdc.getAddress(),
    amount
  );

  // Calcular costos
  const flashLoanFee = amount * 5n / 10000n; // 0.05% de Aave v3
  const dexFee = amount * 3n / 1000n; // 0.3% por DEX (Uniswap v2 style)
  const totalFees = flashLoanFee + dexFee;
  
  console.log("\nCostos estimados:");
  console.log("Flash Loan (0.05%):", ethers.formatEther(flashLoanFee), "WETH");
  console.log("DEX (0.3%):", ethers.formatEther(dexFee), "WETH");
  console.log("Total fees:", ethers.formatEther(totalFees), "WETH");

  console.log("\nResultados:");
  console.log("Beneficio bruto:", ethers.formatUnits(profit, 6), "USDC");
  console.log("Dirección del arbitraje:", dexAToB ? "DEX A -> DEX B" : "DEX B -> DEX A");

  // Convertir fees de WETH a USDC para comparación
  const feesInUsdc = totalFees * 1800n; // Usando precio base de 1800 USDC/WETH
  const netProfit = profit - feesInUsdc;

  console.log("\nAnálisis de rentabilidad:");
  console.log("Beneficio neto:", ethers.formatUnits(netProfit, 6), "USDC");
  console.log("ROI:", ((Number(netProfit) / (Number(amount) * 1800)) * 100).toFixed(4), "%");

  // Si hay beneficio neto, ejecutar el arbitraje
  if (netProfit > 0) {
    console.log("\nEjecutando arbitraje...");
    
    const minProfit = netProfit * 95n / 100n; // 95% del beneficio neto calculado como mínimo aceptable
    
    const tx = await arbitrage.executeArbitrage(
      await weth.getAddress(),
      amount,
      await usdc.getAddress(),
      dexAToB,
      minProfit
    );
    
    await tx.wait();
    console.log("Arbitraje ejecutado con éxito!");
    
    // Mostrar beneficio real
    console.log("\nBeneficio real:", ethers.formatUnits(netProfit, 6), "USDC");
    console.log("ROI real:", ((Number(netProfit) / (Number(amount) * 1800)) * 100).toFixed(4), "%");
  } else {
    console.log("\nNo hay oportunidad de arbitraje rentable después de considerar las comisiones");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 
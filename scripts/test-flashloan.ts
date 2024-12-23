import { ethers } from "hardhat";
import { ARBITRUM_CONFIG } from "../config/arbitrage.config";
import { FlashLoanArbitrage__factory, IERC20__factory } from "../typechain-types";

async function main() {
  console.log("Iniciando prueba de flash loan en Arbitrum...");

  const [signer] = await ethers.getSigners();
  console.log("Usando cuenta:", signer.address);

  // Conectar al contrato
  const flashLoanContract = FlashLoanArbitrage__factory.connect(
    ARBITRUM_CONFIG.flashLoanContract,
    signer
  );

  // Configurar pools para el test (WETH/USDC en Uniswap y Sushiswap)
  const uniswapPool = "0xC6962004f452bE9203591991D15f6b388e09E8D0";
  const sushiPool = "0xf3Eb87C1F6020982173C908E7eB31aA66c1f0296";

  try {
    // Verificar balance de WETH
    const wethToken = IERC20__factory.connect(ARBITRUM_CONFIG.tokens.WETH.address, signer);
    const wethBalance = await wethToken.balanceOf(signer.address);
    console.log("Balance WETH:", ethers.formatEther(wethBalance), "WETH");

    // Verificar que el contrato está bien configurado
    const owner = await flashLoanContract.owner();
    console.log("Dueño del contrato:", owner);
    console.log("Mi dirección:", signer.address);
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error("No eres el dueño del contrato");
    }

    // Verificar balance de WETH en el pool de Aave
    const aavePoolAddress = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // Aave V3 Pool
    const aWETHAddress = "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8"; // aWETH en Arbitrum
    const wethBalanceInAave = await wethToken.balanceOf(aWETHAddress);
    console.log("\nLiquidez en Aave V3:");
    console.log("WETH disponible:", ethers.formatEther(wethBalanceInAave), "WETH");

    console.log("\nConfigurando pools para el test...");
    const configTx = await flashLoanContract.configurePools(uniswapPool, sushiPool);
    await configTx.wait();
    console.log("Pools configuradas correctamente");

    // Verificar configuración
    console.log("\nVerificando configuración de pools...");
    const poolA = await flashLoanContract.poolA();
    const poolB = await flashLoanContract.poolB();
    console.log("Pool A configurada:", poolA);
    console.log("Pool B configurada:", poolB);

    // Aprobar tokens
    console.log("\nAprobando tokens...");
    const wethApprovalTx = await wethToken.approve(
      flashLoanContract.getAddress(),
      ethers.MaxUint256
    );
    await wethApprovalTx.wait();
    console.log("WETH aprobado para el contrato");

    const usdcToken = IERC20__factory.connect(ARBITRUM_CONFIG.tokens.USDC.address, signer);
    const usdcApprovalTx = await usdcToken.approve(
      flashLoanContract.getAddress(),
      ethers.MaxUint256
    );
    await usdcApprovalTx.wait();
    console.log("USDC aprobado para el contrato");

    // Realizar un flash loan pequeño de WETH
    const wethAddress = ARBITRUM_CONFIG.tokens.WETH.address;
    const usdcAddress = ARBITRUM_CONFIG.tokens.USDC.address;
    const amount = ethers.parseEther("0.1"); // 0.1 WETH

    console.log("\nSolicitando flash loan de 0.1 WETH...");
    console.log("Token entrada:", wethAddress);
    console.log("Token salida:", usdcAddress);
    console.log("Cantidad:", ethers.formatEther(amount), "WETH");

    const tx = await flashLoanContract.requestFlashLoan(
      wethAddress,
      amount,
      usdcAddress,
      true,
      {
        gasLimit: 3000000
      }
    );

    console.log("Transacción enviada:", tx.hash);
    console.log("Esperando confirmación...");
    
    const receipt = await tx.wait();
    
    if (receipt && receipt.status === 1) {
      console.log("\n✅ Flash loan ejecutado exitosamente!");
      console.log("Hash de la transacción:", receipt.hash);
      console.log("Gas usado:", receipt.gasUsed.toString());

      // Buscar eventos
      const events = receipt.logs.map(log => {
        try {
          return flashLoanContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      console.log("\nEventos emitidos:");
      events.forEach(event => {
        console.log(`- ${event?.name}:`, event?.args);
      });
    } else {
      console.log("\n❌ La transacción falló");
      console.log("Hash:", receipt?.hash);
      console.log("Gas usado:", receipt?.gasUsed.toString());
    }

  } catch (error: any) {
    console.error("\n❌ Error durante la prueba:");
    if (error.error) {
      console.error("Mensaje de error:", error.error.reason || error.error.message);
    } else {
      console.error("Mensaje de error:", error.message || error);
    }
    if (error.transaction) {
      console.error("Datos de la transacción:", {
        from: error.transaction.from,
        to: error.transaction.to,
        data: error.transaction.data?.slice(0, 66) + "..." // Solo mostrar el inicio del data
      });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error fatal:", error);
    process.exit(1);
  }); 
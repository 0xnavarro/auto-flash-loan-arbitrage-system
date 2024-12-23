import { ethers } from "hardhat";
import { ARBITRUM_CONFIG } from "../config/arbitrage.config";

async function main() {
  // Obtener el signer
  const [signer] = await ethers.getSigners();
  console.log("Aprobando tokens con la cuenta:", signer.address);

  // Lista de tokens a aprobar
  const tokens = Object.values(ARBITRUM_CONFIG.tokens);

  // Aprobar cada token para el router y el contrato de flash loan
  for (const token of tokens) {
    console.log(`\nAprobando ${token.symbol} (${token.address})...`);
    
    const tokenContract = await ethers.getContractAt("IERC20", token.address);
    const maxApproval = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; // MaxUint256 como string

    // Aprobar para el contrato de flash loan
    console.log("Aprobando para el flash loan...");
    try {
      const approveTx = await tokenContract.approve(ARBITRUM_CONFIG.flashLoanContract, maxApproval);
      await approveTx.wait();
      console.log("✅ Token aprobado para el flash loan");
    } catch (err: any) {
      console.error("❌ Error al aprobar para el flash loan:", err.message);
    }
  }

  console.log("\n✅ Proceso de aprobación completado");
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  }); 
import { ethers } from "ethers";
import { formatEther, formatUnits } from "ethers/lib/utils";

// Interfaces necesarias (ABI mínimo)
const AAVE_POOL_ABI = [
    "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
    "function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
];

const DEBT_TOKEN_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function getScaledUserBalanceAndSupply(address user) external view returns (uint256, uint256)"
];

// Direcciones en Arbitrum
const AAVE_POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
const USDC_ADDRESS = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";
const WETH_ADDRESS = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

// Función principal de monitoreo
async function monitorLiquidations() {
    // Verificar que existe la API key
    if (!process.env.ALCHEMY_API_KEY) {
        throw new Error("ALCHEMY_API_KEY no está definida en el archivo .env");
    }

    // Construir la URL de RPC completa
    const RPC_URL = `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

    // Conectar al proveedor
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

    // Conectar al contrato de Aave
    const aavePool = new ethers.Contract(
        AAVE_POOL_ADDRESS,
        AAVE_POOL_ABI,
        provider
    );

    // Función para obtener health factor
    async function getHealthFactor(userAddress: string) {
        const {
            totalCollateralBase,
            totalDebtBase,
            healthFactor
        } = await aavePool.getUserAccountData(userAddress);

        return {
            totalCollateral: formatEther(totalCollateralBase),
            totalDebt: formatEther(totalDebtBase),
            healthFactor: formatEther(healthFactor)
        };
    }

    // Función para verificar si una posición es liquidable
    async function checkIfLiquidatable(userAddress: string) {
        const userData = await getHealthFactor(userAddress);
        const isLiquidatable = Number(userData.healthFactor) < 1;

        console.log(`
        Usuario: ${userAddress}
        Colateral Total: ${userData.totalCollateral} USD
        Deuda Total: ${userData.totalDebt} USD
        Health Factor: ${userData.healthFactor}
        Liquidable: ${isLiquidatable ? "SÍ" : "NO"}
        `);

        return isLiquidatable;
    }

    // Función para obtener detalles de la posición
    async function getPositionDetails(userAddress: string) {
        const userData = await aavePool.getUserAccountData(userAddress);
        
        return {
            collateral: formatEther(userData.totalCollateralBase),
            debt: formatEther(userData.totalDebtBase),
            healthFactor: formatEther(userData.healthFactor),
            liquidationThreshold: userData.currentLiquidationThreshold.toString(),
            ltv: userData.ltv.toString()
        };
    }

    // Ejemplo de monitoreo continuo
    async function startMonitoring(targetAddress: string) {
        console.log("Iniciando monitoreo de posición...");
        
        setInterval(async () => {
            try {
                const isLiquidatable = await checkIfLiquidatable(targetAddress);
                
                if (isLiquidatable) {
                    const details = await getPositionDetails(targetAddress);
                    console.log("¡ALERTA! Posición liquidable encontrada:");
                    console.log(details);
                    
                    // Aquí podrías llamar a tu contrato FlashDumpPump
                    // await flashDumpPump.executeLiquidation(...)
                }
            } catch (error) {
                console.error("Error en monitoreo:", error);
            }
        }, 15000); // Revisar cada 15 segundos
    }

    // Función para encontrar posiciones en riesgo
    async function findRiskyPositions(minDebt: string) {
        // Aquí necesitarías integrar con The Graph o un indexador
        // para obtener una lista de usuarios con deuda
        // Este es un ejemplo simplificado
        
        console.log("Buscando posiciones en riesgo...");
        
        // Ejemplo de cómo procesar una lista de direcciones
        const addresses = [
            "0x...", // Añadir direcciones a monitorear
            "0x..."
        ];

        for (const address of addresses) {
            const {healthFactor} = await getHealthFactor(address);
            if (Number(healthFactor) < 1.1) { // Buscar posiciones cerca de liquidación
                console.log(`Posición en riesgo encontrada: ${address}`);
                await getPositionDetails(address);
            }
        }
    }

    return {
        getHealthFactor,
        checkIfLiquidatable,
        getPositionDetails,
        startMonitoring,
        findRiskyPositions
    };
}

// Ejemplo de uso
async function main() {
    const monitor = await monitorLiquidations();
    
    // Ejemplo: monitorear una dirección específica
    const targetAddress = "0x..."; // Dirección a monitorear
    
    // Iniciar monitoreo
    await monitor.startMonitoring(targetAddress);
    
    // O buscar posiciones en riesgo
    await monitor.findRiskyPositions("1000"); // Mínimo 1000 USD en deuda
}

// Ejecutar el script
main().catch((error) => {
    console.error(error);
    process.exit(1);
}); 
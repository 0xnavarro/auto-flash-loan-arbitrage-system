# Estrategia de Arbitraje Intra-Chain

## Descripción General

El arbitraje intra-chain aprovecha las diferencias de precios de un mismo token entre diferentes DEX dentro de una misma blockchain. Esta estrategia utiliza flash loans para maximizar las ganancias sin requerir un capital inicial significativo.

## Componentes Principales

1. **Flash Loan**: Préstamo sin colateral de Aave
2. **DEX**: Uniswap V2/V3, SushiSwap, etc.
3. **Smart Contract**: Contrato de arbitraje que ejecuta la lógica
4. **Token**: Asset a arbitrar

## Funcionamiento

1. **Detección de Oportunidad**:
```typescript
async function checkPriceDiscrepancy(
    token: string,
    amount: BigNumber
): Promise<{
    profitable: boolean,
    expectedProfit: BigNumber
}> {
    // Obtener precios de diferentes DEX
    const uniswapPrice = await getUniswapPrice(token, amount);
    const sushiswapPrice = await getSushiswapPrice(token, amount);
    
    // Calcular diferencia
    const priceDiff = Math.abs(uniswapPrice - sushiswapPrice);
    const profitAfterFees = calculateProfitAfterFees(priceDiff);
    
    return {
        profitable: profitAfterFees > 0,
        expectedProfit: profitAfterFees
    };
}
```

2. **Cálculo de Rentabilidad**:
```typescript
function calculateProfitAfterFees(
    priceDiff: number,
    amount: BigNumber
): BigNumber {
    // Costos
    const aaveV3Fee = amount.mul(5).div(10000); // 0.05%
    const estimatedGas = ethers.utils.parseEther("0.005"); // ~500k gas
    const dexFees = amount.mul(3).div(1000); // 0.3% por DEX
    
    // Ganancia bruta
    const grossProfit = priceDiff.mul(amount);
    
    // Ganancia neta
    return grossProfit
        .sub(aaveV3Fee)
        .sub(estimatedGas)
        .sub(dexFees);
}
```

## Implementación del Contrato

```solidity
// SPDX-License-Identifier: MIT
contract IntraChainArbitrage is FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    // Eventos
    event ArbitrageExecuted(
        address indexed token,
        uint256 amount,
        uint256 profit
    );
    
    event ArbitrageFailed(
        address indexed token,
        string reason
    );

    // Constructor
    constructor(
        IPoolAddressesProvider provider
    ) FlashLoanSimpleReceiverBase(provider) {}

    // Función principal
    function executeArbitrage(
        address token,
        uint256 amount,
        bytes calldata params
    ) external {
        // Solicitar flash loan
        IPool(POOL).flashLoanSimple(
            address(this),
            token,
            amount,
            params,
            0
        );
    }

    // Callback de flash loan
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Decodificar parámetros
        (
            address[] memory path,
            uint256 minAmountOut
        ) = abi.decode(params, (address[], uint256));

        try {
            // 1. Swap en DEX A
            uint256 amountReceived = swapExactTokensForTokens(
                amount,
                minAmountOut,
                path,
                address(this)
            );

            // 2. Swap en DEX B
            uint256 finalAmount = swapExactTokensForTokens(
                amountReceived,
                amount + premium,
                reversePath(path),
                address(this)
            );

            // 3. Verificar ganancia
            require(
                finalAmount >= amount + premium,
                "Insufficient profit"
            );

            // 4. Aprobar repago
            IERC20(asset).approve(
                address(POOL),
                amount + premium
            );

            // Emitir evento
            emit ArbitrageExecuted(
                asset,
                amount,
                finalAmount - (amount + premium)
            );

            return true;
        } catch (bytes memory reason) {
            emit ArbitrageFailed(asset, string(reason));
            revert("Arbitrage failed");
        }
    }
}
```

## Configuración y Despliegue

1. **Prerequisitos**:
```bash
# Instalar dependencias
npm install @openzeppelin/contracts @aave/core-v3

# Compilar contratos
npx hardhat compile
```

2. **Despliegue**:
```typescript
async function deploy() {
    // Obtener signer
    const [deployer] = await ethers.getSigners();
    
    // Desplegar contrato
    const Arbitrage = await ethers.getContractFactory("IntraChainArbitrage");
    const arbitrage = await Arbitrage.deploy(AAVE_PROVIDER_ADDRESS);
    await arbitrage.deployed();
    
    console.log("Contrato desplegado en:", arbitrage.address);
}
```

## Monitoreo y Ejecución

1. **Script de Monitoreo**:
```typescript
async function monitorPrices() {
    // Configuración
    const THRESHOLD = 0.5; // 0.5% diferencia mínima
    const CHECK_INTERVAL = 1000; // 1 segundo
    
    while (true) {
        // Verificar precios
        const opportunity = await checkPriceDiscrepancy(
            TOKEN_ADDRESS,
            AMOUNT
        );
        
        if (opportunity.profitable) {
            // Ejecutar arbitraje
            await executeArbitrage(
                TOKEN_ADDRESS,
                AMOUNT,
                opportunity.params
            );
        }
        
        // Esperar intervalo
        await sleep(CHECK_INTERVAL);
    }
}
```

2. **Gestión de Gas**:
```typescript
async function estimateGas(
    token: string,
    amount: BigNumber,
    params: string
): Promise<BigNumber> {
    // Estimar gas para la transacción
    const gasEstimate = await arbitrageContract.estimateGas
        .executeArbitrage(token, amount, params);
    
    // Añadir margen de seguridad (20%)
    return gasEstimate.mul(120).div(100);
}
```

## Costos y Comisiones

1. **Desglose de Costos**:
   - Flash Loan (Aave V3): 0.05%
   - DEX Swap (Uniswap/Sushiswap): 0.3% por swap
   - Gas: Variable (~500k gas)

2. **Cálculo de Rentabilidad Mínima**:
```typescript
function calculateMinimumSpread(amount: BigNumber): number {
    // Costos fijos
    const flashLoanFee = 0.0005; // 0.05%
    const dexFee = 0.003; // 0.3%
    
    // Spread mínimo necesario
    return (flashLoanFee + (dexFee * 2)) * 100; // En porcentaje
}
```

## Gestión de Riesgos

1. **Validaciones**:
```solidity
function validateArbitrage(
    uint256 amount,
    uint256 expectedProfit,
    uint256 gasPrice
) internal pure {
    // Verificar tamaño mínimo
    require(amount >= MIN_AMOUNT, "Amount too small");
    
    // Verificar rentabilidad
    require(
        expectedProfit > calculateMinProfit(gasPrice),
        "Insufficient profit"
    );
    
    // Verificar límites
    require(amount <= MAX_AMOUNT, "Amount too large");
}
```

2. **Protecciones**:
```solidity
modifier onlyProfitable(uint256 expectedProfit) {
    require(expectedProfit > 0, "No profit");
    _;
}

modifier withGasPrice(uint256 maxGasPrice) {
    require(
        tx.gasprice <= maxGasPrice,
        "Gas price too high"
    );
    _;
}
```

## Optimizaciones

1. **Rutas Óptimas**:
```typescript
function findOptimalPath(
    token: string,
    amount: BigNumber
): Route[] {
    // Calcular rutas posibles
    const routes = getAllPossibleRoutes(token);
    
    // Ordenar por rentabilidad
    return routes.sort((a, b) => 
        b.expectedProfit.sub(a.expectedProfit)
    );
}
```

2. **Gas Optimization**:
```solidity
// Usar uint256 en lugar de uint8/uint128
// Empaquetar variables
contract OptimizedArbitrage {
    struct ArbitrageParams {
        uint256 amount;
        uint256 minProfit;
        address[] path;
        uint256 deadline;
    }
    
    // Cache de datos frecuentes
    mapping(address => uint256) private lastPrices;
}
```

## Mantenimiento

1. **Monitoreo**:
```typescript
async function monitorHealth() {
    // Verificar saldo
    const balance = await getBalance();
    if (balance.lt(MIN_BALANCE)) {
        await notifyLowBalance();
    }
    
    // Verificar gas
    const gasPrice = await getGasPrice();
    if (gasPrice.gt(MAX_GAS_PRICE)) {
        await pauseOperations();
    }
}
```

2. **Actualizaciones**:
```typescript
async function updateParameters() {
    // Actualizar precios mínimos
    const newPrices = await fetchLatestPrices();
    await updateMinimumPrices(newPrices);
    
    // Actualizar rutas
    const newRoutes = await calculateOptimalRoutes();
    await updateArbitrageRoutes(newRoutes);
}
```

## Troubleshooting

1. **Errores Comunes**:
   - "Insufficient profit": Diferencia de precios muy pequeña
   - "Gas price too high": Costo de gas excede límite
   - "Slippage too high": Cambio de precio durante ejecución

2. **Soluciones**:
```typescript
async function handleError(error: Error) {
    switch (error.code) {
        case "INSUFFICIENT_PROFIT":
            await adjustProfitThreshold();
            break;
        case "HIGH_GAS":
            await waitForBetterGas();
            break;
        case "SLIPPAGE":
            await updateSlippageTolerance();
            break;
    }
}
```

## Referencias

1. [Aave V3 Docs](https://docs.aave.com/developers/v/2.0/)
2. [Uniswap V2 Docs](https://docs.uniswap.org/protocol/V2/introduction)
3. [Hardhat Documentation](https://hardhat.org/getting-started/)
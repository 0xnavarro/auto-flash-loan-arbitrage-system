# Estrategia de Arbitraje Cross-Chain

## Descripción General

El arbitraje cross-chain aprovecha las diferencias de precios de un mismo token entre diferentes blockchains. Esta estrategia utiliza flash loans y bridges para maximizar las ganancias, operando en múltiples cadenas simultáneamente.

## Cadenas Soportadas

1. **Arbitrum**
   - Gas: $0.3-1 por transacción
   - DEXs: Camelot, Sushiswap, Zyberswap
   - Bridges: Stargate, LayerZero, Hop

2. **Base**
   - Gas: $0.1-0.3 por transacción
   - DEXs: BaseSwap, SwapBased
   - Bridges: LayerZero, Stargate

3. **BSC (Binance Smart Chain)**
   - Gas: $0.1-0.2 por transacción
   - DEXs: PancakeSwap, BiSwap
   - Bridges: Stargate, Multichain

## Componentes Principales

1. **Flash Loan**: Préstamo sin colateral de Aave
2. **Bridge**: Protocolo para transferir tokens entre cadenas
3. **DEX**: Exchanges descentralizados en cada cadena
4. **Smart Contract**: Contratos de arbitraje en cada cadena

## Implementación del Contrato

```solidity
// SPDX-License-Identifier: MIT
contract CrossChainArbitrage is FlashLoanSimpleReceiverBase, IStargateReceiver {
    using SafeERC20 for IERC20;

    // Eventos
    event ArbitrageStarted(
        address indexed token,
        uint256 amount,
        uint16 destChain
    );
    
    event ArbitrageCompleted(
        address indexed token,
        uint256 profit
    );
    
    event ArbitrageFailed(
        address indexed token,
        string reason
    );

    // Variables de estado
    IStargateRouter public stargateRouter;
    mapping(uint16 => address) public remoteArbitrage;
    mapping(bytes32 => ArbitrageData) public pendingArbitrages;

    struct ArbitrageData {
        address token;
        uint256 amount;
        uint256 minAmountOut;
        uint256 deadline;
        address initiator;
    }

    // Constructor
    constructor(
        IPoolAddressesProvider provider,
        address _stargateRouter
    ) FlashLoanSimpleReceiverBase(provider) {
        stargateRouter = IStargateRouter(_stargateRouter);
    }

    // Función principal
    function executeArbitrage(
        address token,
        uint256 amount,
        uint16 destChain,
        bytes calldata params
    ) external {
        // Solicitar flash loan
        IPool(POOL).flashLoanSimple(
            address(this),
            token,
            amount,
            abi.encode(destChain, params),
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
        (uint16 destChain, bytes memory bridgeParams) = 
            abi.decode(params, (uint16, bytes));

        try {
            // 1. Aprobar tokens para el bridge
            IERC20(asset).approve(
                address(stargateRouter),
                amount
            );

            // 2. Iniciar transferencia cross-chain
            stargateRouter.swap(
                destChain,                  // destino
                getPoolId(asset),           // pool origen
                getPoolId(asset),           // pool destino
                payable(msg.sender),        // remitente
                amount,                     // cantidad
                amount * 995 / 1000,        // min recibido (0.5% slippage)
                IStargateRouter.lzTxObj(
                    0,                      // gas estimado
                    0,                      // gas en destino
                    "0x"                    // datos adicionales
                ),
                abi.encodePacked(
                    remoteArbitrage[destChain],
                    bridgeParams
                ),
                bytes("")                   // datos adicionales
            );

            // Emitir evento
            emit ArbitrageStarted(
                asset,
                amount,
                destChain
            );

            return true;
        } catch (bytes memory reason) {
            emit ArbitrageFailed(asset, string(reason));
            revert("Bridge failed");
        }
    }

    // Callback de Stargate
    function sgReceive(
        uint16 srcChain,
        bytes memory srcAddress,
        uint256 nonce,
        address token,
        uint256 amount,
        bytes memory payload
    ) external override {
        require(
            msg.sender == address(stargateRouter),
            "Only Stargate Router"
        );

        // Decodificar parámetros
        (
            address[] memory path,
            uint256 minAmountOut,
            address recipient
        ) = abi.decode(payload, (address[], uint256, address));

        try {
            // 1. Ejecutar swap en DEX destino
            uint256 amountReceived = swapExactTokensForTokens(
                amount,
                minAmountOut,
                path,
                address(this)
            );

            // 2. Transferir tokens al recipient
            IERC20(path[path.length - 1]).transfer(
                recipient,
                amountReceived
            );

            // Emitir evento
            emit ArbitrageCompleted(
                token,
                amountReceived
            );
        } catch (bytes memory reason) {
            emit ArbitrageFailed(token, string(reason));
            revert("Arbitrage failed");
        }
    }
}
```

## Configuración y Despliegue

1. **Prerequisitos**:
```bash
# Instalar dependencias
npm install @openzeppelin/contracts @aave/core-v3 @layerzero-labs/solidity-examples

# Compilar contratos
npx hardhat compile
```

2. **Despliegue**:
```typescript
async function deployAll() {
    // Desplegar en cada cadena
    const arbitrumContract = await deployToChain("arbitrum");
    const baseContract = await deployToChain("base");
    const bscContract = await deployToChain("bsc");
    
    // Configurar contratos remotos
    await setupRemoteContracts(
        arbitrumContract,
        baseContract,
        bscContract
    );
}

async function deployToChain(chain: string) {
    // Obtener signer para la cadena
    const signer = await getChainSigner(chain);
    
    // Desplegar contrato
    const Arbitrage = await ethers.getContractFactory("CrossChainArbitrage");
    const arbitrage = await Arbitrage.connect(signer).deploy(
        AAVE_PROVIDERS[chain],
        STARGATE_ROUTERS[chain]
    );
    
    await arbitrage.deployed();
    console.log(`Contrato desplegado en ${chain}:`, arbitrage.address);
    
    return arbitrage;
}
```

## Monitoreo y Ejecución

1. **Script de Monitoreo**:
```typescript
async function monitorCrossChainPrices() {
    // Configuración
    const THRESHOLD = 1.0; // 1% diferencia mínima
    const CHECK_INTERVAL = 3000; // 3 segundos
    
    while (true) {
        // Verificar precios en todas las cadenas
        const prices = await Promise.all([
            getPriceInArbitrum(),
            getPriceInBase(),
            getPriceInBSC()
        ]);
        
        // Encontrar mejor oportunidad
        const opportunity = findBestArbitrage(prices);
        
        if (opportunity.profitable) {
            // Ejecutar arbitraje
            await executeCrossChainArbitrage(
                opportunity.sourceChain,
                opportunity.destChain,
                opportunity.params
            );
        }
        
        // Esperar intervalo
        await sleep(CHECK_INTERVAL);
    }
}
```

2. **Cálculo de Rentabilidad**:
```typescript
function calculateCrossChainProfit(
    sourcePrice: number,
    destPrice: number,
    amount: BigNumber
): {
    profitable: boolean,
    expectedProfit: BigNumber
} {
    // Costos
    const flashLoanFee = amount.mul(5).div(10000); // 0.05%
    const bridgeFee = amount.mul(6).div(1000); // 0.6%
    const dexFee = amount.mul(3).div(1000); // 0.3%
    
    // Ganancia bruta
    const grossProfit = amount
        .mul(destPrice - sourcePrice)
        .div(sourcePrice);
    
    // Ganancia neta
    const netProfit = grossProfit
        .sub(flashLoanFee)
        .sub(bridgeFee)
        .sub(dexFee);
    
    return {
        profitable: netProfit.gt(0),
        expectedProfit: netProfit
    };
}
```

## Costos y Comisiones

1. **Desglose de Costos**:
   - Flash Loan (Aave V3): 0.05%
   - Bridge (Stargate): 0.6%
   - DEX Swap: 0.3% por swap
   - Gas: Variable por cadena

2. **Rentabilidad Mínima**:
```typescript
function calculateMinimumSpread(): number {
    const costs = {
        flashLoan: 0.0005,  // 0.05%
        bridge: 0.006,      // 0.6%
        dexFee: 0.003,      // 0.3%
        buffer: 0.001       // 0.1% margen
    };
    
    return Object.values(costs).reduce((a, b) => a + b) * 100; // En porcentaje
}
```

## Gestión de Riesgos

1. **Validaciones**:
```solidity
function validateCrossChainArbitrage(
    uint256 amount,
    uint256 expectedProfit,
    uint256 gasPrice,
    uint256 bridgeDelay
) internal pure {
    // Verificar tamaño mínimo
    require(amount >= MIN_AMOUNT, "Amount too small");
    
    // Verificar rentabilidad
    require(
        expectedProfit > calculateMinProfit(gasPrice),
        "Insufficient profit"
    );
    
    // Verificar tiempo bridge
    require(
        bridgeDelay <= MAX_BRIDGE_DELAY,
        "Bridge delay too high"
    );
}
```

2. **Protecciones**:
```solidity
modifier onlyBridge(address bridge) {
    require(
        msg.sender == bridge,
        "Only bridge can call"
    );
    _;
}

modifier withDeadline(uint256 deadline) {
    require(
        block.timestamp <= deadline,
        "Transaction expired"
    );
    _;
}
```

## Optimizaciones

1. **Gas**:
```solidity
// Optimizar almacenamiento
contract OptimizedCrossChain {
    // Empaquetar variables
    struct BridgeParams {
        uint16 destChain;
        uint64 gasLimit;
        uint128 amount;
    }
    
    // Usar slots eficientemente
    mapping(bytes32 => uint256) private packedData;
}
```

2. **Bridge**:
```typescript
function optimizeBridgeParams(
    destChain: number,
    amount: BigNumber
): BridgeParams {
    // Calcular gas óptimo
    const gasLimit = calculateOptimalGas(destChain);
    
    // Calcular slippage dinámico
    const slippage = calculateDynamicSlippage(amount);
    
    return {
        gasLimit,
        slippage,
        relayerFee: calculateRelayerFee(destChain)
    };
}
```

## Mantenimiento

1. **Monitoreo**:
```typescript
async function monitorBridgeHealth() {
    // Verificar estado bridges
    const bridgeStatus = await checkBridgeStatus();
    if (!bridgeStatus.healthy) {
        await pauseOperations();
    }
    
    // Verificar liquidez
    const liquidity = await checkBridgeLiquidity();
    if (liquidity.lt(MIN_LIQUIDITY)) {
        await notifyLowLiquidity();
    }
}
```

2. **Recuperación**:
```solidity
// Recuperar fondos atascados
function rescueTokens(
    address token,
    address recipient,
    uint256 amount
) external onlyOwner {
    IERC20(token).transfer(recipient, amount);
}
```

## Troubleshooting

1. **Errores Comunes**:
   - "Bridge timeout": Retraso en confirmación
   - "Insufficient liquidity": Falta liquidez en bridge
   - "High slippage": Cambio de precio durante bridge

2. **Soluciones**:
```typescript
async function handleBridgeError(error: Error) {
    switch (error.code) {
        case "BRIDGE_TIMEOUT":
            await retryBridgeOperation();
            break;
        case "LOW_LIQUIDITY":
            await switchToBridge(BACKUP_BRIDGE);
            break;
        case "HIGH_SLIPPAGE":
            await adjustSlippageParams();
            break;
    }
}
```

## Referencias

1. [LayerZero Docs](https://layerzero.network/developers)
2. [Stargate Finance Docs](https://stargateprotocol.gitbook.io/stargate/)
3. [Aave V3 Docs](https://docs.aave.com/developers/v/2.0/)
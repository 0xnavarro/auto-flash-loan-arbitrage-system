# Contratos Mock para Testing

## ¿Qué son los Mocks?
Los contratos Mock son versiones simplificadas de contratos reales que simulan su comportamiento en un entorno controlado. En nuestro caso, hemos creado tres tipos de Mocks:

1. `MockToken`: Simula tokens ERC20 (WETH, USDC, USDT)
2. `MockAavePool`: Simula el pool de Aave para flash loans
3. `MockDex`: Simula exchanges descentralizados con precios configurables

## ¿Por qué usar Mocks?
1. **Pruebas Controladas**: Permiten probar la lógica de arbitraje sin depender de redes reales
2. **Rapidez**: Las pruebas son más rápidas al ejecutarse localmente
3. **Costos**: No requieren tokens reales ni gas
4. **Configurabilidad**: Podemos ajustar precios y liquidez fácilmente

## Configuración Actual

### Tokens Mock
- WETH: 18 decimales
- USDC: 6 decimales
- USDT: 6 decimales

### Liquidez Inicial
1. **Aave Pool**:
   - 1,000 WETH
   - 1,000,000 USDC
   - 1,000,000 USDT

2. **DEX A y B**:
   - 100 WETH cada uno
   - 200,000 USDC cada uno
   - 200,000 USDT cada uno

### Configuración de Precios
1. **Par WETH/USDC**:
   - DEX A: 1 ETH = 1800 USDC
   - DEX B: 1 ETH = 1805 USDC
   - Diferencia: 0.28%

2. **Par WETH/USDT**:
   - DEX A: 1 ETH = 1801 USDT
   - DEX B: 1 ETH = 1798 USDT
   - Diferencia: 0.17%

## Cómo Usar los Mocks

### 1. Despliegue
```bash
npx hardhat run scripts/deploy-mocks.ts --network localhost
```

### 2. Interacción con MockToken
```solidity
// Acuñar tokens
await mockToken.mint(address, amount);

// Verificar balance
await mockToken.balanceOf(address);
```

### 3. Interacción con MockAavePool
```solidity
// Ejecutar flash loan
await mockAavePool.flashLoan(
    receiver,
    token,
    amount,
    params
);
```

### 4. Interacción con MockDex
```solidity
// Configurar precio
await mockDex.setPrice(tokenIn, tokenOut, price);

// Obtener precio
await mockDex.getPrice(tokenIn, tokenOut);

// Ejecutar swap
await mockDex.swap(tokenIn, tokenOut, amountIn);
```

## Casos de Uso en Pruebas

### 1. Prueba de Arbitraje Intra-chain
```typescript
// Calcular oportunidad de arbitraje
const [profit, dexAToB] = await intraChainArbitrage.calculateArbitrage(
    weth.address,
    usdc.address,
    amount
);

// Ejecutar arbitraje
await intraChainArbitrage.executeArbitrage(
    weth.address,
    amount,
    usdc.address,
    dexAToB,
    minProfit
);
```

### 2. Prueba de Arbitraje Cross-chain
```typescript
// Ejecutar arbitraje cross-chain
await crossChainArbitrage.executeCrossChainArbitrage(
    weth.address,
    amount,
    usdc.address,
    targetChain,
    srcPoolId,
    dstPoolId
);
```

## Consideraciones Importantes

1. **Precios Realistas**: Los precios configurados simulan diferencias realistas (0.17% - 0.28%)
2. **Liquidez Suficiente**: La liquidez es suficiente para pruebas pero no excesiva
3. **Gas y Comisiones**: Los Mocks no cobran comisiones reales
4. **Decimales**: Respetan los decimales de los tokens reales

## Limitaciones

1. No simulan slippage real
2. No incluyen comisiones de protocolo
3. No replican la complejidad total de los pools de liquidez
4. No simulan latencia de red 
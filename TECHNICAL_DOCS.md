# Documentación Técnica: Sistema de Arbitraje con Flash Loans

## 1. Visión General del Sistema

El sistema está diseñado para realizar arbitraje entre diferentes DEXs (Uniswap V3, Sushiswap V3 y Pancakeswap V3) en la red Arbitrum, utilizando flash loans de Aave V3 para maximizar el beneficio sin requerir capital inicial.

## 2. Componentes Principales

### 2.1 Smart Contract (`FlashLoanArbitrage.sol`)
- Gestiona la lógica de los flash loans
- Ejecuta los swaps entre pools
- Maneja la devolución del préstamo
- Calcula y verifica beneficios

### 2.2 Script de Monitoreo (`monitor-pools.ts`)
- Monitorea precios en tiempo real
- Detecta oportunidades de arbitraje
- Ejecuta flash loans cuando es rentable
- Registra eventos y resultados

### 2.3 Configuración (`arbitrage.config.ts`)
- Define pools y tokens
- Establece parámetros de trading
- Configura límites y slippage

## 3. Proceso de Monitoreo

### 3.1 Inicialización
```typescript
// Conectar al contrato de flash loan
const flashLoanContract = FlashLoanArbitrage__factory.connect(
    network.flashLoanContract,
    signer
);
```

### 3.2 Obtención de Precios
```typescript
async function getPrice(poolAddress: string, baseToken: string, quoteToken: string): Promise<number> {
    // Obtener slot0 de la pool
    const slot0 = await pool.slot0();
    const sqrtPriceX96 = slot0.sqrtPriceX96;
    
    // Convertir precio sqrt a decimal
    const price = (Number(sqrtPriceX96) ** 2) / (2 ** 192);
    
    // Ajustar por decimales
    return price * (10 ** (quoteDecimals - baseDecimals));
}
```

### 3.3 Búsqueda de Oportunidades
1. **Encontrar Pools Compatibles**
   ```typescript
   function findMatchingPools(pools: PoolConfig[]) {
       // Buscar pools que comparten los mismos tokens
       // Retorna pares de pools para comparar
   }
   ```

2. **Calcular Diferencias de Precio**
   ```typescript
   const priceDiff = Math.abs(priceA - priceB);
   const percentageDiff = (priceDiff / Math.min(priceA, priceB)) * 100;
   ```

3. **Evaluar Beneficio Potencial**
   ```typescript
   const potentialProfit = priceDiff * ethAmount;
   if (potentialProfit > 100) {
       // Ejecutar arbitraje
   }
   ```

## 4. Proceso de Arbitraje

### 4.1 Preparación del Flash Loan
1. Determinar dirección del arbitraje (qué pool usar primero)
2. Calcular cantidad óptima para el préstamo
3. Configurar pools en el contrato

### 4.2 Ejecución del Flash Loan
```typescript
const tx = await flashLoanContract.requestFlashLoan(
    tokenIn,
    amountWei,
    tokenOut,
    isPoolAFirst,
    { gasLimit: 3000000 }
);
```

### 4.3 Proceso Interno del Flash Loan
1. **Préstamo Recibido**
   - Aave presta los tokens
   - Se emite evento `FlashLoanReceived`

2. **Primer Swap**
   - Swap en primera pool
   - Se emite evento `SwapStarted` y `SwapCompleted`

3. **Segundo Swap**
   - Swap en segunda pool
   - Se emite evento `SwapStarted` y `SwapCompleted`

4. **Verificación y Repago**
   - Verificar cantidad recibida
   - Repagar préstamo + 0.05% fee
   - Emitir evento `ArbitrageExecuted`

## 5. Consideraciones Técnicas

### 5.1 Gestión de Slippage
- Cada swap tiene un slippage máximo de 0.5%
- Se calcula `minAmountOut` para cada operación
- Se verifica que el beneficio cubra todos los fees

### 5.2 Fees Totales
1. Flash Loan Fee: 0.05%
2. DEX Fees:
   - Uniswap V3: 0.05% o 0.01%
   - Sushiswap V3: 0.05%
   - Pancakeswap V3: 0.01%

### 5.3 Seguridad
1. **Control de Gas**
   - Gas limit explícito: 3,000,000
   - Monitoreo de gas usado

2. **Manejo de Errores**
   - Try-catch en todas las operaciones
   - Esperas entre intentos fallidos
   - Logging detallado

### 5.4 Optimizaciones
1. **Reducción de Latencia**
   - Monitoreo cada 10 segundos
   - 30 segundos de espera tras flash loan

2. **Filtrado de Oportunidades**
   - Solo ejecutar si beneficio > $100
   - Verificar TVL mínimo en pools
   - Comprobar liquidez disponible

## 6. Diagrama de Flujo del Proceso

```
Inicio
  │
  ├─> Monitoreo Continuo
  │     │
  │     ├─> Buscar Pools Compatibles
  │     │
  │     ├─> Obtener Precios
  │     │
  │     └─> Calcular Beneficio
  │
  ├─> Detectar Oportunidad
  │     │
  │     ├─> Verificar Beneficio > $100
  │     │
  │     └─> Comprobar Liquidez
  │
  └─> Ejecutar Flash Loan
        │
        ├─> Préstamo
        │
        ├─> Primer Swap
        │
        ├─> Segundo Swap
        │
        └─> Repago + Beneficio
```

## 7. Mantenimiento y Monitoreo

### 7.1 Logs y Eventos
- Timestamp en cada check
- Precios de cada pool
- Diferencias y beneficios
- Gas usado
- Eventos del contrato

### 7.2 Recuperación de Errores
- Reintentos automáticos
- Esperas progresivas
- Logging de errores 
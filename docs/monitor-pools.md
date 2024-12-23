# Monitor de Pools - Documentación

## Descripción General
El `monitor-pools.ts` es un script diseñado para monitorear oportunidades de arbitraje entre diferentes DEXs (Exchanges Descentralizados) en la red Arbitrum. El script compara los precios de pares de tokens específicos entre diferentes exchanges para identificar diferencias de precio que podrían representar oportunidades de arbitraje.

## Funcionalidad Principal

### 1. Monitoreo de Precios
- Monitorea continuamente los precios de pares de tokens en diferentes DEXs
- Actualiza los precios cada 5 segundos
- Calcula las diferencias de precio entre exchanges
- Evalúa la liquidez disponible en cada pool

### 2. Pares de Tokens Monitoreados
- WBTC/WETH
- WETH/USDC
- WETH/USDT

### 3. DEXs Monitoreados en Arbitrum
- Uniswap V3
- Pancakeswap V3
- Sushiswap V3

## Cálculo de Precios

### Obtención de Precios (getPoolPrice)
El precio en Uniswap V3 se obtiene a través del valor `sqrtPriceX96`, que representa la raíz cuadrada del precio multiplicada por 2^96. El proceso de cálculo varía según el par de tokens:

1. **Para WBTC/WETH:**
   - WBTC tiene 8 decimales
   - WETH tiene 18 decimales
   - Ajuste: multiplicar por 10^10 para compensar la diferencia

2. **Para WETH/USDC y WETH/USDT:**
   - WETH tiene 18 decimales
   - USDC/USDT tienen 6 decimales
   - Ajuste: multiplicar o dividir por 10^12 según el orden de los tokens

### Fórmula de Precio
```
precio = (sqrtPriceX96 * sqrtPriceX96) / (2^192)
```

## Evaluación de Oportunidades

### Criterios de Arbitraje
1. **Diferencia de Precio:**
   - Calcula la diferencia porcentual entre exchanges
   - Considera las comisiones de trading

2. **Liquidez:**
   - Muestra la liquidez disponible por lado en cada pool
   - Ayuda a determinar si hay suficiente liquidez para ejecutar el arbitraje

3. **Comisiones:**
   - Aave: 0.05%
   - Uniswap V3: Variable (0.01% - 0.05%)
   - Pancakeswap V3: Variable (0.01% - 0.05%)
   - Sushiswap V3: Variable (0.01% - 0.05%)

## Valores Esperados

### Precios Actuales (23/12/2023)
- 1 WETH ≈ 3350 USDC/USDT
- 1 WBTC ≈ 28.60 WETH

## Manejo de Errores
- Validación de tokens existentes en la configuración
- Verificación de precios válidos (no NaN, no infinito)
- Logging detallado de errores con stack traces
- Reintentos automáticos cada 5 segundos

## Uso del Script
```bash
npx hardhat run scripts/monitor-pools.ts --network arbitrum
```

## Notas Importantes
- Los precios deben ser monitoreados en tiempo real
- Las oportunidades de arbitraje pueden ser muy breves
- Es crucial considerar los costos de gas en Arbitrum
- La liquidez debe ser suficiente para que el arbitraje sea rentable
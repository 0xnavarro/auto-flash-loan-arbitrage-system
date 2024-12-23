import { request, gql } from 'graphql-request';

// Endpoint de The Graph para Aave v3 en Arbitrum
const AAVE_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum';

// Query para obtener usuarios con posiciones
const GET_USERS_QUERY = gql`
  query GetUsers($first: Int!, $skip: Int!) {
    users(
      first: $first
      skip: $skip
      where: { borrowedReservesCount_gt: 0 }
      orderBy: borrowedReservesCount
      orderDirection: desc
    ) {
      id
      borrowedReservesCount
      collateralReserve: reserves(where: { currentATokenBalance_gt: 0 }) {
        currentATokenBalance
        reserve {
          symbol
          price {
            priceInEth
          }
        }
      }
      borrowReserve: reserves(where: { currentTotalDebt_gt: 0 }) {
        currentTotalDebt
        reserve {
          symbol
          price {
            priceInEth
          }
        }
      }
    }
  }
`;

// Función para calcular el health factor aproximado
function calculateHealthFactor(collateralUSD: number, debtUSD: number, liquidationThreshold = 0.825) {
    if (debtUSD === 0) return Infinity;
    return (collateralUSD * liquidationThreshold) / debtUSD;
}

async function getAllPositions() {
    const positions: any[] = [];
    const batchSize = 1000;
    let skip = 0;
    let hasMore = true;

    console.log('Obteniendo posiciones de Aave...');

    while (hasMore) {
        try {
            const data: any = await request(AAVE_SUBGRAPH, GET_USERS_QUERY, {
                first: batchSize,
                skip: skip
            });

            const users = data.users;
            
            if (users.length < batchSize) {
                hasMore = false;
            }

            // Procesar cada usuario
            for (const user of users) {
                let totalCollateralUSD = 0;
                let totalDebtUSD = 0;

                // Calcular colateral total
                for (const collateral of user.collateralReserve) {
                    const priceInEth = Number(collateral.reserve.price.priceInEth);
                    const balance = Number(collateral.currentATokenBalance);
                    totalCollateralUSD += balance * priceInEth;
                }

                // Calcular deuda total
                for (const debt of user.borrowReserve) {
                    const priceInEth = Number(debt.reserve.price.priceInEth);
                    const debtAmount = Number(debt.currentTotalDebt);
                    totalDebtUSD += debtAmount * priceInEth;
                }

                // Calcular health factor aproximado
                const healthFactor = calculateHealthFactor(totalCollateralUSD, totalDebtUSD);

                // Guardar posiciones en riesgo (HF < 1.1)
                if (healthFactor < 1.1 && healthFactor > 0) {
                    positions.push({
                        address: user.id,
                        collateralUSD: totalCollateralUSD,
                        debtUSD: totalDebtUSD,
                        healthFactor: healthFactor,
                        borrowedReservesCount: user.borrowedReservesCount
                    });

                    console.log(`
                    Posición en riesgo encontrada:
                    Dirección: ${user.id}
                    Colateral: $${totalCollateralUSD.toFixed(2)}
                    Deuda: $${totalDebtUSD.toFixed(2)}
                    Health Factor: ${healthFactor.toFixed(4)}
                    Número de préstamos: ${user.borrowedReservesCount}
                    `);
                }
            }

            skip += users.length;
            console.log(`Procesados ${skip} usuarios...`);

        } catch (error) {
            console.error('Error obteniendo datos:', error);
            hasMore = false;
        }
    }

    return positions;
}

// Función para monitorear continuamente
async function startPositionMonitoring(interval = 60000) { // 1 minuto por defecto
    console.log('Iniciando monitoreo de posiciones...');
    
    setInterval(async () => {
        try {
            const riskyPositions = await getAllPositions();
            console.log(`
            ====== Resumen de Monitoreo ======
            Posiciones en riesgo encontradas: ${riskyPositions.length}
            Timestamp: ${new Date().toISOString()}
            ================================
            `);
        } catch (error) {
            console.error('Error en el monitoreo:', error);
        }
    }, interval);
}

// Ejecutar el monitoreo
async function main() {
    // Obtener posiciones una vez
    const positions = await getAllPositions();
    console.log(`Total de posiciones en riesgo encontradas: ${positions.length}`);

    // Iniciar monitoreo continuo
    await startPositionMonitoring();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}); 
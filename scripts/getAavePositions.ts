import { request } from 'graphql-request';
import * as dotenv from 'dotenv';

dotenv.config();

// Endpoint de The Graph para Aave v3 en Arbitrum
const AAVE_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum';

// Query para obtener usuarios con posiciones en riesgo
const GET_RISKY_POSITIONS = `
  query GetRiskyPositions($healthFactor: BigDecimal!, $minDebt: BigInt!) {
    users(
      where: {
        borrowedReservesCount_gt: 0,
        totalDebtBase_gt: $minDebt
      }
      first: 1000
      orderBy: totalDebtBase
      orderDirection: desc
    ) {
      id
      totalCollateralBase
      totalDebtBase
      healthFactor
      borrowedReservesCount
      reserves(where: { currentATokenBalance_gt: 0 }) {
        reserve {
          symbol
          underlyingAsset
        }
        currentATokenBalance
        currentVariableDebt
        currentStableDebt
      }
    }
  }
`;

interface Reserve {
  reserve: {
    symbol: string;
    underlyingAsset: string;
  };
  currentATokenBalance: string;
  currentVariableDebt: string;
  currentStableDebt: string;
}

interface User {
  id: string;
  totalCollateralBase: string;
  totalDebtBase: string;
  healthFactor: string;
  borrowedReservesCount: number;
  reserves: Reserve[];
}

interface SubgraphResponse {
  users: User[];
}

async function getRiskyPositions() {
  try {
    console.log('Buscando posiciones en riesgo...');

    const variables = {
      healthFactor: '1.1', // Buscar posiciones con HF < 1.1
      minDebt: '1000000000000000000' // Mínimo 1 ETH en deuda (o equivalente)
    };

    const data = await request<SubgraphResponse>(
      AAVE_SUBGRAPH,
      GET_RISKY_POSITIONS,
      variables
    );

    console.log(`Encontradas ${data.users.length} posiciones en riesgo`);

    for (const user of data.users) {
      const healthFactor = parseFloat(user.healthFactor);
      const totalCollateralUSD = parseFloat(user.totalCollateralBase) / 1e8; // Aave usa 8 decimales para USD
      const totalDebtUSD = parseFloat(user.totalDebtBase) / 1e8;

      console.log(`
      =====================================
      Usuario: ${user.id}
      Health Factor: ${healthFactor.toFixed(4)}
      Colateral Total: $${totalCollateralUSD.toLocaleString()}
      Deuda Total: $${totalDebtUSD.toLocaleString()}
      Número de préstamos: ${user.borrowedReservesCount}
      
      Posiciones:
      ${user.reserves.map(reserve => `
        Token: ${reserve.reserve.symbol}
        Balance: ${(parseFloat(reserve.currentATokenBalance) / 1e18).toFixed(4)}
        Deuda Variable: ${(parseFloat(reserve.currentVariableDebt) / 1e18).toFixed(4)}
        Deuda Estable: ${(parseFloat(reserve.currentStableDebt) / 1e18).toFixed(4)}
      `).join('\n')}
      =====================================
      `);
    }

    return data.users;
  } catch (error) {
    console.error('Error obteniendo posiciones:', error);
    return [];
  }
}

async function startMonitoring(interval = 60000) {
  console.log('Iniciando monitoreo de posiciones en riesgo...');
  
  // Primera ejecución inmediata
  await getRiskyPositions();
  
  // Monitoreo continuo
  setInterval(async () => {
    console.log('\nActualizando datos...');
    await getRiskyPositions();
  }, interval);
}

async function main() {
  await startMonitoring();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 
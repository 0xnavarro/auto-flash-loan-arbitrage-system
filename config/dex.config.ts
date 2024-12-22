interface DexConfig {
    name: string;
    router: string;
    factory: string;
    chain: string;
    type: string;
}

interface ChainConfig {
    name: string;
    rpc: string;
    chainId: number;
    aavePool: string;
    nativeCurrency: string;
}

export const SUPPORTED_CHAINS: ChainConfig[] = [
    {
        name: "Arbitrum",
        rpc: "https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}",
        chainId: 42161,
        aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        nativeCurrency: "ETH"
    },
    {
        name: "Base",
        rpc: "https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}",
        chainId: 8453,
        aavePool: "0x0000000000000000000000000000000000000000", // Base aún no tiene Aave
        nativeCurrency: "ETH"
    }
];

export const DEX_CONFIGS: { [chain: string]: DexConfig[] } = {
    "Arbitrum": [
        {
            name: "Camelot",
            router: "0xc873fEcbd354f5A56E00E710B90EF4201db2448d",
            factory: "0x6EcCab422D763aC031210895C81787E87B43A652",
            chain: "Arbitrum",
            type: "UniswapV2"
        },
        {
            name: "Sushiswap",
            router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
            factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
            chain: "Arbitrum",
            type: "UniswapV2"
        },
        {
            name: "Zyberswap",
            router: "0x16e71B13fE6079B4312063F7E81F76d165Ad32Ad",
            factory: "0xaC2ee06A14c52570Ef3B9812Ed240BCe359772e7",
            chain: "Arbitrum",
            type: "UniswapV2"
        },
        {
            name: "Arbidex",
            router: "0x7238FB45146A2CA55d8F8f03B4a3f7CfB923b21B",
            factory: "0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c",
            chain: "Arbitrum",
            type: "UniswapV2"
        }
    ],
    "Base": [
        {
            name: "BaseSwap",
            router: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
            factory: "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB",
            chain: "Base",
            type: "UniswapV2"
        },
        {
            name: "SwapBased",
            router: "0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7",
            factory: "0x38015D05f4fEC8AFe15D7cc0386a126574e8077B",
            chain: "Base",
            type: "UniswapV2"
        },
        {
            name: "RocketSwap",
            router: "0x4cf76043B3f97ba06917cBd90F9e3A2AAC1B306e",
            factory: "0x1B7A0Eb46D5D7BF9923767F8EF14F4431C8b4400",
            chain: "Base",
            type: "UniswapV2"
        }
    ]
};

// Tokens principales en cada red
export const MAJOR_TOKENS = {
    "Arbitrum": {
        WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1"
    },
    "Base": {
        WETH: "0x4200000000000000000000000000000000000006",
        USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
        DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"
    }
}; 
import { type BigNumberish } from "ethers";

export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  minTradeAmount: string;  // en tokens
  maxTradeAmount: string;  // en tokens
  gasLimit: number;
}

export interface PoolConfig {
  address: string;
  dex: string;
  fee: number;
  token0: string;
  token1: string;
  minLiquidity: string;  // en USD
  maxSlippage: number;   // en porcentaje
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  flashLoanContract: string;
  tokens: { [symbol: string]: TokenConfig };
  pools: PoolConfig[];
}

export const ARBITRUM_CONFIG: NetworkConfig = {
  name: "arbitrum",
  chainId: 42161,
  flashLoanContract: "0x7fca7C822b78329c92F1d115479027a17a023d14",
  tokens: {
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      symbol: "WETH",
      decimals: 18,
      minTradeAmount: "0.1",
      maxTradeAmount: "10",
      gasLimit: 300000
    },
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      symbol: "USDC",
      decimals: 6,
      minTradeAmount: "100",
      maxTradeAmount: "50000",
      gasLimit: 300000
    },
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      symbol: "USDT",
      decimals: 6,
      minTradeAmount: "100",
      maxTradeAmount: "50000",
      gasLimit: 300000
    },
    WBTC: {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      symbol: "WBTC",
      decimals: 8,
      minTradeAmount: "0.001",
      maxTradeAmount: "1",
      gasLimit: 300000
    }
  },
  pools: [
    // Uniswap V3 Pools
    {
      address: "0xC6962004f452bE9203591991D15f6b388e09E8D0",
      dex: "Uniswap V3",
      fee: 500, // 0.05%
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      minLiquidity: "54000000", // $54M
      maxSlippage: 0.5
    },
    {
      address: "0x42161084d0672e1d3F26a9B53E653bE2084ff19C",
      dex: "Uniswap V3",
      fee: 100, // 0.01%
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      token1: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
      minLiquidity: "600000", // $0.6M
      maxSlippage: 0.5
    },
    {
      address: "0x2f5e87C9312fa29aed5c179E456625D79015299c",
      dex: "Uniswap V3",
      fee: 500, // 0.05%
      token0: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", // WBTC
      token1: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      minLiquidity: "50000000", // $50M
      maxSlippage: 0.5
    },
    // Sushiswap V3 Pools
    {
      address: "0xf3Eb87C1F6020982173C908E7eB31aA66c1f0296",
      dex: "Sushiswap V3",
      fee: 500, // 0.05%
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      minLiquidity: "6700000", // $6.7M
      maxSlippage: 0.5
    },
    // Pancakeswap V3 Pools
    {
      address: "0x7fCDC35463E3770c2fB992716Cd070B63540b947",
      dex: "Pancakeswap V3",
      fee: 100, // 0.01%
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      minLiquidity: "1500000", // $1.5M
      maxSlippage: 0.5
    },
    {
      address: "0x389938CF14Be379217570D8e4619E51fBDafaa21",
      dex: "Pancakeswap V3",
      fee: 100, // 0.01%
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      token1: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
      minLiquidity: "1400000", // $1.4M
      maxSlippage: 0.5
    },
    {
      address: "0x4bfc22A4dA7f31F8a912a79A7e44a822398b4390",
      dex: "Pancakeswap V3",
      fee: 100, // 0.01%
      token0: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", // WBTC
      token1: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      minLiquidity: "800000", // $0.8M
      maxSlippage: 0.5
    }
  ]
};

export const BASE_CONFIG: NetworkConfig = {
  name: "base",
  chainId: 8453,
  flashLoanContract: "0x220437cACADBD8A182AcAaff1B0181aC10818aE0",
  tokens: {
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      minTradeAmount: "0.1",
      maxTradeAmount: "5",
      gasLimit: 300000
    },
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      minTradeAmount: "100",
      maxTradeAmount: "25000",
      gasLimit: 300000
    }
  },
  pools: [
    {
      address: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
      dex: "Uniswap V3",
      fee: 500,
      token0: "0x4200000000000000000000000000000000000006", // WETH
      token1: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      minLiquidity: "500000",
      maxSlippage: 0.5
    }
  ]
}; 
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
  dex: string;
  address: string;
  token0: string;
  token1: string;
  fee: number;
  maxSlippage: number;
  tvl: number;
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  flashLoanContract: string;
  tokens: { [symbol: string]: TokenConfig };
  pools: PoolConfig[];
}

export const ARBITRUM_CONFIG: NetworkConfig = {
  name: "Arbitrum",
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
    {
      dex: "Uniswap V3",
      address: "0xC6962004f452bE9203591991D15f6b388e09E8D0",
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      fee: 500,
      maxSlippage: 1,
      tvl: 54
    },
    {
      dex: "Uniswap V3",
      address: "0x42161084d0672e1d3F26a9B53E653bE2084ff19C",
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      token1: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      fee: 100,
      maxSlippage: 1,
      tvl: 0.6
    },
    {
      dex: "Uniswap V3",
      address: "0x2f5e87C9312fa29aed5c179E456625D79015299c",
      token0: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      token1: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      fee: 500,
      maxSlippage: 1,
      tvl: 50
    },
    {
      dex: "Sushiswap V3",
      address: "0xf3Eb87C1F6020982173C908E7eB31aA66c1f0296",
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      fee: 500,
      maxSlippage: 1,
      tvl: 6.7
    },
    {
      dex: "Pancakeswap V3",
      address: "0x7fCDC35463E3770c2fB992716Cd070B63540b947",
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      fee: 100,
      maxSlippage: 1,
      tvl: 1.5
    },
    {
      dex: "Pancakeswap V3",
      address: "0x389938CF14Be379217570D8e4619E51fBDafaa21",
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      token1: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      fee: 100,
      maxSlippage: 1,
      tvl: 1.4
    },
    {
      dex: "Pancakeswap V3",
      address: "0x4bfc22A4dA7f31F8a912a79A7e44a822398b4390",
      token0: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      token1: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      fee: 100,
      maxSlippage: 1,
      tvl: 0.8
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
      token0: "0x4200000000000000000000000000000000000006",
      token1: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      maxSlippage: 0.5,
      tvl: 13.6
    }
  ]
}; 
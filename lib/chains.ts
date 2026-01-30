import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  celo,
  linea,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  redstone,
  sepolia,
  zora,
} from 'viem/chains';
import type { Chain } from 'viem/chains';

type ChainOption = {
  id: number;
  name: string;
  chain: Chain;
  usdcAddress?: string | null;
};

export const CHAIN_OPTIONS: ChainOption[] = [
  { id: arbitrum.id, name: 'Arbitrum', chain: arbitrum, usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  { id: arbitrumSepolia.id, name: 'Arbitrum Sepolia', chain: arbitrumSepolia, usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' },
  { id: avalanche.id, name: 'Avalanche C-Chain', chain: avalanche, usdcAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
  { id: avalancheFuji.id, name: 'Avalanche Fuji', chain: avalancheFuji, usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65' },
  { id: base.id, name: 'Base', chain: base, usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  { id: baseSepolia.id, name: 'Base Sepolia', chain: baseSepolia, usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
  { id: celo.id, name: 'Celo', chain: celo, usdcAddress: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' },
  { id: mainnet.id, name: 'Ethereum', chain: mainnet, usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { id: sepolia.id, name: 'Ethereum Sepolia', chain: sepolia, usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
  { id: linea.id, name: 'Linea', chain: linea, usdcAddress: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff' },
  { id: optimism.id, name: 'Optimism', chain: optimism, usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
  { id: optimismSepolia.id, name: 'Optimism Sepolia', chain: optimismSepolia, usdcAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' },
  { id: polygon.id, name: 'Polygon', chain: polygon, usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  { id: polygonAmoy.id, name: 'Polygon Amoy', chain: polygonAmoy, usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582' },
  { id: redstone.id, name: 'Redstone', chain: redstone, usdcAddress: '0xf171275c6fA7E4A7cd23750a8EAa5c25BfEaCC87' },
  { id: zora.id, name: 'Zora', chain: zora, usdcAddress: '0xC97B7d63Ed2F6a9Cd1163F6CB7702D73792486F0' },
];

export const SUPPORTED_CHAINS: Chain[] = CHAIN_OPTIONS.map((option) => option.chain);

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Ethereal Mint',
  projectId: 'c6d7bff4e4fa4bb98b1dc8c1d3e4f5aa',
  chains: [sepolia],
  ssr: false,
});

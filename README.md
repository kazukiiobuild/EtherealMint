# EtherealMint

EtherealMint is a privacy-first NFT minting dApp built on Zama FHEVM. It lets users create NFTs with a name and supply
while storing a confidential "realOwner" address encrypted on-chain. The UI lists all created NFTs and allows anyone to
mint, while only the contract owner can decrypt realOwner or grant decryption rights to other addresses.

## Project goals and problems solved

- Provide public NFT minting while keeping the real owner identity private.
- Separate public ownership from encrypted realOwner data to reduce leakage and improve user privacy.
- Use fully homomorphic encryption (FHE) so ownership metadata stays encrypted on-chain and only authorized readers can
  decrypt it.
- Offer a complete end-to-end flow: create NFT, display listings, mint, manage decrypt permissions.

## Key capabilities

- Create NFTs with name and supply from the UI.
- Encrypt realOwner using Zama FHEVM primitives and store it on-chain.
- Show all created NFTs to any user and allow minting.
- Allow only the contract owner to decrypt realOwner.
- Allow the owner to grant decryption rights to other addresses.

## Advantages

- Privacy by default: sensitive ownership metadata is never stored in plaintext.
- Clear permission boundaries: only the owner can decrypt or share decrypt access.
- Audit-friendly: public minting and supply are transparent while sensitive data remains hidden.
- Clean contract-UI split: reads use viem, writes use ethers to keep wallet signing explicit.
- Predictable UI: no local storage, no localhost network usage, and no frontend environment variables.

## Technology

- Smart contracts: Solidity on Hardhat.
- Privacy layer: Zama FHEVM with encrypted address handling.
- Frontend: React + Vite + viem + ethers + RainbowKit (no Tailwind).
- Package manager: npm.

## Repository layout

- `contracts/` smart contracts.
- `deploy/` deployment scripts.
- `tasks/` Hardhat tasks.
- `test/` automated tests.
- `deployments/` deployment artifacts; Sepolia ABI source of truth.
- `ui/` frontend application (React + Vite).

## Core flows

1. A user creates an NFT with name and supply.
2. The contract encrypts and stores realOwner.
3. The UI lists every created NFT and allows minting.
4. The contract owner can decrypt realOwner.
5. The owner can grant decrypt access to other addresses.

## Prerequisites

- Node.js 20 or later.
- npm.
- A funded Sepolia account for deployment.
- An Infura API key.

## Install dependencies

```bash
npm install
```

## Environment setup (Hardhat only)

Create a `.env` file in the repo root with the following values:

```
INFURA_API_KEY=your_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=optional_key
```

- Deployment uses `PRIVATE_KEY` only. Do not use a mnemonic.
- `hardhat.config.ts` loads environment variables via dotenv.

## Compile and test

```bash
npm run compile
npm run test
```

## Local contract development

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

Use local deployment only for contract development and tests. The frontend connects to Sepolia only.

## Deploy to Sepolia

Before deploying, run tasks and tests to validate the contracts:

```bash
npm run test
npx hardhat deploy --network sepolia
```

Optional verification:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Frontend notes (ui/)

- The ABI used by the UI must be copied from `deployments/sepolia` after deployment.
- Do not import JSON files into the UI; paste the ABI into a TypeScript constant instead.
- Reads use viem. Writes use ethers.
- No Tailwind, no local storage, no localhost network, and no frontend environment variables.

To run the UI:

```bash
cd ui
npm install
npm run dev
```

Ensure the UI points to the Sepolia contract address and ABI copied from deployments.

## Security and privacy model

- realOwner is encrypted and stored on-chain using Zama FHE.
- Only the contract owner can decrypt by default.
- The owner can grant decryption rights to other addresses.
- Public metadata (name, supply, and minting) remains transparent for users.

## Limitations

- FHE operations are more expensive than plaintext operations.
- Decryption requires explicit permission; unauthorized users see only ciphertext.
- UI relies on Sepolia deployment for on-chain reads and writes.

## Future roadmap

- Batch minting and gas optimizations for large supplies.
- Granular permission management for multiple decryptors.
- Metadata extensions (traits, external references) without compromising privacy.
- Multi-chain support with consistent encrypted ownership semantics.
- More advanced analytics that operate on encrypted data.

## License

This project is licensed under the BSD-3-Clause-Clear License. See `LICENSE`.

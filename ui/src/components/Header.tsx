import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <div>
          <p className="tag">Ethereal Mint</p>
          <h2>Encrypted NFT studio</h2>
        </div>
        <div className="network-pill">Sepolia · Zama relayer</div>
      </div>
      <ConnectButton />
    </header>
  );
}

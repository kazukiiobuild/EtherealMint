import { useEffect, useMemo, useState } from 'react';
import { Contract, isAddress } from 'ethers';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ABI, DEFAULT_CONTRACT_ADDRESS } from '../config/contracts';
import { Header } from './Header';
import '../styles/MintApp.css';

type CollectionView = {
  id: number;
  name: string;
  maxSupply: bigint;
  minted: bigint;
  creator: `0x${string}`;
  defaultRealOwner: string;
  exists: boolean;
};

type TokenView = {
  tokenId: bigint;
  collectionId: bigint;
  owner: `0x${string}`;
  realOwner: string;
};

const shorten = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

export function MintApp() {
  const { address: walletAddress } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [contractAddress, setContractAddress] = useState<string>(DEFAULT_CONTRACT_ADDRESS);
  const [contractDraft, setContractDraft] = useState<string>(DEFAULT_CONTRACT_ADDRESS);
  const [newCollection, setNewCollection] = useState({ name: '', supply: '', realOwner: '' });
  const [mintTargets, setMintTargets] = useState<Record<number, string>>({});
  const [updateTargets, setUpdateTargets] = useState<Record<number, string>>({});
  const [shareTargets, setShareTargets] = useState<Record<number, string>>({});
  const [decryptedRealOwners, setDecryptedRealOwners] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState<string>('');

  const hasContract = contractAddress.length === 42 && contractAddress.startsWith('0x');

  const { data: collectionCount } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'collectionCount',
    query: { enabled: hasContract },
  });

  const { data: totalMinted } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'totalMinted',
    query: { enabled: hasContract },
  });

  const {
    data: collectionsData,
    refetch: refetchCollections,
    isFetching: fetchingCollections,
  } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getCollections',
    query: { enabled: hasContract },
  });

  const { data: ownedTokenIds, refetch: refetchOwnedTokens } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'tokensOfOwner',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: hasContract && !!walletAddress },
  });

  const tokenContracts = useMemo(
    () =>
      ownedTokenIds
        ? (ownedTokenIds as bigint[]).map((tokenId) => ({
            address: contractAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'getToken',
            args: [tokenId],
          }))
        : [],
    [ownedTokenIds, contractAddress],
  );

  const { data: tokenDetails, refetch: refetchTokenDetails } = useReadContracts({
    contracts: tokenContracts,
    query: { enabled: hasContract && tokenContracts.length > 0 },
  });

  const collections: CollectionView[] = useMemo(() => {
    if (!collectionsData) return [];
    return (collectionsData as any[])
      .map((item: any, idx: number) => ({
        id: idx + 1,
        name: item.name ?? item[0],
        maxSupply: BigInt(item.maxSupply ?? item[1]),
        minted: BigInt(item.minted ?? item[2]),
        creator: (item.creator ?? item[3]) as `0x${string}`,
        defaultRealOwner: (item.defaultRealOwner ?? item[4]) as string,
        exists: Boolean(item.exists ?? item[5]),
      }))
      .filter((item) => item.exists);
  }, [collectionsData]);

  const ownedTokens: TokenView[] = useMemo(() => {
    if (!tokenDetails) return [];

    return tokenDetails
      .map((entry: any) => {
        const raw = entry?.result ?? entry;
        if (!raw) return null;
        const tokenId = raw.tokenId ?? raw[0];
        const collectionId = raw.collectionId ?? raw[1];
        const owner = raw.owner ?? raw[2];
        const realOwner = raw.realOwner ?? raw[3];
        return {
          tokenId: BigInt(tokenId),
          collectionId: BigInt(collectionId),
          owner: owner as `0x${string}`,
          realOwner: realOwner as string,
        };
      })
      .filter(Boolean) as TokenView[];
  }, [tokenDetails]);

  useEffect(() => {
    if (collections.length === 0) {
      setMintTargets({});
    }
  }, [collections]);

  const refreshReads = async () => {
    await Promise.allSettled([refetchCollections(), refetchOwnedTokens(), refetchTokenDetails()]);
  };

  const applyContract = () => {
    if (!contractDraft || !isAddress(contractDraft)) {
      setStatus('Enter a valid deployed contract address (Sepolia).');
      return;
    }
    setContractAddress(contractDraft);
    setStatus('Contract ready. Data will refresh automatically.');
  };

  const encryptAddress = async (target: string, signerAddress: string) => {
    if (!instance) {
      throw new Error('Zama relayer not ready yet.');
    }
    if (!hasContract) {
      throw new Error('Set the contract address first.');
    }
    const input = instance.createEncryptedInput(contractAddress, signerAddress);
    input.addAddress(target);
    return input.encrypt();
  };

  const handleCreateCollection = async () => {
    if (!hasContract) {
      setStatus('Add the deployed contract address first.');
      return;
    }
    if (!signerPromise) {
      setStatus('Connect your wallet to create a collection.');
      return;
    }
    if (!newCollection.name || !newCollection.supply || !isAddress(newCollection.realOwner)) {
      setStatus('Fill name, supply, and a valid real owner address.');
      return;
    }
    try {
      setBusy('create');
      const signer = await signerPromise;
      const encrypted = await encryptAddress(newCollection.realOwner, signer.address);
      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.createCollection(
        newCollection.name,
        BigInt(newCollection.supply),
        encrypted.handles[0],
        encrypted.inputProof,
      );
      await tx.wait();
      setStatus('Collection created. It will show below once indexed on-chain.');
      setNewCollection({ name: '', supply: '', realOwner: '' });
      await refreshReads();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create collection';
      setStatus(message);
    } finally {
      setBusy('');
    }
  };

  const handleMint = async (collectionId: number) => {
    const target = mintTargets[collectionId] || walletAddress || '';
    if (!hasContract) {
      setStatus('Add the deployed contract address first.');
      return;
    }
    if (!signerPromise) {
      setStatus('Connect your wallet to mint.');
      return;
    }
    if (!isAddress(target)) {
      setStatus('Enter a valid address to encrypt as the real owner.');
      return;
    }
    try {
      setBusy(`mint-${collectionId}`);
      const signer = await signerPromise;
      const encrypted = await encryptAddress(target, signer.address);
      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.mint(collectionId, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setStatus(`Minted token in collection #${collectionId}.`);
      await refreshReads();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mint failed';
      setStatus(message);
    } finally {
      setBusy('');
    }
  };

  const handleUpdateRealOwner = async (tokenId: number) => {
    const target = updateTargets[tokenId] || '';
    if (!signerPromise) {
      setStatus('Connect your wallet to update encrypted owner.');
      return;
    }
    if (!isAddress(target)) {
      setStatus('Enter a valid address to encrypt.');
      return;
    }
    try {
      setBusy(`update-${tokenId}`);
      const signer = await signerPromise;
      const encrypted = await encryptAddress(target, signer.address);
      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.updateRealOwner(tokenId, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setStatus(`Updated encrypted real owner for token #${tokenId}.`);
      await refreshReads();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      setStatus(message);
    } finally {
      setBusy('');
    }
  };

  const handleShareAccess = async (tokenId: number) => {
    const target = shareTargets[tokenId] || '';
    if (!signerPromise) {
      setStatus('Connect your wallet to share decryption access.');
      return;
    }
    if (!isAddress(target)) {
      setStatus('Enter a valid address to share with.');
      return;
    }
    try {
      setBusy(`share-${tokenId}`);
      const signer = await signerPromise;
      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.allowRealOwnerAccess(tokenId, target);
      await tx.wait();
      setStatus(`Decryption access granted for token #${tokenId}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Share access failed';
      setStatus(message);
    } finally {
      setBusy('');
    }
  };

  const handleDecrypt = async (token: TokenView) => {
    if (!instance) {
      setStatus('Zama relayer not ready.');
      return;
    }
    if (!signerPromise) {
      setStatus('Connect your wallet to decrypt.');
      return;
    }
    try {
      setBusy(`decrypt-${token.tokenId.toString()}`);
      const keypair = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [contractAddress];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimestamp, durationDays);
      const signer = await signerPromise;
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        [
          {
            handle: token.realOwner,
            contractAddress,
          },
        ],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        signer.address,
        startTimestamp,
        durationDays,
      );
      const value = result[token.realOwner];
      if (value) {
        setDecryptedRealOwners((prev) => ({
          ...prev,
          [Number(token.tokenId)]: value,
        }));
        setStatus(`Decryption completed for token #${token.tokenId.toString()}.`);
      } else {
        setStatus('Unable to decrypt value. Ensure ACL includes your address.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Decrypt failed';
      setStatus(message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mint-app">
      <Header />
      <section className="intro">
        <div>
          <p className="eyebrow">Ethereal Mint · Zama FHE</p>
          <h1>Mint NFTs with encrypted provenance</h1>
          <p className="lede">
            Create collections, encrypt the real owner with Zama relayer, and selectively share decryption access without
            exposing on-chain secrets.
          </p>
          <div className="contract-input">
            <input
              value={contractDraft}
              onChange={(e) => setContractDraft(e.target.value)}
              placeholder="Sepolia EtherealMint contract address"
            />
            <button onClick={applyContract}>Set contract</button>
          </div>
          {status ? <div className="status">{status}</div> : null}
          {zamaError ? <div className="status warning">{zamaError}</div> : null}
        </div>
        <div className="hero-card">
          <p className="eyebrow">Network snapshot</p>
          <div className="hero-stats">
            <div>
              <span>Collections</span>
              <strong>{collectionCount ? collectionCount.toString() : '-'}</strong>
            </div>
            <div>
              <span>Total minted</span>
              <strong>{totalMinted ? totalMinted.toString() : '-'}</strong>
            </div>
            <div>
              <span>Your tokens</span>
              <strong>{ownedTokenIds ? (ownedTokenIds as bigint[]).length : 0}</strong>
            </div>
          </div>
          <div className="pill">
            {hasContract ? 'Contract configured' : 'Set contract address to begin'}
            {zamaLoading ? ' · Loading Zama relayer' : ''}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Encrypted launchpad</p>
              <h3>Create a collection</h3>
            </div>
            <span className="pill subtle">Owner encrypts address</span>
          </div>
          <div className="form">
            <label>
              Name
              <input
                value={newCollection.name}
                onChange={(e) => setNewCollection((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Aurora Pass"
              />
            </label>
            <label>
              Max supply
              <input
                type="number"
                min="1"
                value={newCollection.supply}
                onChange={(e) => setNewCollection((prev) => ({ ...prev, supply: e.target.value }))}
                placeholder="100"
              />
            </label>
            <label>
              Real owner address (encrypted)
              <input
                value={newCollection.realOwner}
                onChange={(e) => setNewCollection((prev) => ({ ...prev, realOwner: e.target.value }))}
                placeholder="0x..."
              />
            </label>
            <button onClick={handleCreateCollection} disabled={busy === 'create' || zamaLoading}>
              {busy === 'create' ? 'Creating...' : 'Create collection'}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Your encrypted NFTs</p>
              <h3>Manage ownership</h3>
            </div>
            <span className="pill subtle">Owner-only controls</span>
          </div>
          {walletAddress ? (
            <div className="token-list">
              {ownedTokens.length === 0 ? (
                <p className="muted">Mint a token to see it here.</p>
              ) : (
                ownedTokens.map((token) => {
                  const tokenId = Number(token.tokenId);
                  const decrypted = decryptedRealOwners[tokenId];
                  return (
                    <div className="token-card" key={tokenId}>
                      <div className="token-meta">
                        <div>
                          <p className="eyebrow">Token #{token.tokenId.toString()}</p>
                          <strong>Collection #{token.collectionId.toString()}</strong>
                        </div>
                        <span className="pill subtle">{shorten(token.owner)}</span>
                      </div>
                      <div className="token-actions">
                        <button
                          onClick={() => handleDecrypt(token)}
                          disabled={busy === `decrypt-${tokenId}` || zamaLoading}
                        >
                          {busy === `decrypt-${tokenId}` ? 'Decrypting...' : 'Decrypt real owner'}
                        </button>
                        {decrypted ? <span className="pill success">{shorten(decrypted)}</span> : null}
                      </div>
                      <div className="inline-form">
                        <label>
                          New encrypted owner
                          <input
                            value={updateTargets[tokenId] || ''}
                            onChange={(e) =>
                              setUpdateTargets((prev) => ({ ...prev, [tokenId]: e.target.value }))
                            }
                            placeholder="0x..."
                          />
                        </label>
                        <button
                          onClick={() => handleUpdateRealOwner(tokenId)}
                          disabled={busy === `update-${tokenId}` || zamaLoading}
                        >
                          {busy === `update-${tokenId}` ? 'Updating...' : 'Update'}
                        </button>
                      </div>
                      <div className="inline-form">
                        <label>
                          Share decryption with
                          <input
                            value={shareTargets[tokenId] || ''}
                            onChange={(e) =>
                              setShareTargets((prev) => ({ ...prev, [tokenId]: e.target.value }))
                            }
                            placeholder="0x..."
                          />
                        </label>
                        <button
                          onClick={() => handleShareAccess(tokenId)}
                          disabled={busy === `share-${tokenId}` || zamaLoading}
                        >
                          {busy === `share-${tokenId}` ? 'Sharing...' : 'Allow access'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <p className="muted">Connect your wallet to see encrypted tokens you own.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live collections</p>
            <h3>Mint from any creator</h3>
          </div>
          <span className="pill subtle">
            {fetchingCollections ? 'Refreshing collections...' : `${collections.length} active`}
          </span>
        </div>
        {collections.length === 0 ? (
          <p className="muted">No collections yet. Create one to get started.</p>
        ) : (
          <div className="collection-grid">
            {collections.map((collection) => {
              const id = collection.id;
              const remaining = Number(collection.maxSupply - collection.minted);
              return (
                <div className="collection-card" key={id}>
                  <div className="collection-top">
                    <div>
                      <p className="eyebrow">#{id}</p>
                      <h4>{collection.name}</h4>
                    </div>
                    <span className="pill subtle">{shorten(collection.creator)}</span>
                  </div>
                  <p className="muted">
                    {collection.minted.toString()} / {collection.maxSupply.toString()} minted
                  </p>
                  <div className="mint-row">
                    <input
                      value={mintTargets[id] || walletAddress || ''}
                      onChange={(e) => setMintTargets((prev) => ({ ...prev, [id]: e.target.value }))}
                      placeholder="Encrypt owner address"
                    />
                    <button
                      onClick={() => handleMint(id)}
                      disabled={busy === `mint-${id}` || zamaLoading || remaining === 0}
                    >
                      {remaining === 0 ? 'Sold out' : busy === `mint-${id}` ? 'Minting...' : 'Mint'}
                    </button>
                  </div>
                  <div className="footnote">
                    Default encrypted owner handle: <code>{collection.defaultRealOwner.slice(0, 18)}...</code>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

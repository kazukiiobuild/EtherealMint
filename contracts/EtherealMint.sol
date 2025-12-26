// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title EtherealMint
/// @notice FHE-enabled NFT minter with encrypted real owner tracking.
contract EtherealMint is ZamaEthereumConfig {
    struct Collection {
        string name;
        uint256 maxSupply;
        uint256 minted;
        address creator;
        eaddress defaultRealOwner;
        bool exists;
    }

    struct TokenView {
        uint256 tokenId;
        uint256 collectionId;
        address owner;
        eaddress realOwner;
    }

    uint256 private _nextCollectionId = 1;
    uint256 private _nextTokenId = 1;

    mapping(uint256 => Collection) private _collections;
    mapping(uint256 => TokenView) private _tokens;
    mapping(address => uint256[]) private _ownedTokens;
    mapping(uint256 => uint256[]) private _collectionTokens;

    event CollectionCreated(
        uint256 indexed collectionId,
        address indexed creator,
        string name,
        uint256 maxSupply,
        eaddress defaultRealOwner
    );
    event TokenMinted(uint256 indexed tokenId, uint256 indexed collectionId, address indexed owner);
    event RealOwnerUpdated(uint256 indexed tokenId, eaddress newRealOwner);
    event RealOwnerAccessGranted(uint256 indexed tokenId, address indexed grantee);

    /// @notice Create a new NFT collection.
    /// @param name Collection display name.
    /// @param maxSupply Maximum mintable tokens for the collection.
    /// @param realOwnerInput Encrypted address representing the underlying real owner.
    /// @param inputProof Zama proof for the encrypted address.
    function createCollection(
        string memory name,
        uint256 maxSupply,
        externalEaddress realOwnerInput,
        bytes calldata inputProof
    ) external returns (uint256) {
        require(maxSupply > 0, "Max supply must be greater than zero");

        uint256 collectionId = _nextCollectionId++;
        eaddress encryptedOwner = FHE.fromExternal(realOwnerInput, inputProof);

        Collection storage created = _collections[collectionId];
        created.name = name;
        created.maxSupply = maxSupply;
        created.minted = 0;
        created.creator = msg.sender;
        created.defaultRealOwner = encryptedOwner;
        created.exists = true;

        FHE.allowThis(encryptedOwner);
        FHE.allow(encryptedOwner, msg.sender);

        emit CollectionCreated(collectionId, msg.sender, name, maxSupply, encryptedOwner);
        return collectionId;
    }

    /// @notice Mint a new NFT within a collection.
    /// @param collectionId Target collection id.
    /// @param realOwnerInput Encrypted address value for the token's real owner field.
    /// @param inputProof Zama proof tied to the encrypted address.
    function mint(
        uint256 collectionId,
        externalEaddress realOwnerInput,
        bytes calldata inputProof
    ) external returns (uint256) {
        Collection storage collection = _collections[collectionId];
        require(collection.exists, "Collection does not exist");
        require(collection.minted < collection.maxSupply, "Max supply reached");

        eaddress encryptedRealOwner = FHE.fromExternal(realOwnerInput, inputProof);

        uint256 tokenId = _nextTokenId++;
        collection.minted += 1;

        _tokens[tokenId] = TokenView({
            tokenId: tokenId,
            collectionId: collectionId,
            owner: msg.sender,
            realOwner: encryptedRealOwner
        });
        _ownedTokens[msg.sender].push(tokenId);
        _collectionTokens[collectionId].push(tokenId);

        FHE.allowThis(encryptedRealOwner);
        FHE.allow(encryptedRealOwner, msg.sender);

        emit TokenMinted(tokenId, collectionId, msg.sender);
        return tokenId;
    }

    /// @notice Update the encrypted real owner for a token.
    /// @param tokenId Token identifier to update.
    /// @param realOwnerInput New encrypted address value.
    /// @param inputProof Zama proof tied to the encrypted address.
    function updateRealOwner(
        uint256 tokenId,
        externalEaddress realOwnerInput,
        bytes calldata inputProof
    ) external {
        TokenView storage token = _tokens[tokenId];
        require(token.owner != address(0), "Unknown token");
        require(token.owner == msg.sender, "Only owner");

        eaddress encryptedRealOwner = FHE.fromExternal(realOwnerInput, inputProof);
        token.realOwner = encryptedRealOwner;

        FHE.allowThis(encryptedRealOwner);
        FHE.allow(encryptedRealOwner, msg.sender);

        emit RealOwnerUpdated(tokenId, encryptedRealOwner);
    }

    /// @notice Allow another address to decrypt the encrypted real owner of a token.
    /// @param tokenId Token identifier.
    /// @param account Address to grant access to.
    function allowRealOwnerAccess(uint256 tokenId, address account) external {
        TokenView storage token = _tokens[tokenId];
        require(token.owner != address(0), "Unknown token");
        require(token.owner == msg.sender, "Only owner");

        token.realOwner = FHE.allow(token.realOwner, account);
        emit RealOwnerAccessGranted(tokenId, account);
    }

    /// @notice Read details of a collection.
    function getCollection(uint256 collectionId) external view returns (Collection memory) {
        return _collections[collectionId];
    }

    /// @notice List all collections.
    function getCollections() external view returns (Collection[] memory) {
        uint256 total = _nextCollectionId - 1;
        Collection[] memory list = new Collection[](total);
        for (uint256 i = 0; i < total; i++) {
            list[i] = _collections[i + 1];
        }
        return list;
    }

    /// @notice Count of created collections.
    function collectionCount() external view returns (uint256) {
        return _nextCollectionId - 1;
    }

    /// @notice Total minted tokens.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Read a token with its encrypted real owner handle.
    function getToken(uint256 tokenId) external view returns (TokenView memory) {
        return _tokens[tokenId];
    }

    /// @notice Tokens owned by a wallet.
    function tokensOfOwner(address owner) external view returns (uint256[] memory) {
        return _ownedTokens[owner];
    }

    /// @notice Token ids within a collection.
    function tokensInCollection(uint256 collectionId) external view returns (uint256[] memory) {
        return _collectionTokens[collectionId];
    }
}

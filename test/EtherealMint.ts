import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { EtherealMint, EtherealMint__factory } from "../types";
import { expect } from "chai";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EtherealMint")) as EtherealMint__factory;
  const contract = (await factory.deploy()) as EtherealMint;
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  return { contract, address };
}

describe("EtherealMint", function () {
  let signers: Signers;
  let contract: EtherealMint;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, address: contractAddress } = await deployFixture());
    expect(ethers.isAddress(contractAddress)).to.eq(true);
  });

  it("creates collection and mints token with encrypted real owner", async function () {
    const encryptedOwner = await fhevm
      .createEncryptedInput(contractAddress, signers.deployer.address)
      .addAddress(signers.deployer.address)
      .encrypt();

    const predictedCollectionId = await contract.createCollection.staticCall(
      "Genesis",
      5,
      encryptedOwner.handles[0],
      encryptedOwner.inputProof,
    );
    await contract.createCollection("Genesis", 5, encryptedOwner.handles[0], encryptedOwner.inputProof);

    const collection = await contract.getCollection(predictedCollectionId);
    expect(collection.creator).to.eq(signers.deployer.address);
    expect(collection.maxSupply).to.eq(5);
    expect(collection.minted).to.eq(0);

    const encryptedRealOwner = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .addAddress(signers.alice.address)
      .encrypt();

    const predictedTokenId = await contract
      .connect(signers.alice)
      .mint.staticCall(predictedCollectionId, encryptedRealOwner.handles[0], encryptedRealOwner.inputProof);
    await contract
      .connect(signers.alice)
      .mint(predictedCollectionId, encryptedRealOwner.handles[0], encryptedRealOwner.inputProof);

    const updatedCollection = await contract.getCollection(predictedCollectionId);
    expect(updatedCollection.minted).to.eq(1);

    const token = await contract.getToken(predictedTokenId);
    expect(token.owner).to.eq(signers.alice.address);
    expect(token.collectionId).to.eq(predictedCollectionId);

    const decryptedOwner = await fhevm.userDecryptEaddress(token.realOwner, contractAddress, signers.alice);
    expect(decryptedOwner.toLowerCase()).to.eq(signers.alice.address.toLowerCase());
  });

  it("allows token owner to update and share encrypted real owner", async function () {
    const collectionInput = await fhevm
      .createEncryptedInput(contractAddress, signers.deployer.address)
      .addAddress(signers.deployer.address)
      .encrypt();
    const collectionId = await contract.createCollection.staticCall(
      "Vault",
      2,
      collectionInput.handles[0],
      collectionInput.inputProof,
    );
    await contract.createCollection("Vault", 2, collectionInput.handles[0], collectionInput.inputProof);

    const initialOwner = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .addAddress(signers.alice.address)
      .encrypt();
    const tokenId = await contract
      .connect(signers.alice)
      .mint.staticCall(collectionId, initialOwner.handles[0], initialOwner.inputProof);
    await contract
      .connect(signers.alice)
      .mint(collectionId, initialOwner.handles[0], initialOwner.inputProof);

    const newOwnerEnc = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .addAddress(signers.bob.address)
      .encrypt();
    await contract
      .connect(signers.alice)
      .updateRealOwner(tokenId, newOwnerEnc.handles[0], newOwnerEnc.inputProof);

    const updatedToken = await contract.getToken(tokenId);
    const decryptedByOwner = await fhevm.userDecryptEaddress(updatedToken.realOwner, contractAddress, signers.alice);
    expect(decryptedByOwner.toLowerCase()).to.eq(signers.bob.address.toLowerCase());

    await contract.connect(signers.alice).allowRealOwnerAccess(tokenId, signers.bob.address);
    const decryptedByBob = await fhevm.userDecryptEaddress(updatedToken.realOwner, contractAddress, signers.bob);
    expect(decryptedByBob.toLowerCase()).to.eq(signers.bob.address.toLowerCase());
  });
});

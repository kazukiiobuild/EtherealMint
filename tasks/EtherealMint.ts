import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the EtherealMint address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const deployment = await deployments.get("EtherealMint");
  console.log("EtherealMint address is " + deployment.address);
});

task("task:create-collection", "Create a new collection with encrypted real owner")
  .addParam("name", "Collection name")
  .addParam("supply", "Maximum supply")
  .addParam("realowner", "Address to encrypt as real owner")
  .addOptionalParam("address", "Override deployed contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("EtherealMint");

    const signers = await ethers.getSigners();
    const signer = signers[0];
    const contract = await ethers.getContractAt("EtherealMint", contractDeployment.address);

    const encryptedOwner = await fhevm
      .createEncryptedInput(contractDeployment.address, signer.address)
      .addAddress(taskArguments.realowner)
      .encrypt();

    const predictedId = await contract.createCollection.staticCall(
      taskArguments.name,
      taskArguments.supply,
      encryptedOwner.handles[0],
      encryptedOwner.inputProof,
    );

    const tx = await contract
      .connect(signer)
      .createCollection(
        taskArguments.name,
        taskArguments.supply,
        encryptedOwner.handles[0],
        encryptedOwner.inputProof,
      );
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Collection created with id=${predictedId}`);
  });

task("task:mint", "Mint a token with encrypted real owner")
  .addParam("collection", "Collection id")
  .addParam("realowner", "Address to encrypt as real owner")
  .addOptionalParam("address", "Override deployed contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("EtherealMint");

    const signers = await ethers.getSigners();
    const signer = signers[0];
    const contract = await ethers.getContractAt("EtherealMint", contractDeployment.address);

    const encryptedOwner = await fhevm
      .createEncryptedInput(contractDeployment.address, signer.address)
      .addAddress(taskArguments.realowner)
      .encrypt();

    const predictedTokenId = await contract.mint.staticCall(
      taskArguments.collection,
      encryptedOwner.handles[0],
      encryptedOwner.inputProof,
    );

    const tx = await contract
      .connect(signer)
      .mint(taskArguments.collection, encryptedOwner.handles[0], encryptedOwner.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Minted tokenId=${predictedTokenId}`);
  });

task("task:decrypt-real-owner", "Decrypt a token's real owner (requires ACL granted)")
  .addParam("tokenid", "Token id to decrypt")
  .addOptionalParam("address", "Override deployed contract address")
  .addOptionalParam("account", "Signer index to use", "0")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("EtherealMint");

    const signers = await ethers.getSigners();
    const signer = signers[parseInt(taskArguments.account)];
    const contract = await ethers.getContractAt("EtherealMint", contractDeployment.address);

    const token = await contract.getToken(taskArguments.tokenid);
    if (token.realOwner === ethers.ZeroHash) {
      console.log("Encrypted real owner is uninitialized");
      return;
    }

    const clearAddress = await fhevm.userDecryptEaddress(token.realOwner, contractDeployment.address, signer);
    console.log(`Real owner for token ${taskArguments.tokenid}: ${clearAddress}`);
  });

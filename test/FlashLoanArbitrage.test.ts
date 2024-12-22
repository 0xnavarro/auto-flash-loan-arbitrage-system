import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { IntraChainArbitrage, CrossChainArbitrage, MockAavePool, MockDex, MockToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Flash Loan Arbitrage", function () {
  // Fixture para desplegar los contratos
  async function deployContracts() {
    // Obtener signers
    const [owner, user] = await ethers.getSigners();

    // Desplegar mocks
    const MockToken = await ethers.getContractFactory("MockToken");
    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    const MockDex = await ethers.getContractFactory("MockDex");

    // Tokens
    const weth = await MockToken.deploy("Wrapped Ether", "WETH", 18);
    const usdc = await MockToken.deploy("USD Coin", "USDC", 6);
    const usdt = await MockToken.deploy("Tether", "USDT", 6);

    // Aave Pool
    const aavePool = await MockAavePool.deploy();

    // DEXs
    const dexA = await MockDex.deploy();
    const dexB = await MockDex.deploy();

    // Configurar precios WETH/USDC
    await dexA.setPrice(
      await weth.getAddress(),
      await usdc.getAddress(),
      ethers.parseEther("1800") // 1 ETH = 1800 USDC
    );

    await dexA.setPrice(
      await usdc.getAddress(),
      await weth.getAddress(),
      ethers.parseEther("0.00055555555") // 1 USDC = 0.00055555555 ETH (1/1800)
    );

    await dexB.setPrice(
      await weth.getAddress(),
      await usdc.getAddress(),
      ethers.parseEther("1805") // 1 ETH = 1805 USDC
    );

    await dexB.setPrice(
      await usdc.getAddress(),
      await weth.getAddress(),
      ethers.parseEther("0.00055401662") // 1 USDC = 0.00055401662 ETH (1/1805)
    );

    // Configurar precios WETH/USDT
    await dexA.setPrice(
      await weth.getAddress(),
      await usdt.getAddress(),
      ethers.parseEther("1801") // 1 ETH = 1801 USDT
    );

    await dexA.setPrice(
      await usdt.getAddress(),
      await weth.getAddress(),
      ethers.parseEther("0.00055524708") // 1 USDT = 0.00055524708 ETH (1/1801)
    );

    await dexB.setPrice(
      await weth.getAddress(),
      await usdt.getAddress(),
      ethers.parseEther("1798") // 1 ETH = 1798 USDT
    );

    await dexB.setPrice(
      await usdt.getAddress(),
      await weth.getAddress(),
      ethers.parseEther("0.00055617352") // 1 USDT = 0.00055617352 ETH (1/1798)
    );

    // Acuñar tokens
    await weth.mint(await aavePool.getAddress(), ethers.parseEther("1000"));
    await usdc.mint(await aavePool.getAddress(), 1000000n * 1000000n);
    await usdt.mint(await aavePool.getAddress(), 1000000n * 1000000n);

    await weth.mint(await dexA.getAddress(), ethers.parseEther("100"));
    await usdc.mint(await dexA.getAddress(), 200000n * 1000000n);
    await usdt.mint(await dexA.getAddress(), 200000n * 1000000n);

    await weth.mint(await dexB.getAddress(), ethers.parseEther("100"));
    await usdc.mint(await dexB.getAddress(), 200000n * 1000000n);
    await usdt.mint(await dexB.getAddress(), 200000n * 1000000n);

    // Desplegar contratos principales
    const IntraChainArbitrage = await ethers.getContractFactory("IntraChainArbitrage");
    const intraChainArbitrage = await IntraChainArbitrage.deploy(
      await aavePool.getAddress(),
      await dexA.getAddress(),
      await dexB.getAddress()
    );

    const CrossChainArbitrage = await ethers.getContractFactory("CrossChainArbitrage");
    const crossChainArbitrage = await CrossChainArbitrage.deploy(
      await aavePool.getAddress(),
      await dexA.getAddress(),
      await dexB.getAddress()
    );

    return {
      intraChainArbitrage,
      crossChainArbitrage,
      owner,
      user,
      weth,
      usdc,
      usdt,
      aavePool,
      dexA,
      dexB
    };
  }

  describe("IntraChainArbitrage", function () {
    let intraChainArbitrage: IntraChainArbitrage;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let weth: MockToken;
    let usdc: MockToken;
    let aavePool: MockAavePool;
    let dexA: MockDex;
    let dexB: MockDex;

    beforeEach(async function () {
      ({ intraChainArbitrage, owner, user, weth, usdc, aavePool, dexA, dexB } = await loadFixture(deployContracts));
    });

    it("Should deploy successfully", async function () {
      expect(await intraChainArbitrage.getAddress()).to.be.properAddress;
    });

    it("Should have correct owner", async function () {
      expect(await intraChainArbitrage.owner()).to.equal(owner.address);
    });

    it("Should calculate arbitrage correctly", async function () {
      const amount = ethers.parseEther("1");

      const [profit, dexAToB] = await intraChainArbitrage.calculateArbitrage(
        await weth.getAddress(),
        await usdc.getAddress(),
        amount
      );

      expect(profit).to.be.gte(0);
      expect(typeof dexAToB).to.equal("boolean");
    });

    it("Should only allow owner to execute arbitrage", async function () {
      const amount = ethers.parseEther("1");

      await expect(
        intraChainArbitrage.connect(user).executeArbitrage(
          await weth.getAddress(),
          amount,
          await usdc.getAddress(),
          true,
          0
        )
      ).to.be.revertedWithCustomError(intraChainArbitrage, "OwnableUnauthorizedAccount");
    });

    it("Should not allow zero amount", async function () {
      await expect(
        intraChainArbitrage.executeArbitrage(
          await weth.getAddress(),
          0,
          await usdc.getAddress(),
          true,
          0
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("CrossChainArbitrage", function () {
    let crossChainArbitrage: CrossChainArbitrage;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let weth: MockToken;
    let usdc: MockToken;
    let aavePool: MockAavePool;
    let dexA: MockDex;
    let dexB: MockDex;

    beforeEach(async function () {
      ({ crossChainArbitrage, owner, user, weth, usdc, aavePool, dexA, dexB } = await loadFixture(deployContracts));
    });

    it("Should deploy successfully", async function () {
      expect(await crossChainArbitrage.getAddress()).to.be.properAddress;
    });

    it("Should have correct owner", async function () {
      expect(await crossChainArbitrage.owner()).to.equal(owner.address);
    });

    it("Should only allow owner to execute arbitrage", async function () {
      const amount = ethers.parseEther("1");
      const targetChain = 8453; // Base
      const srcPoolId = 1;
      const dstPoolId = 1;

      await expect(
        crossChainArbitrage.connect(user).executeCrossChainArbitrage(
          await weth.getAddress(),
          amount,
          await usdc.getAddress(),
          targetChain,
          srcPoolId,
          dstPoolId
        )
      ).to.be.revertedWithCustomError(crossChainArbitrage, "OwnableUnauthorizedAccount");
    });

    it("Should not allow zero amount", async function () {
      const targetChain = 8453; // Base
      const srcPoolId = 1;
      const dstPoolId = 1;

      await expect(
        crossChainArbitrage.executeCrossChainArbitrage(
          await weth.getAddress(),
          0,
          await usdc.getAddress(),
          targetChain,
          srcPoolId,
          dstPoolId
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should not allow unsupported chains", async function () {
      const amount = ethers.parseEther("1");
      const targetChain = 1; // Ethereum (no soportado)
      const srcPoolId = 1;
      const dstPoolId = 1;

      await expect(
        crossChainArbitrage.executeCrossChainArbitrage(
          await weth.getAddress(),
          amount,
          await usdc.getAddress(),
          targetChain,
          srcPoolId,
          dstPoolId
        )
      ).to.be.revertedWith("Unsupported chain");
    });
  });
}); 
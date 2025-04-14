"use strict";

const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } =
  anchor.web3;
const { Token, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const winston = require("winston");
const { WebSocket } = require("ws");

// Configuration
const CONFIG = {
  rpcUrl: clusterApiUrl("devnet"),
  commitment: "confirmed",
  pollingInterval: 3000,
  maxSlippage: 0.5, // 0.5%
  minProfitThreshold: 0.3, // 0.3%
  maxPositionSize: 0.1, // 10% of pool liquidity
  priorityFee: 10000, // micro-lamports
};

// Logger Setup
const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "logs/arbitrage.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

class SolanaService {
  constructor() {
    this.connection = new Connection(CONFIG.rpcUrl, {
      commitment: CONFIG.commitment,
      wsEndpoint: CONFIG.rpcUrl.replace("https", "wss"),
    });
    this.wallet = this.loadWallet();
    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.wallet),
      { commitment: CONFIG.commitment }
    );
    anchor.setProvider(this.provider);
  }

  loadWallet() {
    try {
      const keypairPath = path.join(
        process.env.HOME || process.env.USERPROFILE,
        ".config",
        "solana",
        "id.json"
      );
      const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
      return Keypair.fromSecretKey(Uint8Array.from(secretKey));
    } catch (error) {
      logger.error("Wallet loading failed", { error: error.message });
      process.exit(1);
    }
  }

  async getTokenBalance(mintAddress) {
    const token = new Token(
      this.connection,
      new PublicKey(mintAddress),
      TOKEN_PROGRAM_ID,
      this.wallet
    );
    const account = await token.getOrCreateAssociatedAccountInfo(
      this.wallet.publicKey
    );
    return account.amount;
  }
}

class DexService {
  constructor() {
    this.dexes = require("../configs/dexes.json");
    this.tokenPairs = require("../configs/tokens.json");
  }

  async fetchPrices(tokenA, tokenB) {
    const prices = [];

    for (const dex of this.dexes.filter((d) => d.enabled)) {
      try {
        if (dex.type === "api") {
          const price = await this.fetchApiPrice(dex, tokenA, tokenB);
          prices.push(price);
        } else {
          const price = await this.fetchOnChainPrice(dex, tokenA, tokenB);
          prices.push(price);
        }
      } catch (error) {
        logger.warn(`DEX ${dex.name} price fetch failed`, {
          dex: dex.name,
          error: error.message,
        });
      }
    }

    return prices;
  }

  async fetchApiPrice(dex, tokenA, tokenB) {
    const response = await axios.get(`${dex.apiUrl}/quote`, {
      params: {
        inputMint: tokenA,
        outputMint: tokenB,
        amount: LAMPORTS_PER_SOL,
        slippageBps: CONFIG.maxSlippage * 100,
        feeBps: 50,
      },
      timeout: 5000,
    });

    return {
      dex: dex.name,
      priceAtoB: response.data.outAmount / response.data.inAmount,
      priceBtoA: response.data.inAmount / response.data.outAmount,
      liquidity: response.data.liquidity,
      maxAmount: response.data.inAmount,
      fee: response.data.feeAmount || 0,
    };
  }

  async fetchOnChainPrice(dex, tokenA, tokenB) {
    // Implement actual on-chain price fetching
    return {
      dex: dex.name,
      priceAtoB: 1.02,
      priceBtoA: 1 / 1.02,
      liquidity: 10000,
      maxAmount: 1000000,
      fee: 0,
    };
  }
}

class ArbitrageEngine {
  constructor() {
    this.solana = new SolanaService();
    this.dex = new DexService();
    this.running = false;
    this.programId = new PublicKey(
      "F4akDLGjGM9zeroDC2S7JY3YxoWzVnU724khnVTe6LXR"
    );
    this.program = this.loadProgram();
  }

  loadProgram() {
    try {
      const idlPath = path.join(
        __dirname,
        "../target/idl/flash_arbitrage.json"
      );
      const idlFile = fs.readFileSync(idlPath, "utf8");
      const idl = JSON.parse(idlFile);

      if (!idl.instructions) {
        throw new Error("Invalid IDL structure - missing instructions");
      }

      return new anchor.Program(idl, this.programId, this.solana.provider);
    } catch (err) {
      logger.error("Failed to load program:", { error: err.message });
      process.exit(1);
    }
  }

  async start() {
    try {
      // Validate configs and SOL balance
      const solBalance = await this.solana.connection.getBalance(
        this.solana.wallet.publicKey
      );
      if (solBalance < 0.1 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Insufficient SOL balance. Need at least 0.1 SOL, have ${
            solBalance / LAMPORTS_PER_SOL
          }`
        );
      }

      logger.info("Arbitrage bot started", {
        rpc: CONFIG.rpcUrl,
        wallet: this.solana.wallet.publicKey.toString(),
      });

      this.running = true;
      while (this.running) {
        await this.arbitrageCycle();
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.pollingInterval)
        );
      }
    } catch (err) {
      logger.error("Startup failed", { error: err.message });
      process.exit(1);
    }
  }

  async arbitrageCycle() {
    for (const pair of this.dex.tokenPairs.filter((p) => p.enabled)) {
      try {
        const prices = await this.dex.fetchPrices(pair.tokenA, pair.tokenB);
        const opportunity = this.findArbitrage(prices, pair);

        if (opportunity) {
          await this.executeArbitrage(opportunity);
        }
      } catch (error) {
        logger.error(`Token pair ${pair.tokenA}/${pair.tokenB} failed`, {
          error: error.message,
        });
      }
    }
  }

  findArbitrage(prices, pairConfig) {
    if (prices.length < 2) return null;

    const [bestBuy, bestSell] = this.findBestPrices(prices);
    const profitPercent = this.calculateProfit(bestBuy, bestSell);

    if (profitPercent >= pairConfig.minProfit) {
      const amount = this.calculateTradeSize(bestBuy, bestSell, pairConfig);
      return {
        dexA: bestBuy.dex,
        dexB: bestSell.dex,
        tokenA: pairConfig.tokenA,
        tokenB: pairConfig.tokenB,
        amount,
        profitPercent,
        minProfit: (pairConfig.minProfit / 100) * bestBuy.priceAtoB * amount,
      };
    }
    return null;
  }

  findBestPrices(prices) {
    return [
      prices.reduce((min, current) =>
        current.priceAtoB < min.priceAtoB ? current : min
      ),
      prices.reduce((max, current) =>
        current.priceBtoA > max.priceBtoA ? current : max
      ),
    ];
  }

  calculateProfit(buy, sell) {
    return ((sell.priceBtoA - buy.priceAtoB) / buy.priceAtoB) * 100;
  }

  calculateTradeSize(buy, sell, pairConfig) {
    const maxByLiquidity = Math.min(
      buy.liquidity * CONFIG.maxPositionSize,
      sell.liquidity * CONFIG.maxPositionSize
    );
    const maxByConfig = pairConfig.maxAmount || Infinity;
    return Math.floor(Math.min(maxByLiquidity, maxByConfig));
  }

  async executeArbitrage(opportunity) {
    try {
      const tx = await this.program.methods
        .executeArbitrage(
          new anchor.BN(opportunity.amount),
          new anchor.BN(opportunity.minProfit)
        )
        .rpc({
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });

      logger.info("Arbitrage executed", {
        txHash: tx,
        amount: opportunity.amount,
        profitPercent: opportunity.profitPercent.toFixed(2),
        dexA: opportunity.dexA,
        dexB: opportunity.dexB,
      });

      return tx;
    } catch (error) {
      logger.error("Arbitrage execution failed", {
        error: error.message,
        opportunity,
      });
      throw error;
    }
  }

  stop() {
    this.running = false;
    logger.info("Arbitrage bot stopped");
  }
}

// Main Execution
const bot = new ArbitrageEngine();

process.on("SIGINT", async () => {
  await bot.stop();
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", { error: error.message });
});

bot.start().catch((error) => {
  logger.error("Fatal bot error", { error: error.message });
  process.exit(1);
});

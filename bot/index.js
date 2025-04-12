(async () => {
  'use strict';
  
  const path = require('path');
  const { Connection, Keypair, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');
  const { Program, Provider, BN } = require('@coral-xyz/anchor');
  const fs = require('fs');
  const axios = require('axios');
  const winston = require('winston');
  const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
  
  // Enhanced logger configuration
const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: path.join(__dirname, 'logs/arbitrage.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

// Improved wallet loading
function loadWallet() {
  const keypairPath = path.join(process.env.USERPROFILE, '.config', 'solana', 'id.json');
  try {
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (err) {
    logger.error('Failed to load wallet', { error: err.message });
    process.exit(1);
  }
}

const wallet = loadWallet();

// Enhanced connection setup with retries
class RetryProvider extends Provider {
  async send(tx, signers, opts) {
    const MAX_RETRIES = 3;
    let lastError;
    
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        return await super.send(tx, signers, opts);
      } catch (err) {
        lastError = err;
        logger.warn(`Transaction attempt ${i + 1} failed`, { error: err.message });
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw lastError;
  }
}

const connection = new Connection(
  clusterApiUrl('devnet'),
  {
    commitment: 'confirmed',
    disableRetryOnRateLimit: false,
    confirmTransactionInitialTimeout: 60000
  }
);

const provider = new RetryProvider(
  connection,
  wallet,
  { commitment: 'confirmed' }
);

// Program loading with version check
async function loadProgram() {
  const programId = new PublicKey('F4akDLGjGM9zeroDC2S7JY3YxoWzVnU724khnVTe6LXR');
  
  try {
    const idl = JSON.parse(fs.readFileSync(
      path.join(__dirname, 'target/idl/flash_arbitrage.json'),
      'utf8'
    ));
    
    const program = new Program(idl, programId, provider);
    logger.info('Program loaded successfully', { 
      programId: programId.toBase58(),
      version: idl.version
    });
    
    return program;
  } catch (err) {
    logger.error('Failed to load program', { error: err.message });
    process.exit(1);
  }
}

const program = await loadProgram();

// Enhanced price fetching with caching
class PriceFetcher {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5000; // 5 seconds
  }

  async fetchPrices(tokenA, tokenB, dexes) {
    const cacheKey = `${tokenA}-${tokenB}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.prices;
    }

    const prices = await Promise.all(
      dexes.map(dex => this.fetchDexPrice(dex, tokenA, tokenB))
    );

    this.cache.set(cacheKey, {
      prices: prices.filter(Boolean),
      timestamp: Date.now()
    });

    return this.cache.get(cacheKey).prices;
  }

  async fetchDexPrice(dex, tokenA, tokenB) {
    try {
      if (dex.type === 'api') {
        return this.fetchApiPrice(dex, tokenA, tokenB);
      } else {
        return this.fetchOnChainPrice(dex, tokenA, tokenB);
      }
    } catch (err) {
      logger.warn(`Failed to fetch price from ${dex.name}`, {
        dex: dex.name,
        error: err.message
      });
      return null;
    }
  }

  async fetchApiPrice(dex, tokenA, tokenB) {
    const response = await axios.get(`${dex.apiUrl}/quote`, {
      params: {
        inputMint: tokenA,
        outputMint: tokenB,
        amount: LAMPORTS_PER_SOL,
        slippage: 0.5,
        feeBps: 50
      },
      timeout: 5000
    });

    return {
      dex: dex.name,
      priceAtoB: response.data.outAmount / response.data.inAmount,
      priceBtoA: response.data.inAmount / response.data.outAmount,
      liquidity: response.data.liquidity,
      maxAmount: response.data.inAmount,
      fee: response.data.feeAmount || 0
    };
  }

  async fetchOnChainPrice(dex, tokenA, tokenB) {
    // Implement actual DEX SDK integration here
    return {
      dex: dex.name,
      priceAtoB: 1.02,
      priceBtoA: 1/1.02,
      liquidity: 10000,
      maxAmount: 1000000,
      fee: 0
    };
  }
}

// Opportunity finder with improved risk management
class OpportunityFinder {
  constructor(minProfitPercent, maxSlippage = 0.5) {
    this.minProfitPercent = minProfitPercent;
    this.maxSlippage = maxSlippage;
  }

  findBestOpportunity(prices, tokenA, tokenB) {
    if (prices.length < 2) return null;

    const [bestBuy, bestSell] = this.findBestPrices(prices);
    const opportunity = this.calculateOpportunity(bestBuy, bestSell, tokenA, tokenB);

    return opportunity && opportunity.profitPercent >= this.minProfitPercent 
      ? opportunity 
      : null;
  }

  findBestPrices(prices) {
    return [
      prices.reduce((min, current) => 
        current.priceAtoB < min.priceAtoB ? current : min
      ),
      prices.reduce((max, current) => 
        current.priceBtoA > max.priceBtoA ? current : max
      )
    ];
  }

  calculateOpportunity(buy, sell, tokenA, tokenB) {
    const profitPercent = ((sell.priceBtoA - buy.priceAtoB) / buy.priceAtoB) * 100;
    const amount = this.calculateOptimalAmount(buy, sell);
    const minProfit = (this.minProfitPercent / 100) * buy.priceAtoB * amount;
    const expectedFee = (buy.fee || 0) + (sell.fee || 0);

    return {
      dexA: buy.dex,
      dexB: sell.dex,
      tokenA,
      tokenB,
      amount,
      minProfit,
      expectedProfit: profitPercent,
      expectedFee,
      netProfitPercent: profitPercent - (expectedFee / amount * 100)
    };
  }

  calculateOptimalAmount(buy, sell) {
    const maxByLiquidity = Math.min(
      buy.liquidity * 0.05, 
      sell.liquidity * 0.05
    );
    const maxByDex = Math.min(
      buy.maxAmount || Infinity,
      sell.maxAmount || Infinity
    );
    return Math.floor(Math.min(maxByLiquidity, maxByDex));
  }
}

// Transaction executor with improved error handling
class TransactionExecutor {
  constructor(program) {
    this.program = program;
    this.priorityFee = 1000; // micro-lamports
  }

  async executeArbitrage(opportunity) {
    try {
      const tx = await this.program.methods
        .executeArbitrage(
          new BN(opportunity.amount),
          new BN(opportunity.minProfit)
        )
        .rpc({
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3
        });

      logger.info('Arbitrage executed successfully', {
        txHash: tx,
        amount: opportunity.amount,
        expectedProfit: opportunity.expectedProfit,
        dexA: opportunity.dexA,
        dexB: opportunity.dexB
      });

      return tx;
    } catch (err) {
      logger.error('Failed to execute arbitrage', {
        error: err.message,
        opportunity
      });
      throw err;
    }
  }
}

// Main bot class
class ArbitrageBot {
  constructor() {
    this.priceFetcher = new PriceFetcher();
    this.txExecutor = new TransactionExecutor(program);
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const tokens = require('./configs/tokens.json');
    const dexes = require('./configs/dexes.json');

    logger.info('Starting arbitrage bot', { tokens, dexes });

    while (this.isRunning) {
      try {
        await this.monitorOpportunities(tokens, dexes);
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err) {
        logger.error('Error in main bot loop', { error: err.message });
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  async monitorOpportunities(tokens, dexes) {
    await Promise.all(
      tokens.map(async pair => {
        try {
          const finder = new OpportunityFinder(pair.minProfit);
          const prices = await this.priceFetcher.fetchPrices(pair.tokenA, pair.tokenB, dexes);
          const opportunity = finder.findBestOpportunity(prices, pair.tokenA, pair.tokenB);

          if (opportunity) {
            await this.txExecutor.executeArbitrage(opportunity);
          }
        } catch (err) {
          logger.error('Error monitoring token pair', {
            pair: `${pair.tokenA}/${pair.tokenB}`,
            error: err.message
          });
        }
      })
    );
  }

  stop() {
    this.isRunning = false;
    logger.info('Bot stopped');
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  bot.stop();
  process.exit(0);
});

process.on('unhandledRejection', err => {
  logger.error('Unhandled rejection', { error: err.message });
});

// Start the bot
const bot = new ArbitrageBot();
bot.start().catch(err => {
  logger.error('Failed to start bot', { error: err.message });
  process.exit(1);
});
  
  // Add this at the VERY BOTTOM
  })().catch(err => {
    console.error('Bot crashed:', err);
    process.exit(1);
  });
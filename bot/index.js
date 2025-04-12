const path = require('path');
const { Connection, Keypair, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Program, Provider, BN } = require('@coral-xyz/anchor');
const fs = require('fs');
const axios = require('axios');
const winston = require('winston');
// const Notifier = require('./notifier');
// const notifier = new Notifier('YOUR_TELEGRAM_TOKEN', 'CHAT_ID');

// Add to executeArbitrage():
// notifier.send(`Arbitrage executed: ${tx}\nProfit: ${opportunity.expectedProfit.toFixed(2)}%`);

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/arbitrage.log'),
      maxsize: 10 * 1024 * 1024 // 10MB
    })
  ]
});

// Windows-compatible path handling
const keypairPath = path.join(process.env.USERPROFILE, '.config', 'solana', 'id.json');
let wallet;
try {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  logger.info(`Wallet loaded: ${wallet.publicKey.toBase58()}`);
} catch (err) {
  logger.error(`Failed to load wallet: ${err.message}`);
  process.exit(1);
}

// Connection setup
const connection = new Connection(
  clusterApiUrl('devnet'), // Change to 'mainnet-beta' when ready
  'confirmed'
);

const provider = new Provider(
  connection,
  wallet,
  { commitment: 'confirmed' }
);

// Load program
const programId = new PublicKey('F4akDLGjGM9zeroDC2S7JY3YxoWzVnU724khnVTe6LXR');
let program;
try {
  const idlPath = path.join(__dirname, '../target/idl/flash_arbitrage.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  program = new Program(idl, programId, provider);
  logger.info(`Program loaded: ${programId.toBase58()}`);
} catch (err) {
  logger.error(`Failed to load program: ${err.message}`);
  process.exit(1);
}

// Main bot function
async function monitorArbitrage() {
  try {
    // Load configs
    const tokens = require('../configs/tokens.json');
    const dexes = require('../configs/dexes.json');
    
    logger.info('Starting arbitrage monitoring...');
    
    while (true) {
      for (const pair of tokens) {
        try {
          // Get prices from different DEXs
          const prices = await getPrices(pair.tokenA, pair.tokenB, dexes);
          
          // Find best opportunities
          const opportunity = findBestOpportunity(prices, pair.minProfit, pair.tokenA, pair.tokenB);
          
          if (opportunity) {
            logger.info(`Found opportunity: ${opportunity.expectedProfit.toFixed(2)}% profit`);
            await executeArbitrage(opportunity);
          }
        } catch (err) {
          logger.error(`Error processing pair ${pair.tokenA}/${pair.tokenB}: ${err.message}`);
        }
      }
      
      // Wait before next scan
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } catch (err) {
    logger.error(`Fatal error in monitorArbitrage: ${err.message}`);
    process.exit(1);
  }
}

// Fetch prices from DEXs
async function getPrices(tokenA, tokenB, dexes) {
  const prices = [];
  
  for (const dex of dexes) {
    try {
      let priceData;
      
      if (dex.type === 'api') {
        // API-based DEX (e.g., Jupiter)
        const response = await axios.get(`${dex.apiUrl}/quote`, {
          params: {
            inputMint: tokenA,
            outputMint: tokenB,
            amount: 1 * LAMPORTS_PER_SOL, // 1 SOL worth
            slippage: 0.5 // 0.5%
          }
        });
        
        priceData = {
          dex: dex.name,
          priceAtoB: response.data.outAmount / response.data.inAmount,
          priceBtoA: response.data.inAmount / response.data.outAmount,
          liquidity: response.data.liquidity,
          maxAmount: response.data.inAmount
        };
      } else {
        // On-chain DEX (e.g., Raydium)
        const [priceAB, liquidity, maxAmount] = await getOnChainPrice(dex.programId, tokenA, tokenB);
        priceData = {
          dex: dex.name,
          priceAtoB: priceAB,
          priceBtoA: 1/priceAB,
          liquidity,
          maxAmount
        };
      }
      
      prices.push(priceData);
    } catch (err) {
      logger.warn(`Failed to get prices from ${dex.name}: ${err.message}`);
    }
  }
  
  return prices;
}

// Simplified on-chain price fetch (replace with actual DEX SDK calls)
async function getOnChainPrice(dexProgramId, mintA, mintB) {
  // Mock implementation - replace with Serum/Orca/Raydium SDK
  return [
    1.02,    // price A->B
    10000,   // liquidity
    1000000  // maxAmount
  ];
}

// Find profitable arbitrage opportunities
function findBestOpportunity(prices, minProfitPercent, tokenA, tokenB) {
  if (prices.length < 2) return null;
  
  // Find best buy (lowest A->B price) and best sell (highest B->A price)
  const bestBuy = prices.reduce((min, current) => 
    current.priceAtoB < min.priceAtoB ? current : min
  );
  
  const bestSell = prices.reduce((max, current) => 
    current.priceBtoA > max.priceBtoA ? current : max
  );

  // Calculate arbitrage profit percentage
  const profitPercent = ((bestSell.priceBtoA - bestBuy.priceAtoB) / bestBuy.priceAtoB) * 100;
  
  if (profitPercent > minProfitPercent) {
    const amount = calculateOptimalAmount(bestBuy, bestSell);
    const minProfit = (minProfitPercent / 100) * bestBuy.priceAtoB * amount;
    
    return {
      dexA: bestBuy.dex,
      dexB: bestSell.dex,
      tokenA,
      tokenB,
      amount,
      minProfit,
      expectedProfit: profitPercent
    };
  }
  
  return null;
}

// Calculate optimal trade amount considering liquidity and slippage
function calculateOptimalAmount(buyDex, sellDex) {
  // Don't use more than 5% of available liquidity
  const maxAmount = Math.min(
    buyDex.liquidity * 0.05,
    sellDex.liquidity * 0.05,
    buyDex.maxAmount || Infinity,
    sellDex.maxAmount || Infinity
  );
  
  // Round down to nearest whole token
  return Math.floor(maxAmount);
}

// Execute arbitrage transaction
async function executeArbitrage(opportunity) {
  try {
    logger.info(`Executing arbitrage: ${opportunity.amount} ${opportunity.tokenA} via ${opportunity.dexA}->${opportunity.dexB}`);
    
    const tx = await program.methods
      .executeArbitrage(
        new BN(opportunity.amount),
        new BN(opportunity.minProfit)
      )
      .rpc();
      
    logger.info(`Arbitrage executed: ${tx}`);
    return tx;
  } catch (err) {
    logger.error(`Arbitrage failed: ${err.message}`);
    throw err;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down bot...');
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err.message}`);
});

// Start the bot
monitorArbitrage().catch(err => {
  logger.error(`Bot crashed: ${err.message}`);
  process.exit(1);
});
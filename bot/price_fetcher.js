const axios = require('axios');
const { PublicKey, Connection } = require('@solana/web3.js');
const dexConfigs = require('../configs/dexes.json');
const logger = require('../utils/logger');

async function getPrices(tokenA, tokenB) {
    const prices = [];
    
    for (const dex of dexConfigs) {
        try {
            let priceData;
            
            if (dex.type === 'api') {
                priceData = await fetchApiPrices(dex, tokenA, tokenB);
            } else if (dex.type === 'onchain') {
                priceData = await fetchOnChainPrices(dex, tokenA, tokenB);
            }
            
            if (priceData) {
                prices.push({
                    dex: dex.name,
                    priceAtoB: priceData.priceAtoB,
                    priceBtoA: priceData.priceBtoA,
                    maxAmount: priceData.maxAmount,
                    liquidity: priceData.liquidity
                });
            }
        } catch (error) {
            logger.warn(`Failed to fetch prices from ${dex.name}: ${error.message}`);
        }
    }
    
    return prices;
}

async function fetchApiPrices(dex, tokenA, tokenB) {
    const response = await axios.get(`${dex.apiUrl}/price`, {
        params: {
            tokenA,
            tokenB
        }
    });
    
    return {
        priceAtoB: response.data.priceAtoB,
        priceBtoA: response.data.priceBtoA,
        maxAmount: response.data.maxAmount,
        liquidity: response.data.liquidity
    };
}

async function fetchOnChainPrices(dex, tokenA, tokenB) {
    // Simplified - would use serum or other on-chain DEX program
    const connection = new Connection(dex.rpcUrl);
    
    // In reality would query the DEX's order book
    return {
        priceAtoB: 1.01, // Mock data
        priceBtoA: 0.99, // Mock data
        maxAmount: 1000, // Mock data
        liquidity: 10000 // Mock data
    };
}

module.exports = { getPrices };
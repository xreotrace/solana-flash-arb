const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const analyticsFile = path.join(__dirname, '../../logs/analytics.json');

class Analytics {
    constructor() {
        this.opportunities = [];
        this.executions = [];
        this.profits = [];
        this.load();
    }

    load() {
        try {
            const data = fs.readFileSync(analyticsFile, 'utf8');
            const json = JSON.parse(data);
            Object.assign(this, json);
        } catch (err) {
            logger.warn('No analytics file found, starting fresh');
        }
    }

    save() {
        try {
            fs.writeFileSync(analyticsFile, JSON.stringify({
                opportunities: this.opportunities,
                executions: this.executions,
                profits: this.profits
            }, null, 2));
        } catch (err) {
            logger.error(`Failed to save analytics: ${err.message}`);
        }
    }

    recordOpportunity(pair, profitPercentage) {
        this.opportunities.push({
            timestamp: new Date().toISOString(),
            pair: `${pair.tokenA}/${pair.tokenB}`,
            profitPercentage,
            executed: false
        });
        this.save();
    }

    recordExecution(pair, amount, profit, txId) {
        this.executions.push({
            timestamp: new Date().toISOString(),
            pair: `${pair.tokenA}/${pair.tokenB}`,
            amount,
            profit,
            txId
        });
        this.profits.push(profit);
        this.save();
    }

    getStats() {
        const totalProfit = this.profits.reduce((sum, p) => sum + p, 0);
        const avgProfit = this.profits.length > 0 ? totalProfit / this.profits.length : 0;
        const successRate = this.opportunities.length > 0 
            ? (this.executions.length / this.opportunities.length) * 100 
            : 0;
        
        return {
            totalOpportunities: this.opportunities.length,
            totalExecutions: this.executions.length,
            totalProfit,
            avgProfit,
            successRate
        };
    }
}

module.exports = new Analytics();
const { BaseStrategy } = require("./base");
const { Connection } = require("@solana/web3.js");

class FlashLoanStrategy extends BaseStrategy {
  async execute(trade) {
    // Flash loan specific logic
  }
}

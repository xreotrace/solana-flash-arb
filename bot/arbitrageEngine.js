const anchor = require("@project-serum/anchor");
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } =
  anchor.web3;
const { Token } = anchor.spl;
const logger = require("../utils/logger");

class ArbitrageEngine {
  constructor(connection, wallet, program) {
    this.connection = connection;
    this.wallet = wallet;
    this.program = program;
    this.logger = logger;
    this.tokenAccounts = new Map();
  }

  async initialize() {
    try {
      // Initialize token accounts
      await this.initializeTokenAccounts();
      this.logger.info("Arbitrage engine initialized");
    } catch (err) {
      this.logger.error("Initialization failed", { error: err.message });
      throw err;
    }
  }

  async initializeTokenAccounts() {
    const tokenMints = [
      "So11111111111111111111111111111111111111112", // SOL
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    ];

    for (const mint of tokenMints) {
      if (mint === "So11111111111111111111111111111111111111112") {
        this.tokenAccounts.set(mint, this.wallet.publicKey);
      } else {
        const token = new Token(
          this.connection,
          new PublicKey(mint),
          TOKEN_PROGRAM_ID,
          this.wallet
        );
        const account = await token.getOrCreateAssociatedAccountInfo(
          this.wallet.publicKey
        );
        this.tokenAccounts.set(mint, account.address);
      }
    }
  }

  async validateAccounts(tokenA, tokenB, amount) {
    try {
      // Verify SOL balance for fees
      const solBalance = await this.connection.getBalance(
        this.wallet.publicKey
      );
      if (solBalance < 0.1 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Insufficient SOL for fees. Need 0.1, have ${
            solBalance / LAMPORTS_PER_SOL
          }`
        );
      }

      // Verify token accounts exist
      if (!this.tokenAccounts.has(tokenA)) {
        throw new Error(`Source token account not found for ${tokenA}`);
      }
      if (!this.tokenAccounts.has(tokenB)) {
        throw new Error(`Destination token account not found for ${tokenB}`);
      }

      return {
        source: this.tokenAccounts.get(tokenA),
        destination: this.tokenAccounts.get(tokenB),
      };
    } catch (err) {
      this.logger.error("Account validation failed", { error: err.message });
      throw err;
    }
  }

  async executeArbitrage(opportunity) {
    try {
      // 1. Validate accounts
      const { source, destination } = await this.validateAccounts(
        opportunity.tokenA,
        opportunity.tokenB,
        opportunity.amount
      );

      // 2. Prepare transaction
      const tx = new Transaction().add(
        // Replace with your actual arbitrage instruction
        SystemProgram.transfer({
          fromPubkey: source,
          toPubkey: destination,
          lamports: opportunity.amount,
        })
      );

      // 3. Send transaction
      const signature = await anchor.web3.sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.wallet],
        { commitment: "confirmed" }
      );

      this.logger.info("Arbitrage executed successfully", {
        signature,
        opportunity,
      });

      return signature;
    } catch (err) {
      this.logger.error("Arbitrage execution failed", {
        error: err.message,
        opportunity,
      });
      throw err;
    }
  }
}

module.exports = ArbitrageEngine;

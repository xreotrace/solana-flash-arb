const { Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { Program } = require('@project-serum/anchor');
const logger = require('../utils/logger');
const config = require('../configs/thresholds.json');

async function executeArbitrage(program, wallet, tokenA, tokenB, dexA, dexB, amount, minProfit) {
    try {
        logger.info(`Executing arbitrage: ${amount} ${tokenA} -> ${tokenB}`);
        
        const tx = new Transaction();
        
        // Get necessary accounts
        const [flashLoanAccount] = await PublicKey.findProgramAddress(
            [Buffer.from('flash_loan')],
            program.programId
        );
        
        const sourceTokenAccount = await getAssociatedTokenAccount(wallet.publicKey, tokenA);
        const destinationTokenAccount = await getAssociatedTokenAccount(flashLoanAccount, tokenA);
        const repayTokenAccount = await getAssociatedTokenAccount(wallet.publicKey, tokenA);
        const profitTokenAccount = await getAssociatedTokenAccount(wallet.publicKey, tokenA);
        
        // Add arbitrage instruction
        tx.add(program.instruction.executeArbitrage(
            amount,
            minProfit,
            new PublicKey(dexA),
            new PublicKey(dexB),
            new PublicKey(tokenA),
            new PublicKey(tokenB),
            {
                accounts: {
                    source: sourceTokenAccount,
                    destination: destinationTokenAccount,
                    repayAccount: repayTokenAccount,
                    userProfitAccount: profitTokenAccount,
                    flashLoan: flashLoanAccount,
                    flashLoanProgram: config.flashLoanProgram,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                    user: wallet.publicKey,
                }
            }
        ));
        
        // Send transaction
        const txId = await program.provider.send(tx, [wallet]);
        logger.success(`Arbitrage executed: ${txId}`);
        
        return txId;
    } catch (error) {
        logger.error(`Arbitrage failed: ${error.message}`);
        throw error;
    }
}

async function getAssociatedTokenAccount(owner, mint) {
    const [address] = await PublicKey.findProgramAddress(
        [
            owner.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            new PublicKey(mint).toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return address;
}

module.exports = { executeArbitrage };
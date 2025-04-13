use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, TokenAccount, Transfer},
};

declare_id!("F4akDLGjGM9zeroDC2S7JY3YxoWzVnU724khnVTe6LXR");

#[program]
pub mod flash_arbitrage {
    use super::*;

    pub fn execute_arbitrage(
        ctx: Context<ExecuteArbitrage>,
        loan_amount: u64,
        min_profit: u64,
    ) -> Result<()> {
        // Verify the transaction is atomic
        require!(
            ctx.accounts.instructions.key() == sysvar::instructions::id(),
            ErrorCode::InvalidInstructionsSysvar
        );

        // Take flash loan
        let seeds = &[b"flash_loan", &[ctx.bumps.flash_loan]];
        let signer = [&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.source.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.flash_loan.to_account_info(),
                },
                &signer,
            ),
            loan_amount,
        )?;

        // Simulate arbitrage (1% profit for demo)
        let profit = loan_amount.checked_div(100).ok_or(ErrorCode::MathOverflow)?;
        
        // Verify minimum profit
        require!(profit >= min_profit, ErrorCode::NotProfitable);

        // Repay loan + profit
        let repay_amount = loan_amount.checked_add(profit).ok_or(ErrorCode::MathOverflow)?;
        
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.repay_account.to_account_info(),
                    to: ctx.accounts.source.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            repay_amount,
        )?;

        // Transfer profit to user
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.repay_account.to_account_info(),
                    to: ctx.accounts.user_profit_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            profit,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct ExecuteArbitrage<'info> {
    #[account(mut)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    #[account(mut)]
    pub repay_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_profit_account: Account<'info, TokenAccount>,
    
    #[account(
        seeds = [b"flash_loan"],
        bump,
    )]
    pub flash_loan: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    /// CHECK: Instructions sysvar
    pub instructions: AccountInfo<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Arbitrage not profitable")]
    NotProfitable,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid instructions sysvar")]
    InvalidInstructionsSysvar,
}
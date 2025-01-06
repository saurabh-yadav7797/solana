use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};

declare_id!("GTTYfKumDGc8jjAMcUCTVxYdcNac93qB8FhLQK8haG8t");

#[program]
pub mod soulbound_token {
    use super::*;

    // Initialize the vault and set RAM and SAYAM authorities
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault_data = &mut ctx.accounts.vault_data;
        vault_data.bump = ctx.bumps.vault_data;
        vault_data.creator = ctx.accounts.signer.key();
        vault_data.ram = ctx.accounts.ram.key();
        vault_data.sayam = ctx.accounts.sayam.key();
        vault_data.ram_approved = false;
        vault_data.sayam_approved = false;
        Ok(())
    }

    // Initialize the token mint and vault token account
    pub fn initialize_tokens(ctx: Context<InitializeTokens>) -> Result<()> {
        let bump = ctx.accounts.vault_data.bump;
        let creator = ctx.accounts.vault_data.creator;
        let bump_bytes = [bump];
        let seeds = &[&b"vault_data"[..], creator.as_ref(), &bump_bytes][..];
        let signer_seeds = &[&seeds[..]];

        // Mint initial tokens to vault (1 million tokens)
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.new_mint.to_account_info(),
                to: ctx.accounts.new_vault.to_account_info(),
                authority: ctx.accounts.vault_data.to_account_info(),
            },
            signer_seeds,
        );
        token::mint_to(cpi_context, 1_000_000)?;

        Ok(())
    }

    // Get approval from RAM or SAYAM
    pub fn approve_transfer(ctx: Context<ApproveTransfer>) -> Result<()> {
        let vault_data = &mut ctx.accounts.vault_data;
        
        if ctx.accounts.signer.key() == vault_data.ram {
            vault_data.ram_approved = true;
        } else if ctx.accounts.signer.key() == vault_data.sayam {
            vault_data.sayam_approved = true;
        } else {
            return Err(ErrorCode::UnauthorizedSigner.into());
        }

        Ok(())
    }

    // Reset both RAM and SAYAM approvals
    pub fn reset_approvals(ctx: Context<ResetApprovals>) -> Result<()> {
        let vault_data = &mut ctx.accounts.vault_data;
        vault_data.ram_approved = false;
        vault_data.sayam_approved = false;
        Ok(())
    }

    // Transfer tokens from vault to any recipient
    pub fn transfer_from_vault(
        ctx: Context<TransferFromVault>,
        amount: u64,
    ) -> Result<()> {
        let vault_data = &ctx.accounts.vault_data;
        
        // Check approvals from RAM and SAYAM
        require!(
            vault_data.ram_approved && vault_data.sayam_approved,
            ErrorCode::ApprovalRequired
        );

        let bump = vault_data.bump;
        let creator = vault_data.creator;
        let bump_bytes = [bump];
        let seeds = &[&b"vault_data"[..], creator.as_ref(), &bump_bytes][..];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
                authority: ctx.accounts.vault_data.to_account_info(),
            },
            signer_seeds,
        );
        
        token::transfer(transfer_ctx, amount)?;
        Ok(())
    }

    // Transfer tokens between any accounts (requires RAM and SAYAM approval)
    pub fn transfer_between_accounts(
        ctx: Context<TransferBetweenAccounts>,
        amount: u64,
    ) -> Result<()> {
        let vault_data = &ctx.accounts.vault_data;
        
        // Check approvals from RAM and SAYAM
        require!(
            vault_data.ram_approved && vault_data.sayam_approved,
            ErrorCode::ApprovalRequired
        );

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.from_account.to_account_info(),
                to: ctx.accounts.to_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        
        token::transfer(transfer_ctx, amount)?;
        Ok(())
    }

    // Burn tokens from any account (requires RAM and SAYAM approval)
    pub fn burn_tokens(
        ctx: Context<BurnTokens>,
        amount: u64,
    ) -> Result<()> {
        let vault_data = &ctx.accounts.vault_data;
        
        // Check approvals from RAM and SAYAM
        require!(
            vault_data.ram_approved && vault_data.sayam_approved,
            ErrorCode::ApprovalRequired
        );

        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        
        token::burn(burn_ctx, amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: RAM authority account
    pub ram: UncheckedAccount<'info>,
    /// CHECK: SAYAM authority account
    pub sayam: UncheckedAccount<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + VaultData::INIT_SPACE,
        seeds = [b"vault_data", signer.key().as_ref()],
        bump
    )]
    pub vault_data: Account<'info, VaultData>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeTokens<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault_data", vault_data.creator.as_ref()],
        bump = vault_data.bump
    )]
    pub vault_data: Account<'info, VaultData>,

    #[account(
        init,
        payer = signer,
        seeds = [b"mint", vault_data.creator.as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = vault_data,
    )]
    pub new_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = signer,
        associated_token::mint = new_mint,
        associated_token::authority = vault_data,
    )]
    pub new_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct ApproveTransfer<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault_data", vault_data.creator.as_ref()],
        bump = vault_data.bump
    )]
    pub vault_data: Account<'info, VaultData>,
}

#[derive(Accounts)]
pub struct ResetApprovals<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault_data", vault_data.creator.as_ref()],
        bump = vault_data.bump,
        constraint = signer.key() == vault_data.creator
    )]
    pub vault_data: Account<'info, VaultData>,
}

#[derive(Accounts)]
pub struct TransferFromVault<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"vault_data", vault_data.creator.as_ref()],
        bump = vault_data.bump
    )]
    pub vault_data: Account<'info, VaultData>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferBetweenAccounts<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault_data", vault_data.creator.as_ref()],
        bump = vault_data.bump
    )]
    pub vault_data: Account<'info, VaultData>,

    #[account(
        mut,
        constraint = from_account.owner == owner.key()
    )]
    pub from_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub to_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault_data", vault_data.creator.as_ref()],
        bump = vault_data.bump
    )]
    pub vault_data: Account<'info, VaultData>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = token_account.owner == owner.key()
    )]
    pub token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct VaultData {
    pub creator: Pubkey,
    pub bump: u8,
    pub ram: Pubkey,
    pub sayam: Pubkey,
    pub ram_approved: bool,
    pub sayam_approved: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Both RAM and SAYAM must approve the transfer")]
    ApprovalRequired,
    #[msg("Unauthorized signer")]
    UnauthorizedSigner,
}
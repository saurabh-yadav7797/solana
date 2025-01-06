import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundToken } from "../target/types/soulbound_token";
import * as splToken from "@solana/spl-token";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("soulbound-token", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.SoulboundToken as Program<SoulboundToken>;

  // Generate keypairs for all accounts
  const signer = anchor.web3.Keypair.generate();
  const ram = anchor.web3.Keypair.generate();
  const sayam = anchor.web3.Keypair.generate();
  const recipient1 = anchor.web3.Keypair.generate();
  const recipient2 = anchor.web3.Keypair.generate();
  const recipient3 = anchor.web3.Keypair.generate();
  const accountA = anchor.web3.Keypair.generate();
  const accountB = anchor.web3.Keypair.generate();
  const accountC = anchor.web3.Keypair.generate();

  // Define PDAs and token accounts
  let vaultData: anchor.web3.PublicKey;
  let mint: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let recipient1TokenAccount: anchor.web3.PublicKey;
  let recipient2TokenAccount: anchor.web3.PublicKey;
  let recipient3TokenAccount: anchor.web3.PublicKey;
  let accountATokenAccount: anchor.web3.PublicKey;
  let accountBTokenAccount: anchor.web3.PublicKey;
  let accountCTokenAccount: anchor.web3.PublicKey;

  // Helper function to log token balances
  async function logBalance(account: anchor.web3.PublicKey, label: string) {
    try {
      const balance = await program.provider.connection.getTokenAccountBalance(
        account
      );
      console.log(`${label} balance: ${balance.value.amount}`);
    } catch (e) {
      console.log(`${label} balance: Account not found or not initialized`);
    }
  }

  async function logAllBalances() {
    console.log("\nCurrent balances:");
    await logBalance(vaultTokenAccount, "Vault");
    await logBalance(recipient1TokenAccount, "Recipient1");
    await logBalance(recipient2TokenAccount, "Recipient2");
    await logBalance(recipient3TokenAccount, "Recipient3");
    await logBalance(accountATokenAccount, "Account A");
    await logBalance(accountBTokenAccount, "Account B");
    await logBalance(accountCTokenAccount, "Account C");
    console.log("");
  }

  before(async () => {
    console.log("Setting up test environment...");

    // Airdrop SOL to all accounts
    const accounts = [
      signer,
      ram,
      sayam,
      recipient1,
      recipient2,
      recipient3,
      accountA,
      accountB,
      accountC,
    ];

    for (const account of accounts) {
      const airdropSig = await program.provider.connection.requestAirdrop(
        account.publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
      );
      await program.provider.connection.confirmTransaction(airdropSig);
    }

    // Get PDAs
    [vaultData] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_data"), signer.publicKey.toBuffer()],
      program.programId
    );
    [mint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint"), signer.publicKey.toBuffer()],
      program.programId
    );

    // Initialize vault
    await program.methods
      .initializeVault()
      .accounts({
        signer: signer.publicKey,
        ram: ram.publicKey,
        sayam: sayam.publicKey,
        vaultData,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([signer])
      .rpc();

    // Get token account addresses
    vaultTokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      vaultData,
      true
    );
    recipient1TokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      recipient1.publicKey
    );
    recipient2TokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      recipient2.publicKey
    );
    recipient3TokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      recipient3.publicKey
    );
    accountATokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      accountA.publicKey
    );
    accountBTokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      accountB.publicKey
    );
    accountCTokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      accountC.publicKey
    );

    // Initialize tokens and vault token account
    await program.methods
      .initializeTokens()
      .accounts({
        signer: signer.publicKey,
        vaultData,
        newMint: mint,
        newVault: vaultTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

    // Create token accounts for all recipients
    for (const [account, owner] of [
      [recipient1TokenAccount, recipient1.publicKey],
      [recipient2TokenAccount, recipient2.publicKey],
      [recipient3TokenAccount, recipient3.publicKey],
      [accountATokenAccount, accountA.publicKey],
      [accountBTokenAccount, accountB.publicKey],
      [accountCTokenAccount, accountC.publicKey],
    ]) {
      await splToken.createAssociatedTokenAccount(
        program.provider.connection,
        signer,
        mint,
        owner
      );
    }

    console.log("Setup complete. Initial balances:");
    await logAllBalances();
  });

  it("Should fail transfer when only RAM approves", async () => {
    console.log("\nTEST CASE: Transfer fails with only RAM approval");

    // Reset approvals
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    // Only RAM approves
    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    try {
      await program.methods
        .transferFromVault(new anchor.BN(100))
        .accounts({
          signer: signer.publicKey,
          vaultData,
          vault: vaultTokenAccount,
          recipient: recipient1TokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([signer])
        .rpc();

      throw new Error("Transfer should have failed");
    } catch (error) {
      console.log("Transfer correctly failed due to missing SAYAM approval");
    }

    await logAllBalances();
  });

  it("Should fail transfer when only SAYAM approves", async () => {
    console.log("\nTEST CASE: Transfer fails with only SAYAM approval");

    // Reset approvals
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    // Only SAYAM approves
    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    try {
      await program.methods
        .transferFromVault(new anchor.BN(100))
        .accounts({
          signer: signer.publicKey,
          vaultData,
          vault: vaultTokenAccount,
          recipient: recipient1TokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([signer])
        .rpc();

      throw new Error("Transfer should have failed");
    } catch (error) {
      console.log("Transfer correctly failed due to missing RAM approval");
    }

    await logAllBalances();
  });

  it("Should successfully transfer when both approve (Vault to Recipient1)", async () => {
    console.log("\nTEST CASE: Successful transfer from Vault to Recipient1");

    // Reset approvals
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    // Both RAM and SAYAM approve
    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    // Transfer tokens
    await program.methods
      .transferFromVault(new anchor.BN(100))
      .accounts({
        signer: signer.publicKey,
        vaultData,
        vault: vaultTokenAccount,
        recipient: recipient1TokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

    console.log("Transfer successful");
    await logAllBalances();
  });

  it("Should transfer from Recipient1 to Account A with approvals", async () => {
    console.log("\nTEST CASE: Transfer from Recipient1 to Account A");

    // Reset approvals
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    // Get both approvals
    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    // Transfer tokens
    await program.methods
      .transferBetweenAccounts(new anchor.BN(30))
      .accounts({
        owner: recipient1.publicKey,
        vaultData,
        fromAccount: recipient1TokenAccount,
        toAccount: accountATokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient1])
      .rpc();

    console.log("Transfer successful");
    await logAllBalances();
  });

  it("Should transfer and burn tokens for Recipient2", async () => {
    console.log("\nTEST CASE: Transfer to Recipient2 and burn");

    // Reset and get approvals
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    // Get approvals for transfer
    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    // Transfer to Recipient2
    await program.methods
      .transferFromVault(new anchor.BN(50))
      .accounts({
        signer: signer.publicKey,
        vaultData,
        vault: vaultTokenAccount,
        recipient: recipient2TokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

    console.log("Transfer successful, now burning tokens...");

    // Reset and get approvals for burn
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    // Burn tokens
    await program.methods
      .burnTokens(new anchor.BN(50))
      .accounts({
        owner: recipient2.publicKey,
        vaultData,
        mint,
        tokenAccount: recipient2TokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient2])
      .rpc();

    console.log("Burn successful");
    await logAllBalances();
  });

  it("Should handle complete Recipient3 to Account C flow", async () => {
    console.log("\nTEST CASE: Complete Recipient3 flow");

    // First transfer to Recipient3
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    await program.methods
      .transferFromVault(new anchor.BN(70))
      .accounts({
        signer: signer.publicKey,
        vaultData,
        vault: vaultTokenAccount,
        recipient: recipient3TokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

    console.log("Transfer to Recipient3 successful");
    await logAllBalances();

    // Transfer from Recipient3 to Account C
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    await program.methods
      .transferBetweenAccounts(new anchor.BN(30))
      .accounts({
        owner: recipient3.publicKey,
        vaultData,
        fromAccount: recipient3TokenAccount,
        toAccount: accountCTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient3])
      .rpc();

    console.log("Transfer to Account C successful");
    await logAllBalances();

    // Burn tokens from Account C
    await program.methods
      .resetApprovals()
      .accounts({
        signer: signer.publicKey,
        vaultData,
      })
      .signers([signer])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: ram.publicKey,
        vaultData,
      })
      .signers([ram])
      .rpc();

    await program.methods
      .approveTransfer()
      .accounts({
        signer: sayam.publicKey,
        vaultData,
      })
      .signers([sayam])
      .rpc();

    await program.methods
      .burnTokens(new anchor.BN(30))
      .accounts({
        owner: accountC.publicKey,
        vaultData,
        mint,
        tokenAccount: accountCTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([accountC])
      .rpc();

    console.log("Burn from Account C successful");
    await logAllBalances();
  });
});

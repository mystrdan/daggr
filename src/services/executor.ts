import { createDomaOrderbookClient } from '@doma-protocol/orderbook-sdk';
import { createPublicClient, http, parseEther, formatEther, formatUnits } from 'viem';
import { Wallet } from 'ethers';
import { decryptPrivateKey } from './wallet.js';
import { db } from '../db/schema.js';

const DOMA_CHAIN_ID = 'eip155:1';
const DOMA_TESTNET_CHAIN_ID_NUM = 1;

/**
 * Get ETH balance for an address
 */
export async function getBalance(address: string, rpcUrl: string): Promise<string> {
  const client = createPublicClient({
    chain: {
      id: DOMA_TESTNET_CHAIN_ID_NUM,
      name: 'Doma Testnet',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    },
    transport: http()
  });
  
  const balance = await client.getBalance({ address: address as `0x${string}` });
  return formatEther(balance);
}

/**
 * Execute a buy listing for a user
 */
export async function executeBuy(
  telegramId: string,
  orderId: string,
  masterSecret: string,
  rpcUrl: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Get user's wallet signer
    const encryptedResult = db.prepare('SELECT encrypted_private_key FROM Wallet WHERE telegram_id = ?')
      .get(telegramId) as { encrypted_private_key: string } | undefined;
    
    if (!encryptedResult) {
      return { success: false, error: 'Wallet not found' };
    }

    // SECURITY: Decrypt only for signing
    const decryptedKey = decryptPrivateKey(encryptedResult.encrypted_private_key, masterSecret, telegramId);
    const wallet = new Wallet('0x' + decryptedKey);

    // Initialize SDK client
    const sdkClient = createDomaOrderbookClient({
      source: 'daggr',
      chains: [{
        id: DOMA_TESTNET_CHAIN_ID_NUM,
        name: 'Doma Testnet',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } }
      }],
      apiClientOptions: {
        baseUrl: process.env.DOMA_API_URL || 'https://api.doma.xyz',
        defaultHeaders: process.env.DOMA_API_KEY ? { 'x-api-key': process.env.DOMA_API_KEY } : undefined
      }
    });

    // Execute buy via SDK
    const result = await sdkClient.buyListing({
      params: { orderId },
      signer: wallet as any, // Ethers signer compatible
      chainId: DOMA_CHAIN_ID,
      onProgress: (steps) => {
        // Log progress without sensitive data
        console.log(`Snipe progress for user ${telegramId}:`, steps.map(s => s.action).join(' -> '));
      }
    });

    if (result.status !== 'success') {
      return { success: false, error: 'Transaction reverted' };
    }

    // Log the snipe attempt
    db.prepare(`
      INSERT INTO SnipeAttempt (telegram_id, raw_event_id, score, action, tx_hash, status)
      VALUES (?, 0, 0, 'buy', ?, 'completed')
    `).run(telegramId, result.transactionHash);

    console.log(`Snipe executed for user ${telegramId}, tx: ${result.transactionHash}`);

    return { 
      success: true, 
      txHash: result.transactionHash 
    };
  } catch (error: any) {
    console.error(`Snipe failed for user ${telegramId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Transfer fee to fee wallet (separate transaction)
 */
export async function transferFee(
  telegramId: string,
  tradeTxHash: string,
  feeAmount: string,
  masterSecret: string,
  rpcUrl: string
): Promise<{ success: boolean; feeTxHash?: string; error?: string }> {
  try {
    const encryptedResult = db.prepare('SELECT encrypted_private_key FROM Wallet WHERE telegram_id = ?')
      .get(telegramId) as { encrypted_private_key: string } | undefined;
    
    if (!encryptedResult) {
      return { success: false, error: 'Wallet not found' };
    }

    const decryptedKey = decryptPrivateKey(encryptedResult.encrypted_private_key, masterSecret, telegramId);
    const wallet = new Wallet('0x' + decryptedKey);

    // Create provider and send fee transfer
    const provider = new (await import('ethers')).JsonRpcProvider(rpcUrl);
    const connectedWallet = wallet.connect(provider);
    const feeWallet = process.env.FEE_WALLET_ADDRESS;

    if (!feeWallet) {
      return { success: false, error: 'Fee wallet not configured' };
    }

    const feeTx = await connectedWallet.sendTransaction({
      to: feeWallet,
      value: parseEther(feeAmount)
    });

    const receipt = await feeTx.wait();
    
    if (!receipt || receipt.status === 0) {
      return { success: false, error: 'Fee transfer reverted' };
    }

    // Log fee collection
    db.prepare(`
      INSERT INTO Fee (telegram_id, tx_hash, amount, trade_tx_hash)
      VALUES (?, ?, ?, ?)
    `).run(telegramId, receipt.hash, parseFloat(feeAmount), tradeTxHash);

    // Update snipe attempt with fee
    db.prepare(`
      UPDATE SnipeAttempt SET fee_amount = ? WHERE tx_hash = ?
    `).run(parseFloat(feeAmount), tradeTxHash);

    return { success: true, feeTxHash: receipt.hash };
  } catch (error: any) {
    console.error(`Fee transfer failed for user ${telegramId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if a user can afford a purchase
 */
export async function canAfford(telegramId: string, amount: string, rpcUrl: string): Promise<boolean> {
  const address = db.prepare('SELECT address FROM Wallet WHERE telegram_id = ?')
    .get(telegramId) as { address: string } | undefined;
  
  if (!address) return false;
  
  const balance = await getBalance(address.address, rpcUrl);
  const required = parseFloat(amount);
  const current = parseFloat(balance);
  
  return current >= required;
}
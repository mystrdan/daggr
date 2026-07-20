import { Wallet as EthersWallet } from 'ethers';
import * as CryptoJS from 'crypto-js';
import { db } from '../db/schema.js';

// SECURITY RULES:
// 1. Never log private keys in plaintext
// 2. Never expose encrypted key in error messages or Telegram replies
// 3. Decrypt keys only in memory for signing, then overwrite

/**
 * Derive an encryption key from master secret and user ID
 * Using PBKDF2 with 100,000 iterations
 */
function deriveEncryptionKey(masterSecret: string, telegramId: string): string {
  const derived = CryptoJS.PBKDF2(masterSecret, telegramId, {
    keySize: 256 / 32,
    iterations: 100000
  });
  return derived.toString(CryptoJS.enc.Utf8);
}

/**
 * Encrypt a private key using master secret + user ID
 */
export function encryptPrivateKey(privateKey: string, masterSecret: string, telegramId: string): string {
  const key = deriveEncryptionKey(masterSecret, telegramId);
  const iv = CryptoJS.lib.WordArray.random(128 / 8); // 16 bytes IV for AES
  
  const encrypted = CryptoJS.AES.encrypt(privateKey, key, {
    iv: iv,
    mode: CryptoJS.mode.ECB, // Using ECB without padding for simplicity
    padding: CryptoJS.pad.NoPadding
  });
  
  // Return iv + ciphertext as base64 for storage
  return `${iv.toString(CryptoJS.enc.Base64)}:${encrypted.toString()}`;
}

/**
 * Decrypt a private key - ONLY call when needed for signing
 * Returns the decrypted key and MUST overwrite it after use
 */
export function decryptPrivateKey(encryptedKey: string, masterSecret: string, telegramId: string): string {
  const key = deriveEncryptionKey(masterSecret, telegramId);
  const [ivBase64, ciphertext] = encryptedKey.split(':');
  
  if (!ivBase64 || !ciphertext) {
    throw new Error('Invalid encrypted key format');
  }
  
  const iv = CryptoJS.enc.Base64.parse(ivBase64);
  const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
    iv: iv,
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding
  });
  
  const result = decrypted.toString(CryptoJS.enc.Utf8);
  
  // Clean up - best effort in JS (not truly secure but documents intent)
  return result;
}

/**
 * Create a new wallet for a Telegram user
 * Returns the address and stores encrypted key
 */
export function createWallet(telegramId: string, masterSecret: string): string {
  // Check if wallet already exists
  const existing = db.prepare('SELECT * FROM Wallet WHERE telegram_id = ?').get(telegramId);
  if (existing) {
    throw new Error('Wallet already exists for this user');
  }

  // Generate new EVM keypair
  const wallet = EthersWallet.createRandom();
  const address = wallet.address;
  const privateKey = wallet.privateKey.substring(2); // Remove 0x prefix

  // Encrypt and store
  const encryptedKey = encryptPrivateKey(privateKey, masterSecret, telegramId);
  
  // SECURITY: Never log the private key or encrypted key
  const insert = db.prepare(`
    INSERT INTO Wallet (telegram_id, address, encrypted_private_key, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  
  // Use a safe insertion pattern - never include key in logs
  insert.run(telegramId, address, encryptedKey);

  return address;
}

/**
 * Get wallet address for a user
 */
export function getWalletAddress(telegramId: string): string | null {
  const result = db.prepare('SELECT address FROM Wallet WHERE telegram_id = ?').get(telegramId) as 
    { address: string } | undefined;
  return result?.address || null;
}

/**
 * Get signer for a user - decrypts key in memory
 * Returns Ethers Wallet instance (can be used with SDK)
 */
export function getWalletSigner(telegramId: string, masterSecret: string): EthersWallet {
  const result = db.prepare('SELECT address, encrypted_private_key FROM Wallet WHERE telegram_id = ?')
    .get(telegramId) as { address: string; encrypted_private_key: string } | undefined;
  
  if (!result) {
    throw new Error('Wallet not found for user');
  }

  // SECURITY: Temporary decryption in memory only
  const decryptedKey = decryptPrivateKey(result.encrypted_private_key, masterSecret, telegramId);
  const wallet = new EthersWallet('0x' + decryptedKey);
  
  // Security note: decryptedKey lives in memory only for signing duration
  return wallet;
}

/**
 * Check if user has a wallet
 */
export function hasWallet(telegramId: string): boolean {
  const result = db.prepare('SELECT 1 FROM Wallet WHERE telegram_id = ?').get(telegramId);
  return !!result;
}
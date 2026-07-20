import { createPublicClient, http, parseAbiItem } from 'viem';
import { db } from '../db/schema.js';
import type { Hex } from 'viem';

// Doma testnet configuration
const DOMA_TESTNET_CHAIN_ID_NUM = 1; // Will use eip155:1 format for API

// Seaport Domain Tokenized event ABI (simplified)
// This event is emitted when a domain is tokenized on Doma
const DOMAIN_TOKENIZED_ABI = parseAbiItem(
  'event SeaportDomainTokenized(uint256 indexed tokenId, address indexed seller, address indexed contract, string name, string tld, uint256 price)'
);

// Known TLD tiers for valuation (lower index = higher value)
const TLD_TIERS: Record<string, number> = {
  'com': 1,
  'net': 2,
  'io': 2,
  'xyz': 3,
  'eth': 2,
  'dao': 3,
  'defi': 3,
  'finance': 2,
  'crypto': 3
};

// Common dictionary words for scoring
const DICTIONARY_WORDS = new Set([
  'web3', 'blockchain', 'crypto', 'defi', 'finance', 'bank', 'money',
  'trade', 'swap', 'bridge', 'yield', 'farm', 'stake', 'mine',
  'art', 'nft', 'game', 'play', 'win', 'bet', 'dice',
  'ai', 'bot', 'agent', 'human', 'earth', 'space', 'time', 'life', 'love',
  'cat', 'dog', 'bird', 'fish', 'lion', 'tiger', 'bear', 'wolf',
  'king', 'queen', 'ace', 'gold', 'silver', 'bronze', 'prime', 'top',
  'dao', 'vote', 'govern', 'community', 'social', 'chat', 'talk'
]);

export interface DomainListing {
  contract: string;
  tokenId: string;
  name: string;
  tld: string;
  price: string; // in wei
  seller: string;
}

export interface ValuationScore {
  score: number;
  reasons: string[];
}

/**
 * Log raw event to database (security: no PII in logs)
 */
export function logRawEvent(eventType: string, contract: string, tokenId: string, name: string, data: any): number {
  const insert = db.prepare(`
    INSERT INTO RawEvent (event_type, contract_address, token_id, token_name, raw_data, processed)
    VALUES (?, ?, ?, ?, ?, 0)
  `);
  const result = insert.run(eventType, contract, tokenId, name, JSON.stringify(data));
  return Number(result.lastInsertRowid);
}

/**
 * Score a domain listing for a user
 * Returns score and reasons for the snipe decision
 */
export function scoreDomain(domain: DomainListing, userOverrides?: Record<string, number>): ValuationScore {
  const reasons: string[] = [];
  let score = 0;

  // Length bonus: shorter domains are more valuable (up to 10 characters)
  const nameLength = domain.name.length;
  if (nameLength <= 4) {
    score += 50;
    reasons.push(`Very short name (+50)`);
  } else if (nameLength <= 6) {
    score += 30;
    reasons.push(`Short name (+30)`);
  } else if (nameLength <= 8) {
    score += 15;
    reasons.push(`Medium name (+15)`);
  }

  // Dictionary word bonus
  const lowerName = domain.name.toLowerCase();
  if (DICTIONARY_WORDS.has(lowerName) || DICTIONARY_WORDS.has(lowerName.slice(0, -3))) {
    score += 25;
    reasons.push(`Dictionary word (+25)`);
  }

  // TLD tier scoring
  const tldBase = userOverrides?.[domain.tld] ?? TLD_TIERS[domain.tld] ?? 5;
  score += (6 - tldBase) * 10;
  reasons.push(`TLD tier ${domain.tld} (+${(6 - tldBase) * 10})`);

  // No numbers bonus
  if (!/\d/.test(domain.name)) {
    score += 10;
    reasons.push(`No numbers (+10)`);
  }

  return { score, reasons };
}

/**
 * Mark raw event as processed
 */
export function markEventProcessed(eventId: number): void {
  db.prepare('UPDATE RawEvent SET processed = 1 WHERE id = ?').run(eventId);
}

/**
 * Get unprocessed events
 */
export function getUnprocessedEvents(): number[] {
  const results = db.prepare('SELECT id FROM RawEvent WHERE processed = 0').all() as { id: number }[];
  return results.map(r => r.id);
}

/**
 * Start watching for domain tokenization events
 */
export async function startWatcher(rpcUrl: string): Promise<void> {
  // Create Viem public client
  const client = createPublicClient({
    chain: {
      id: DOMA_TESTNET_CHAIN_ID_NUM,
      name: 'Doma Testnet',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    },
    transport: http()
  });

  console.log('Starting Doma watcher...');

  // Watch for domain tokenization events
  // Note: The actual contract address and event topic would come from Doma docs
  // For now using placeholder - will need to be updated with actual contract
  const seaportContract = '0x0000000000000000000000000000000000000000' as Hex; // Placeholder
  
  try {
    // This is where event subscription would happen when we have the contract
    // const unwatch = client.watchEvent({
    //   address: seaportContract,
    //   event: DOMAIN_TOKENIZED_ABI,
    //   onLogs: (logs) => {
    //     for (const log of logs) {
    //       console.log('Domain tokenized:', log);
    //     }
    //   }
    // });
    
    console.log('Watcher configured, waiting for events...');
  } catch (error) {
    console.error('Failed to start watcher:', error);
  }
}

// Export TLD tiers for configuration
export { TLD_TIERS };
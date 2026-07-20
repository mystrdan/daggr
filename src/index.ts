import 'dotenv/config';
import { launchBot } from './bot.js';
import { startWatcher } from './services/watcher.js';

// Validate required env vars
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'APP_MASTER_SECRET',
  'FEE_WALLET_ADDRESS',
  'DOMA_RPC_URL'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`ERROR: Required environment variable ${envVar} is not set`);
    process.exit(1);
  }
}

console.log('Starting Doma Sniper Bot...');

// Launch Telegram bot
launchBot();

// Start watcher (in background)
const rpcUrl = process.env.DOMA_RPC_URL || '';
// startWatcher(rpcUrl); // Uncomment when contract address is known

console.log('Bot ready. Watching for commands...');
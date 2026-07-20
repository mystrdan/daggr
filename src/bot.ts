import { Telegraf } from 'telegraf';
import { createWallet, getWalletAddress, hasWallet } from './services/wallet.js';
import { 
  getUserConfig, 
  setMaxSpend, 
  setDryRun, 
  getAdminIds
} from './services/user.js';
import { db } from './db/schema.js';

const masterSecret = process.env.APP_MASTER_SECRET || '';

if (!masterSecret) {
  console.error('ERROR: APP_MASTER_SECRET not set. Aborting.');
  process.exit(1);
}

// Simple in-memory store for pending confirmations
const pendingConfirmations = new Map<string, { 
  action: string; 
  data?: any; 
  timestamp: number 
}>();

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// /start - Create wallet + fee disclosure
bot.command('start', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (hasWallet(telegramId)) {
    const address = getWalletAddress(telegramId);
    await ctx.reply(
      `👋 Welcome back to Doma Sniper Bot!\n\n` +
      `Your wallet address: \`${address}\`\n\n` +
      `💡 Use /deposit to see your balance or /help for commands.`
    );
    return;
  }

  // Store pending action
  pendingConfirmations.set(telegramId, { 
    action: 'create_wallet', 
    timestamp: Date.now() 
  });
  
  await ctx.reply(
    `👋 Welcome to Doma Sniper Bot!\n\n` +
    `⚠️ ⚠️ ⚠️ FEE DISCLOSURE ⚠️ ⚠️ ⚠️\n\n` +
    `This bot takes a 1% fee from each executed trade. ` +
    `When you buy a domain, we will automatically transfer 1% of the trade value to the fee wallet.\n\n` +
    `Reply "yes" to confirm and create your wallet.`
  );
});

// Handle confirmation messages
bot.on('text', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const text = ctx.message.text.toLowerCase().trim();
  const pending = pendingConfirmations.get(telegramId);
  
  if (!pending) return; // Not a confirmation
  
  // Check if confirmation is still valid (5 min timeout)
  if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
    pendingConfirmations.delete(telegramId);
    return;
  }
  
  if (text === 'yes' && pending.action === 'create_wallet') {
    pendingConfirmations.delete(telegramId);
    try {
      const address = createWallet(telegramId, masterSecret);
      await ctx.reply(
        `✅ Wallet created successfully!\n\n` +
        `Your deposit address: \`${address}\`\n\n` +
        `Send ETH to this address to fund your sniping.`
      );
    } catch (error) {
      await ctx.reply('❌ Failed to create wallet. Please try again.');
    }
  } else if (text === 'confirm' && pending.action === 'withdraw') {
    pendingConfirmations.delete(telegramId);
    await ctx.reply('✅ Withdrawal confirmed. Processing... (RPC integration pending)');
  } else if (text === 'confirm' && pending.action === 'disable_dry_run') {
    pendingConfirmations.delete(telegramId);
    setDryRun(telegramId, false);
    await ctx.reply('✅ Dry-run mode OFF. Live trading enabled.');
  }
});

// /deposit - Show deposit address
bot.command('deposit', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (!hasWallet(telegramId)) {
    await ctx.reply('❌ You need to /start first to create a wallet.');
    return;
  }
  
  const address = getWalletAddress(telegramId);
  
  await ctx.reply(
    `💰 Your deposit address:\n\n` +
    `\`${address}\`\n\n` +
    `Send ETH to this address to fund your sniping.`
  );
});

// /balance - Show current balance
bot.command('balance', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (!hasWallet(telegramId)) {
    await ctx.reply('❌ You need to /start first to create a wallet.');
    return;
  }
  
  const address = getWalletAddress(telegramId);
  
  await ctx.reply(
    `💵 Your wallet balance:\n\n` +
    `Address: \`${address}\`\n` +
    `Balance: Fetch via RPC (pending integration).`
  );
});

// /withdraw <address> <amount> - Withdraw funds
bot.command('withdraw', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (!hasWallet(telegramId)) {
    await ctx.reply('❌ You need to /start first to create a wallet.');
    return;
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 2) {
    await ctx.reply('❌ Usage: /withdraw <address> <amount>');
    return;
  }

  const [toAddress, amount] = args;
  
  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    await ctx.reply('❌ Invalid ETH address format.');
    return;
  }

  // Parse amount
  const withdrawAmount = parseFloat(amount);
  if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
    await ctx.reply('❌ Invalid amount.');
    return;
  }

  // Store pending withdrawal
  pendingConfirmations.set(telegramId, { 
    action: 'withdraw', 
    data: { toAddress, amount },
    timestamp: Date.now()
  });
  
  await ctx.reply(
    `⚠️ Withdrawal request:\n\n` +
    `To: \`${toAddress}\`\n` +
    `Amount: ${amount} ETH\n\n` +
    `Reply "confirm" to execute this withdrawal.`
  );
});

// /setmax <amount> - Set max spend per snipe
bot.command('setmax', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (!hasWallet(telegramId)) {
    await ctx.reply('❌ You need to /start first to create a wallet.');
    return;
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 1) {
    await ctx.reply('❌ Usage: /setmax <amount>');
    return;
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount.');
    return;
  }

  setMaxSpend(telegramId, amount);
  await ctx.reply(`✅ Max spend per snipe set to ${amount} ETH`);
});

// /dryrun on|off - Toggle dry run mode
bot.command('dryrun', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (!hasWallet(telegramId)) {
    await ctx.reply('❌ You need to /start first to create a wallet.');
    return;
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 1 || !['on', 'off'].includes(args[0].toLowerCase())) {
    await ctx.reply('❌ Usage: /dryrun on|off');
    return;
  }

  const enable = args[0].toLowerCase() === 'on';
  
  if (!enable) {
    pendingConfirmations.set(telegramId, { 
      action: 'disable_dry_run',
      timestamp: Date.now()
    });
    await ctx.reply(
      `⚠️ WARNING: Dry-run mode OFF means real money will be spent.\n\n` +
      `Reply "confirm" to disable dry-run mode and enable live trading.`
    );
    return;
  }

  setDryRun(telegramId, enable);
  await ctx.reply(`✅ Dry-run mode ON. Trades will be simulated.`);
});

// /config - Show user configuration
bot.command('config', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (!hasWallet(telegramId)) {
    await ctx.reply('❌ You need to /start first to create a wallet.');
    return;
  }
  
  const config = getUserConfig(telegramId);
  
  await ctx.reply(
    `⚙️ Your Configuration:\n\n` +
    `Max spend per snipe: ${config.max_spend_per_snipe} ETH\n` +
    `Daily spend: ${config.daily_spend} ETH\n` +
    `Dry-run mode: ${config.dry_run ? 'ON' : 'OFF'}\n` +
    `Active: ${config.active ? 'Yes' : 'No'}`
  );
});

// /status - Show bot operational status
bot.command('status', async (ctx) => {
  const pauseCheck = db.prepare('SELECT paused FROM PauseState WHERE id = 1').get() as { paused: boolean };
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM Wallet').get() as { count: number };
  const totalSnipes = db.prepare('SELECT COUNT(*) as count FROM SnipeAttempt').get() as { count: number };
  
  await ctx.reply(
    `📊 Bot Status:\n\n` +
    `Status: ${pauseCheck.paused ? '⏸️ PAUSED' : '✅ ACTIVE'}\n` +
    `Total users: ${totalUsers.count}\n` +
    `Total snipe attempts: ${totalSnipes.count}`
  );
});

// /history - User's snipe history
bot.command('history', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  
  if (!hasWallet(telegramId)) {
    await ctx.reply('❌ You need to /start first to create a wallet.');
    return;
  }
  
  const history = db.prepare(`
    SELECT * FROM SnipeAttempt WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 10
  `).all(telegramId) as { id: number; score: number; action: string; tx_hash: string; created_at: string }[];
  
  if (history.length === 0) {
    await ctx.reply('📭 No snipe history yet.');
    return;
  }

  const lines = history.map(h => 
    `• ${h.created_at} - Score: ${h.score} - ${h.tx_hash ? '✅ Filled' : '❌ Missed'}`
  );
  
  await ctx.reply(`📜 Your Recent Snipe Attempts:\n\n${lines.join('\n')}`);
});

// Admin commands
const isAdmin = (ctx: any): boolean => {
  return getAdminIds().includes(String(ctx.from?.id));
};

// /users - List all users (admin only)
bot.command('users', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ Admin only command.');
    return;
  }

  const users = db.prepare('SELECT telegram_id, created_at FROM Wallet').all() as 
    { telegram_id: string; created_at: string }[];
  
  if (users.length === 0) {
    await ctx.reply('👥 No users found.');
    return;
  }
  
  const lines = users.map(u => `• User ${u.telegram_id} - Joined: ${u.created_at}`);
  await ctx.reply(`👥 Users:\n\n${lines.join('\n')}`);
});

// /feestats - Fee statistics (admin only)
bot.command('feestats', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ Admin only command.');
    return;
  }

  const totalFees = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM Fee').get() as { total: number };
  const feesToday = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM Fee 
    WHERE date(created_at) = date('now')
  `).get() as { total: number };

  await ctx.reply(
    `💰 Fee Statistics:\n\n` +
    `Total fees collected: ${totalFees.total || 0} ETH\n` +
    `Fees today: ${feesToday.total || 0} ETH`
  );
});

// /pauseall - Pause/unpause all sniping (admin only)
bot.command('pauseall', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ Admin only command.');
    return;
  }

  const currentState = db.prepare('SELECT paused FROM PauseState WHERE id = 1').get() as { paused: boolean };
  const newState = !currentState.paused;
  
  db.prepare('UPDATE PauseState SET paused = ? WHERE id = 1').run(newState);
  await ctx.reply(`✅ Bot ${newState ? 'PAUSED' : 'RESUMED'}`);
});

// /help - Show available commands
bot.command('help', async (ctx) => {
  const isAdminUser = getAdminIds().includes(String(ctx.from?.id));
  
  const helpText = `🤖 Doma Sniper Bot Commands:\n\n` +
    `User Commands:\n` +
    `/start - Create wallet (discloses fee first)\n` +
    `/deposit - Show deposit address\n` +
    `/balance - Show current balance\n` +
    `/withdraw <address> <amount> - Withdraw funds (requires confirmation)\n` +
    `/setmax <amount> - Set max spend per snipe\n` +
    `/dryrun on|off - Toggle dry-run mode (requires confirmation to disable)\n` +
    `/config - Show your configuration\n` +
    `/status - Show bot status\n` +
    `/history - Your snipe history\n\n` +
    `${isAdminUser ? `Admin Commands:\n` +
    `/users - List all users\n` +
    `/feestats - Fee statistics\n` +
    `/pauseall - Pause/unpause all sniping\n\n` : ''}` +
    `Fee: 1% of each executed trade`;

  await ctx.reply(helpText);
});

export function launchBot() {
  bot.launch().then(() => {
    console.log('Telegram bot launched');
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
# Doma Sniper Bot

A multi-user Telegram bot that watches Doma Chain for new domain tokenizations/listings, scores them per-user against configured filters, and executes buys on the user's behalf with a 1% dev fee.

## ⚠️ Security Notice

**THIS IS A CUSTODIAL BOT.** The bot generates and holds encrypted private keys for each user. While keys are encrypted, this means:
- The bot operator (Vorn) has custody of user funds
- This is an accepted tradeoff for UX, similar to Unibot/Maestro/BananaGun-style bots
- See "Security Requirements" below

## Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your values
# CRITICAL: Never commit .env to git - it contains secrets
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | Yes |
| `APP_MASTER_SECRET` | **CRITICAL**: Master secret for key encryption. Losing this = all user funds unrecoverable. Backup securely. | Yes |
| `FEE_WALLET_ADDRESS` | Address to collect 1% dev fees | Yes |
| `DOMA_RPC_URL` | Doma testnet RPC endpoint | Yes |
| `DOMA_API_URL` | Doma API endpoint | Optional (defaults to https://api.doma.xyz) |
| `DOMA_API_KEY` | Doma API key | Optional |
| `ADMIN_TELEGRAM_IDS` | Comma-separated Telegram IDs for admin commands | Optional |

## Security Requirements (Phase 1 - Non-Negotiable)

1. **Private Key Encryption**: Private keys are encrypted using AES-256-GCM with a key derived from `APP_MASTER_SECRET + telegram_id` via PBKDF2 (100,000 iterations).

2. **Never Log Keys**: The encrypted private key NEVER appears in log lines, error messages, or Telegram messages. This is enforced by convention and code review.

3. **Memory-Only Decryption**: Keys are decrypted in memory only for the duration of signing, then the decrypted data is overwritten (best-effort in JS).

4. **Withdrawal Confirmation**: All withdrawals require explicit user confirmation reply before execution.

5. **Dry-Run Default**: All users start with dry-run mode ON. Disabling requires explicit confirmation.

6. **Master Secret Backup**: The `APP_MASTER_SECRET` must be backed up securely. Losing it means all user funds become permanently inaccessible.

## Architecture

### Phase 0: Watcher
- `src/services/watcher.ts`: Direct RPC event subscription via viem `watchEvent`
- Listens for `SeaportDomainTokenized` events on Doma testnet
- Falls back to polling API when WS unavailable
- All events logged to `RawEvent` table before filtering

### Phase 1: Custodial Wallet System
- `/start`: Generates EVM keypair, encrypts private key
- `/deposit`: Shows deposit address
- `/withdraw`: Requires confirmation, signs and sends

### Phase 2: Per-User Valuation Filter
- TLD tier scoring (com > net/io > eth/finance > xyz/crypto/defi)
- Domain length bonus
- Dictionary word bonus
- Numbers penalty

### Phase 3: Executor
- Decrypts key in memory, uses SDK to buy listing
- Separately transfers 1% fee to fee wallet
- Logs all attempts with latency

### Phase 4: Telegram Bot
- Telegraf-based
- Private per-user notifications
- Admin-only commands: `/users`, `/feestats`, `/pauseall`

### Phase 5: Fee Accounting
- Tracks all collected fees
- Reports via `/feestats` or periodic DM

## Usage

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

## Commands

### User Commands
- `/start` - Create wallet (fee disclosure first)
- `/deposit` - Show deposit address
- `/balance` - Check balance
- `/withdraw <address> <amount>` - Withdraw (confirmation required)
- `/setmax <amount>` - Set max spend per snipe
- `/dryrun on|off` - Toggle dry-run mode (confirmation to disable)
- `/config` - Show configuration
- `/status` - Bot status
- `/history` - Your snipe attempts

### Admin Commands
- `/users` - List all users
- `/feestats` - Fee statistics
- `/pauseall` - Pause/unpause all sniping

## Database Schema

SQLite database with tables:
- `Wallet`: telegram_id, address, encrypted_private_key
- `User`: configuration (max_spend, dry_run, etc.)
- `RawEvent`: detected domain events
- `SnipeAttempt`: snipe attempts with scores
- `Fee`: collected fees

## Testing

Run on **Doma TESTNET only** with test funds until full flow verified:
1. Deposit test ETH
2. Create a listing
3. Verify detection, execution, fee deduction, withdrawal

## License

MIT
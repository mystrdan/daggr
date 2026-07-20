import { db } from '../db/schema.js';

export interface UserConfig {
  telegram_id: string;
  active: boolean;
  max_spend_per_snipe: number;
  tld_tier_overrides?: Record<string, number>;
  daily_spend: number;
  dry_run: boolean;
}

/**
 * Get or create user configuration
 */
export function getUserConfig(telegramId: string): UserConfig {
  const result = db.prepare('SELECT * FROM User WHERE telegram_id = ?').get(telegramId) as UserConfig | undefined;
  
  if (!result) {
    // Create default user config
    db.prepare(`
      INSERT INTO User (telegram_id, active, max_spend_per_snipe, dry_run, daily_spend, daily_reset_at)
      VALUES (?, 1, 0.1, 1, 0, datetime('now'))
    `).run(telegramId);
    
    return {
      telegram_id: telegramId,
      active: true,
      max_spend_per_snipe: 0.1,
      daily_spend: 0,
      dry_run: true
    };
  }
  
  return result;
}

/**
 * Set max spend per snipe for a user
 */
export function setMaxSpend(telegramId: string, amount: number): void {
  db.prepare(`
    INSERT OR REPLACE INTO User (telegram_id, max_spend_per_snipe)
    VALUES (?, ?)
  `).run(telegramId, amount);
}

/**
 * Set dry_run mode for a user (requires explicit confirmation)
 */
export function setDryRun(telegramId: string, dryRun: boolean): void {
  db.prepare(`
    INSERT OR REPLACE INTO User (telegram_id, dry_run)
    VALUES (?, ?)
  `).run(telegramId, dryRun);
}

/**
 * Reset daily spend if needed
 */
export function resetDailySpendIfExpired(telegramId: string): void {
  const user = db.prepare('SELECT daily_reset_at FROM User WHERE telegram_id = ?').get(telegramId) as 
    { daily_reset_at: string } | undefined;
  
  if (user) {
    const resetDate = new Date(user.daily_reset_at);
    const now = new Date();
    
    // Reset if it's a new day
    if (resetDate.getUTCDate() !== now.getUTCDate() || 
        resetDate.getUTCMonth() !== now.getUTCMonth() ||
        resetDate.getUTCFullYear() !== now.getUTCFullYear()) {
      db.prepare(`
        UPDATE User SET daily_spend = 0, daily_reset_at = datetime('now') WHERE telegram_id = ?
      `).run(telegramId);
    }
  }
}

/**
 * Add to daily spend and return new total
 */
export function addDailySpend(telegramId: string, amount: number): number {
  resetDailySpendIfExpired(telegramId);
  
  const result = db.prepare(`
    UPDATE User SET daily_spend = daily_spend + ? WHERE telegram_id = ?
    RETURNING daily_spend
  `).get(amount, telegramId) as { daily_spend: number };
  
  return result.daily_spend;
}

/**
 * Get all active users
 */
export function getAllActiveUsers(): string[] {
  const results = db.prepare('SELECT telegram_id FROM User WHERE active = 1').all() as 
    { telegram_id: string }[];
  return results.map(r => r.telegram_id);
}

/**
 * Get all admin IDs from environment
 */
export function getAdminIds(): string[] {
  const adminIds = process.env.ADMIN_TELEGRAM_IDS || '';
  return adminIds.split(',').map(id => id.trim()).filter(id => id);
}
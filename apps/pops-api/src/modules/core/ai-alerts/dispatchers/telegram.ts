/**
 * Telegram dispatcher for AI alerts (PRD-092 US-07, PRD-088).
 *
 * Pushes a message to the Moltbot Telegram chat using the Bot API directly.
 * The bot token + chat ID are read from environment variables:
 *
 *   POPS_ALERTS_TELEGRAM_BOT_TOKEN   the bot token (same one moltbot uses)
 *   POPS_ALERTS_TELEGRAM_CHAT_ID     the chat ID to deliver to
 *
 * When either variable is unset the dispatcher is treated as not configured
 * and silently skips delivery — this matches the PRD note "If Moltbot is not
 * configured, skip Telegram delivery silently."
 */
import { logger } from '../../../../lib/logger.js';

import type { FiredAlert } from '../types.js';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramTransport {
  send: (config: TelegramConfig, text: string) => Promise<void>;
}

/** Read config from env. Returns null when unset. */
export function readTelegramConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig | null {
  const botToken = env['POPS_ALERTS_TELEGRAM_BOT_TOKEN'];
  const chatId = env['POPS_ALERTS_TELEGRAM_CHAT_ID'];
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/** Default transport using the global `fetch`. */
export const fetchTransport: TelegramTransport = {
  async send(config, text) {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
    }
  },
};

/**
 * Render an alert as the Telegram message body. Markdown formatting matches
 * the existing Moltbot conventions (bold for headline, italics for scope).
 */
export function renderTelegramMessage(alert: FiredAlert): string {
  const severityEmoji = alert.severity === 'critical' ? '🚨' : '⚠️';
  const scope = alert.scopeDetail ? `\n_${alert.scopeDetail}_` : '';
  return `${severityEmoji} *AI Alert — ${alert.type}*${scope}\n${alert.message}`;
}

/**
 * Dispatch the alert via Telegram. Returns `true` when a message was sent,
 * `false` when the dispatcher was not configured (no-op). Throws on transport
 * errors so the caller can decide whether to retry.
 */
export async function dispatchTelegram(
  alert: FiredAlert,
  options: { config?: TelegramConfig | null; transport?: TelegramTransport } = {}
): Promise<boolean> {
  const config = options.config === undefined ? readTelegramConfig() : options.config;
  if (!config) {
    logger.debug(
      { alertId: alert.id },
      '[ai-alerts/telegram] No Telegram config — skipping dispatch'
    );
    return false;
  }
  const transport = options.transport ?? fetchTransport;
  const text = renderTelegramMessage(alert);
  await transport.send(config, text);
  return true;
}

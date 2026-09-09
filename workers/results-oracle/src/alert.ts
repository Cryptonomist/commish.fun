/* Tell a person. Optional, and never a reason for a tick to fail: if nothing
 * is configured, or a send fails, the message goes to the log and the run
 * carries on.
 *
 * TELEGRAM FIRST, because that is where the owner reads. Telegram has no
 * incoming webhooks; a bot sends through its own token to a chat id, so it is
 * two secrets rather than one URL. A Discord or Slack incoming webhook can be
 * set alongside it, and both are sent to if both exist. Every send is awaited
 * together and none may throw. */

export type AlertEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ALERT_WEBHOOK?: string;
};

/** Telegram refuses messages over 4096 characters; nothing here should get
 *  close, but an error list from a bad tick could. */
const TELEGRAM_MAX = 4000;

export async function alert(env: AlertEnv, text: string): Promise<void> {
  console.warn(text);
  const sends: Promise<void>[] = [];

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    sends.push(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: text.length > TELEGRAM_MAX ? `${text.slice(0, TELEGRAM_MAX)}…` : text,
          disable_web_page_preview: true,
        }),
      }).then(
        (r) => {
          if (!r.ok) console.warn(`telegram refused the alert: ${r.status}`);
        },
        (e) => console.warn(`telegram unreachable: ${e instanceof Error ? e.message : String(e)}`),
      ),
    );
  }

  if (env.ALERT_WEBHOOK) {
    sends.push(
      fetch(env.ALERT_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // `content` for Discord, `text` for Slack; each ignores the other.
        body: JSON.stringify({ content: text, text }),
      }).then(
        (r) => {
          if (!r.ok) console.warn(`alert webhook refused the alert: ${r.status}`);
        },
        (e) => console.warn(`alert webhook unreachable: ${e instanceof Error ? e.message : String(e)}`),
      ),
    );
  }

  await Promise.allSettled(sends);
}

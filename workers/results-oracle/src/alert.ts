/* Tell a person. Optional, and never a reason for a tick to fail: if the
 * webhook is unset or unreachable the message goes to the log and the run
 * carries on. Both `content` and `text` are sent so a Discord or a Slack
 * incoming webhook reads it without configuration. */

export async function alert(env: { ALERT_WEBHOOK?: string }, text: string): Promise<void> {
  console.warn(text);
  if (!env.ALERT_WEBHOOK) return;
  try {
    await fetch(env.ALERT_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text, text }),
    });
  } catch (e) {
    console.warn(`alert webhook failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

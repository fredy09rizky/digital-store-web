import type { AppBindings } from "../env";

export async function sendTelegram(env: AppBindings, text: string): Promise<{ ok: boolean; description?: string }> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, description: "Telegram bot belum dikonfigurasi." };
  }
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!r.ok) {
      return { ok: false, description: `Telegram HTTP ${r.status}` };
    }
    const j = (await r.json()) as { ok: boolean; description?: string };
    return j;
  } catch (e: any) {
    return { ok: false, description: e?.message ?? "telegram fetch error" };
  }
}

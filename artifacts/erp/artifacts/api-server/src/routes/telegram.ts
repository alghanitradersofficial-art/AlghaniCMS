import { Router } from "express";
import { pool } from "@workspace/db";
import * as TelegramBotImport from "node-telegram-bot-api";

// Under NodeNext, handle both the default constructor mapping and namespace mapping safely
const TelegramBot = (TelegramBotImport as any).default || TelegramBotImport;

const router = Router();

let bot: any = null;
let botInitialized = false;
let telegramInitError = "";

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled");
    telegramInitError = "TELEGRAM_BOT_TOKEN not set";
    return;
  }

  try {
    bot = new TelegramBot(token, { polling: false });
    botInitialized = false;

    const initializeAsync = async () => {
      try {
        const me = await bot.getMe();
        botInitialized = true;
        console.log("[Telegram] Bot initialized as", me.username || me.id);

        let pollingErrorCount = 0;
        const MAX_POLL_ERRORS = 6;
        bot.on("polling_error", (err: any) => {
          pollingErrorCount += 1;
          console.error("[Telegram] Polling error:", err?.message || err);
          if (pollingErrorCount >= MAX_POLL_ERRORS) {
            console.error("[Telegram] Too many polling errors — disabling bot polling temporarily.");
            try {
              bot.stopPolling?.();
            } catch (stopErr) {
              console.error("[Telegram] Failed to stop polling:", stopErr);
            }
            bot = null;
            botInitialized = false;
            telegramInitError = "Too many polling errors";
          }
        });

        if (!process.env["VERCEL"]) {
          try {
            bot.startPolling();
          } catch (startErr) {
            console.error("[Telegram] Failed to start polling:", startErr);
          }
        }
      } catch (err) {
        telegramInitError = (err as any)?.message || String(err);
        bot = null;
        botInitialized = false;
        console.error("[Telegram] Bot initialization failed:", telegramInitError);
      }
    };

    initializeAsync();
  } catch (e) {
    telegramInitError = (e as any)?.message || String(e);
    bot = null;
    botInitialized = false;
    console.error("[Telegram] Failed to initialize bot instance:", telegramInitError);
  }
}

// ─── REST ROUTES FOR TELEGRAM ─────────────────────────────────────────────────
router.get("/status", (req, res) => {
  return res.json({ enabled: botInitialized, hasToken: !!process.env.TELEGRAM_BOT_TOKEN, hasChatId: !!process.env.TELEGRAM_CHAT_ID, initError: telegramInitError });
});

router.post("/send", async (req, res) => {
  try {
    if (!botInitialized) return res.status(400).json({ error: "Telegram bot not initialized. Set TELEGRAM_BOT_TOKEN and ensure the bot token is valid.", detail: telegramInitError });
    const { chatId, message, reportType } = req.body;
    const targetId = chatId || process.env.TELEGRAM_CHAT_ID;
    if (!targetId) return res.status(400).json({ error: "No TELEGRAM_CHAT_ID configured" });

    let finalMessage = message;
    if (reportType === "summary" || !message) {
      const [sRes, pRes, eRes] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM sales WHERE status!='cancelled'`),
        pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total FROM purchases WHERE status!='cancelled'`),
        pool.query(`SELECT COALESCE(SUM(amount::numeric),0) as total FROM expenses`),
      ]);
      const sales = parseFloat(sRes.rows[0].total);
      const purchases = parseFloat(pRes.rows[0].total);
      const expenses = parseFloat(eRes.rows[0].total);
      finalMessage = `📊 *Al Ghani ERP — ${reportType?.replace(/-/g, " ") || "Report"}*\n📅 ${new Date().toLocaleString("en-PK")}\n\n💰 Sales: Rs. ${sales.toLocaleString()} (${sRes.rows[0].count} orders)\n🛒 Purchases: Rs. ${purchases.toLocaleString()}\n💸 Expenses: Rs. ${expenses.toLocaleString()}\n📈 Net Profit: Rs. ${(sales - purchases - expenses).toLocaleString()}`;
    }

    await bot.sendMessage(targetId, finalMessage, { parse_mode: "Markdown" });
    return res.json({ success: true, sentTo: targetId });
  } catch (error) {
    return res.status(500).json({ error: "Failed to send: " + (error as Error).message });
  }
});

router.post("/test", async (req, res) => {
  try {
    if (!botInitialized) return res.status(400).json({ error: "Bot not initialized", detail: telegramInitError });
    const chatId = req.body.chatId || process.env.TELEGRAM_CHAT_ID;
    if (!chatId) return res.status(400).json({ error: "Provide chatId in body or set TELEGRAM_CHAT_ID" });
    await bot.sendMessage(chatId, "✅ Al Ghani ERP Telegram connection test successful!\n🏪 System is online.", { parse_mode: "Markdown" });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export { bot };
export default router;
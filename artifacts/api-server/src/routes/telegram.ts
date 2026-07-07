import { Router } from "express";
import { pool } from "@workspace/db";
import * as TelegramBotImport from "node-telegram-bot-api";

// Under NodeNext, handle both the default constructor mapping and namespace mapping safely
const TelegramBot = (TelegramBotImport as any).default || TelegramBotImport;

const router = Router();

let bot: any = null;
let botInitialized = false;

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled");
    return;
  }
  try {
    bot = new TelegramBot(token, { polling: true });
    botInitialized = true;
    console.log("[Telegram] Bot initialized");

    const getCEOChatId = () => process.env.TELEGRAM_CHAT_ID || "";

    const sendSummary = async (chatId: string) => {
      try {
        const [sRes, pRes, eRes, prodRes, custRes] = await Promise.all([
          pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM sales WHERE status!='cancelled'`),
          pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total FROM purchases WHERE status!='cancelled'`),
          pool.query(`SELECT COALESCE(SUM(amount::numeric),0) as total FROM expenses`),
          pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN current_stock<=min_stock THEN 1 ELSE 0 END) as low FROM products`),
          pool.query(`SELECT COUNT(*) as count FROM customers`),
        ]);
        const sales = parseFloat(sRes.rows[0].total);
        const purchases = parseFloat(pRes.rows[0].total);
        const expenses = parseFloat(eRes.rows[0].total);
        const net = sales - purchases - expenses;
        const msg = `🏪 *AL GHANI ERP — Business Report*\n📅 ${new Date().toLocaleString("en-PK")}\n\n💰 *Sales:* Rs. ${sales.toLocaleString()} (${sRes.rows[0].count} orders)\n🛒 *Purchases:* Rs. ${purchases.toLocaleString()}\n💸 *Expenses:* Rs. ${expenses.toLocaleString()}\n${net >= 0 ? "📈" : "📉"} *Net Profit:* Rs. ${net.toLocaleString()}\n\n📦 *Products:* ${prodRes.rows[0].total} total, ⚠️ ${prodRes.rows[0].low || 0} low stock\n👥 *Customers:* ${custRes.rows[0].count}\n\n_Powered by Al Ghani ERP System_`;
        await bot!.sendMessage(chatId, msg, { parse_mode: "Markdown" });
      } catch (e) {
        console.error("[Telegram] Failed to send summary:", e);
      }
    };

    const sendSalesReport = async (chatId: string) => {
      const result = await pool.query(`SELECT invoice_number, customer_name, total, status, created_at FROM sales ORDER BY created_at DESC LIMIT 10`);
      let msg = `🛍️ *Recent Sales Orders*\n\n`;
      for (const r of result.rows) {
        const icon = r.status === "completed" ? "✅" : r.status === "pending" ? "⏳" : "❌";
        msg += `${icon} *${r.invoice_number}* — ${r.customer_name}\n   Rs. ${parseFloat(r.total).toLocaleString()} · ${new Date(r.created_at).toLocaleDateString("en-PK")}\n`;
      }
      await bot!.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    };

    const sendInventoryAlert = async (chatId: string) => {
      const result = await pool.query(`SELECT name, sku, current_stock, min_stock FROM products WHERE current_stock <= min_stock ORDER BY current_stock ASC`);
      if (!result.rows.length) {
        await bot!.sendMessage(chatId, "✅ *Inventory OK* — No low stock items.", { parse_mode: "Markdown" });
        return;
      }
      let msg = `⚠️ *Low Stock Alert — ${result.rows.length} Items*\n\n`;
      for (const r of result.rows) msg += `📦 *${r.name}*\n   Stock: ${r.current_stock} | Min: ${r.min_stock}\n`;
      await bot!.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    };

    bot.onText(/\/start/, (msg: any) => {
      bot!.sendMessage(msg.chat.id, `👋 Welcome to *Al Ghani ERP Bot*!\n\nYour Chat ID: \`${msg.chat.id}\`\n\nCommands:\n/report — Full summary\n/sales — Recent sales\n/inventory — Stock alerts\n/customers — Customer count\n/today — Today's summary`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/report/, async (msg: any) => { await sendSummary(String(msg.chat.id)); });
    bot.onText(/\/sales/, async (msg: any) => { await sendSalesReport(String(msg.chat.id)); });
    bot.onText(/\/inventory/, async (msg: any) => { await sendInventoryAlert(String(msg.chat.id)); });
    bot.onText(/\/chatid/, async (msg: any) => { await bot!.sendMessage(msg.chat.id, `Your Chat ID: \`${msg.chat.id}\``, { parse_mode: "Markdown" }); });
    bot.onText(/\/today/, async (msg: any) => {
      const result = await pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM sales WHERE status!='cancelled' AND created_at >= NOW() - INTERVAL '1 day'`);
      const sales = parseFloat(result.rows[0].total);
      await bot!.sendMessage(msg.chat.id, `📊 *Today's Sales*\nOrders: ${result.rows[0].count}\nRevenue: Rs. ${sales.toLocaleString()}`, { parse_mode: "Markdown" });
    });

    bot.on("polling_error", (err: any) => { console.error("[Telegram] Polling error:", err.message); });
  } catch (e) {
    console.error("[Telegram] Failed to init bot:", e);
  }
}

// ─── REST ROUTES FOR TELEGRAM ─────────────────────────────────────────────────
router.get("/status", (req, res) => {
  return res.json({ enabled: botInitialized, hasToken: !!process.env.TELEGRAM_BOT_TOKEN, hasChatId: !!process.env.TELEGRAM_CHAT_ID });
});

router.post("/send", async (req, res) => {
  try {
    if (!bot) return res.status(400).json({ error: "Telegram bot not initialized. Set TELEGRAM_BOT_TOKEN." });
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
    if (!bot) return res.status(400).json({ error: "Bot not initialized" });
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
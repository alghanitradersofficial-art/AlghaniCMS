import { Router } from "express";
import { pool } from "@workspace/db";
import nodemailer from "nodemailer";
import { groqChat } from "../lib/groq.js";

const router = Router();

function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

router.post("/send-report", async (req, res) => {
  try {
    const { reportType = "daily-summary", recipients, subject: customSubject } = req.body;

    // Gather report data
    const [sRes, pRes, eRes, prodRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM sales WHERE status!='cancelled' AND created_at >= NOW() - INTERVAL '1 day'`),
      pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM purchases WHERE status!='cancelled' AND created_at >= NOW() - INTERVAL '1 day'`),
      pool.query(`SELECT COALESCE(SUM(amount::numeric),0) as total FROM expenses WHERE created_at >= NOW() - INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) as low FROM products WHERE current_stock <= min_stock`),
    ]);
    const salesTotal = parseFloat(sRes.rows[0].total);
    const purchTotal = parseFloat(pRes.rows[0].total);
    const expTotal = parseFloat(eRes.rows[0].total);
    const lowStock = parseInt(prodRes.rows[0].low);

    const dataContext = `
Report Type: ${reportType}
Date: ${new Date().toLocaleString("en-PK")}
Company: Al Ghani Wholesale Traders, Lahore

TODAY'S NUMBERS:
- Sales Revenue: Rs. ${salesTotal.toLocaleString()}
- Sales Count: ${sRes.rows[0].count} orders
- Purchases: Rs. ${purchTotal.toLocaleString()}
- Expenses: Rs. ${expTotal.toLocaleString()}
- Net Profit: Rs. ${(salesTotal - purchTotal - expTotal).toLocaleString()}
- Low Stock Alerts: ${lowStock} products need restocking
`;

    let emailBody = dataContext;
    const groqClient = require("../lib/groq").getGroqClient();
    if (groqClient) {
      try {
        emailBody = await groqChat([
          {
            role: "system",
            content: `You are a professional business email writer for Al Ghani Wholesale Traders, a motorcycle spare parts wholesale company in Lahore, Pakistan. Write formal, professional business emails in English with an appropriate Pakistani business tone. Always include proper salutations and sign-offs from "Al Ghani ERP System".`,
          },
          {
            role: "user",
            content: `Write a professional ${reportType.replace(/-/g, " ")} email report based on this data:\n\n${dataContext}\n\nFormat it as a proper email body (no subject line, start with salutation). Include all key metrics, a brief analysis, and recommendations if needed. Keep it concise but comprehensive.`,
          },
        ]);
      } catch (aiErr) {
        console.warn("Groq email generation failed, using plain data:", aiErr);
      }
    }

    const subject = customSubject || `Al Ghani ERP – ${reportType.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} – ${new Date().toLocaleDateString("en-PK")}`;
    const transporter = getTransporter();

    if (!transporter) {
      return res.json({
        success: false,
        emailBody,
        subject,
        message: "SMTP not configured. Email preview generated — configure SMTP_HOST, SMTP_USER, SMTP_PASS in settings.",
      });
    }

    const toList = recipients?.length ? recipients : [process.env.CEO_EMAIL || "junaid@alghani.pk"];
    await transporter.sendMail({
      from: `"Al Ghani ERP" <${process.env.SMTP_USER}>`,
      to: toList.join(", "),
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;background:#111;color:#eee;padding:0;border-radius:8px;overflow:hidden">
        <div style="background:#1a1a1a;padding:20px 24px;border-bottom:3px solid #DC2626">
          <h1 style="color:#DC2626;margin:0;font-size:20px">Al Ghani Wholesale Traders</h1>
          <p style="color:#D97706;margin:4px 0 0;font-size:12px">Lahore, Pakistan · Motorcycle Spare Parts</p>
        </div>
        <div style="padding:24px;background:#111;white-space:pre-wrap;line-height:1.7;font-size:14px">${emailBody.replace(/\n/g, "<br>")}</div>
        <div style="background:#1a1a1a;padding:12px 24px;text-align:center;font-size:11px;color:#666">
          CEO: Junaid Malik · Al Ghani ERP System · Generated ${new Date().toLocaleString("en-PK")}
        </div>
      </div>`,
    });

    return res.json({ success: true, subject, recipients: toList, message: "Email sent successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to send email: " + (error as Error).message });
  }
});

router.post("/preview-report", async (req, res) => {
  try {
    const { reportType = "daily-summary" } = req.body;
    const [sRes, pRes, eRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM sales WHERE status!='cancelled' AND created_at >= NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total FROM purchases WHERE status!='cancelled' AND created_at >= NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COALESCE(SUM(amount::numeric),0) as total FROM expenses WHERE created_at >= NOW() - INTERVAL '30 days'`),
    ]);
    const salesTotal = parseFloat(sRes.rows[0].total);
    const dataContext = `Report: ${reportType} | Sales: Rs. ${salesTotal.toLocaleString()} (${sRes.rows[0].count} orders) | Purchases: Rs. ${parseFloat(pRes.rows[0].total).toLocaleString()} | Expenses: Rs. ${parseFloat(eRes.rows[0].total).toLocaleString()} | Net Profit: Rs. ${(salesTotal - parseFloat(pRes.rows[0].total) - parseFloat(eRes.rows[0].total)).toLocaleString()}`;
    let emailBody = `Dear CEO,\n\nPlease find the ${reportType.replace(/-/g, " ")} report for Al Ghani Wholesale Traders.\n\n${dataContext}\n\nBest regards,\nAl Ghani ERP System`;
    try {
      emailBody = await groqChat([
        { role: "system", content: "You are a professional business email writer for Al Ghani Wholesale Traders Pakistan. Write formal concise business report emails." },
        { role: "user", content: `Write a ${reportType.replace(/-/g, " ")} email for CEO Junaid Malik based on: ${dataContext}` },
      ]);
    } catch {}
    return res.json({ subject: `Al Ghani ERP – ${reportType.replace(/-/g, " ")}`, body: emailBody });
  } catch (error) {
    return res.status(500).json({ error: "Failed to preview email" });
  }
});

export default router;

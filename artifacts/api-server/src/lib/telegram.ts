import fs from 'fs';
import path from 'path';

export async function sendTelegramMessage(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  });
}

export async function sendTelegramDocument(filePath: string, caption: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Use native FormData (Node 18+) + Blob
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('document', new Blob([fileBuffer], { type: 'application/octet-stream' }), fileName);

    const url = `https://api.telegram.org/bot${token}/sendDocument`;
    await fetch(url, { method: 'POST', body: form });
  } catch (err) {
    console.error('Telegram document send failed:', err);
  }
}

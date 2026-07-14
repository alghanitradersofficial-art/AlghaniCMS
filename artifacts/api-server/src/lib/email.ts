import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await transporter.sendMail({
    from: `"Al Ghani Traders" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

export async function sendOTPEmail(email: string, otp: string, name: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e40af;">Al Ghani Traders ERP</h2>
      <p>Dear ${name},</p>
      <p>Your OTP for password reset is:</p>
      <div style="background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${otp}</span>
      </div>
      <p>This OTP is valid for <strong>10 minutes</strong>.</p>
      <p>If you did not request this, please contact your administrator.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <p style="color: #6b7280; font-size: 12px;">Al Ghani Wholesale Traders, Karachi</p>
    </div>
  `;
  await sendEmail(email, 'Password Reset OTP - Al Ghani ERP', html);
}

export async function sendMonthlyReport(attachmentPath: string, month: string, year: number): Promise<void> {
  const ceoEmail = process.env.CEO_EMAIL || 'junaid@alghani.pk';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e40af;">Monthly Report - ${month} ${year}</h2>
      <p>Dear Sir,</p>
      <p>Please find attached the monthly closing report for <strong>${month} ${year}</strong>.</p>
      <p>This report includes:</p>
      <ul>
        <li>Sales Summary</li>
        <li>Purchase Summary</li>
        <li>Expense Details</li>
        <li>Customer Ledger Summary</li>
        <li>Supplier Ledger Summary</li>
        <li>Profit & Loss Statement</li>
      </ul>
      <p>Regards,<br>Al Ghani ERP System</p>
    </div>
  `;
  const fs = await import('fs');
  await transporter.sendMail({
    from: `"Al Ghani ERP" <${process.env.SMTP_USER}>`,
    to: ceoEmail,
    subject: `Monthly Report - ${month} ${year}`,
    html,
    attachments: [
      {
        filename: `AlGhani_Report_${month}_${year}.xlsx`,
        content: fs.readFileSync(attachmentPath),
      },
    ],
  });
}

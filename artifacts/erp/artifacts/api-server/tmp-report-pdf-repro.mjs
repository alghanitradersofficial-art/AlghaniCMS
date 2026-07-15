import fs from 'node:fs';
import PDFDocument from 'pdfkit';

function addPdfHeader(doc, company, title) {
  doc.rect(0, 0, doc.page.width, 100).fill('#1a1a1a');
  doc.fillColor('#DC2626').fontSize(20).font('Helvetica-Bold').text(company.name || 'Al Ghani Wholesale Traders', 40, 20);
  doc.fillColor('#D97706').fontSize(9).font('Helvetica').text(company.branch || '', 40, 46);
  doc.fillColor('#999999').fontSize(8).text(`${company.address || ''}  |  ${company.phone || ''}  |  ${company.email || ''}`, 40, 60);
  doc.fillColor('#777777').fontSize(7).text(`NTN: ${company.ntn || ''}`, 40, 74);
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(title, 0, 30, { align: 'right', width: doc.page.width - 40 });
  doc.fillColor('#555555').fontSize(8).font('Helvetica').text(`Generated: ${new Date().toLocaleString('en-PK')}`, 0, 50, { align: 'right', width: doc.page.width - 40 });
  doc.moveDown(1);
  doc.y = 115;
}

function addPdfFooter(doc, company) {
  const bottom = doc.page.height - 40;
  doc.rect(0, bottom - 10, doc.page.width, 50).fill('#1a1a1a');
  doc.fillColor('#555555').fontSize(7).font('Helvetica')
    .text(`CEO: ${company.ceoName || ''}  |  ${company.ceoPhone || ''}  |  ${company.ceoEmail || ''}`, 40, bottom, { align: 'left' });
  doc.fillColor('#DC2626').fontSize(7)
    .text('Al Ghani ERP System', 0, bottom, { align: 'right', width: doc.page.width - 40 });
}

async function main() {
  const company = {
    name: 'Al Ghani Wholesale Traders',
    address: 'Test address',
    phone: '+92-42-35761234',
    email: 'info@alghani.com',
    branch: 'Main Branch - Lahore',
    ceoName: 'Mr. Abdul Ghani',
    ntn: '1234567-8',
  };
  const revenue = 100;
  const purchases = 20;
  const expenses = 10;
  const netProfit = revenue - purchases - expenses;
  const items = [
    ['Total Revenue (Sales)', `Rs. ${revenue.toLocaleString()}`],
    ['Total Purchases (COGS)', `Rs. ${purchases.toLocaleString()}`],
    ['Gross Profit', `Rs. ${(revenue - purchases).toLocaleString()}`],
    ['Total Expenses', `Rs. ${expenses.toLocaleString()}`],
    ['Net Profit', `Rs. ${netProfit.toLocaleString()}`],
    ['Total Orders', `10`],
    ['Total Purchase Orders', `5`],
    ['Total Products', `100`],
    ['Total Inventory Value', `Rs. ${0}`],
  ];
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const out = fs.createWriteStream('tmp-report.pdf');
  doc.pipe(out);
  addPdfHeader(doc, company, 'Full Business Report');
  for (const [label, val] of items) {
    const y = doc.y;
    doc.fillColor('#cccccc').fontSize(10).font('Helvetica').text(label, 40, y, { width: 300 });
    doc.fillColor('#D97706').font('Helvetica-Bold').text(val, 340, y, { width: 200, align: 'right' });
    doc.moveDown(0.7);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#333333').stroke();
    doc.moveDown(0.3);
  }
  doc.moveDown(1);
  doc.fillColor(netProfit >= 0 ? '#22c55e' : '#ef4444').fontSize(14).font('Helvetica-Bold')
    .text(`NET PROFIT: Rs. ${netProfit.toLocaleString()}`, { align: 'center' });
  addPdfFooter(doc, company);
  doc.end();
  out.on('finish', () => console.log('DONE'));
  out.on('error', (err) => { console.error('OUT ERR', err); process.exit(1); });
}

main().catch((err) => { console.error('MAIN ERR', err); process.exit(1); });

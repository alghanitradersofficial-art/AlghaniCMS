import fetch from 'node:fetch';

const base = 'http://localhost:3001';
async function api(path, opts) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch(e) { json = text; }
  return { status: res.status, body: json };
}

(async () => {
  try {
    console.log('Creating product...');
    const prod = await api('/api/products', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: 'SMOKE PROD', sku: 'SMK-001', costPrice: 100, salePrice: 150, currentStock: 10, minStock: 1, unit: 'pcs' }) });
    console.log('Product:', prod.status, prod.body);
    if (prod.status !== 201) throw new Error('Product create failed');
    const productId = prod.body.id;

    console.log('Creating customer...');
    const cust = await api('/api/customers', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Smoke Customer', email: 'smoke@example.com' }) });
    console.log('Customer:', cust.status, cust.body);
    if (cust.status !== 201) throw new Error('Customer create failed');
    const customerId = cust.body.id;

    console.log('Creating sale (should succeed)...');
    const sale = await api('/api/sales', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ customerId, customerName: 'Smoke Customer', status: 'completed', items: [{ productId, quantity: 1, unitPrice: 150 }] }) });
    console.log('Sale create:', sale.status, sale.body);
    if (sale.status !== 201) throw new Error('Sale create failed');

    const saleDate = new Date();
    const year = saleDate.getFullYear();
    const month = saleDate.getMonth() + 1;
    console.log('Closing month', year, month);
    const close = await api('/api/months/close', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ year, month }) });
    console.log('Close month:', close.status, close.body);
    if (![200,201].includes(close.status)) throw new Error('Month close failed');

    console.log('Attempting to create sale in closed month (should fail with 409)...');
    const sale2 = await api('/api/sales', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ customerId, customerName: 'Smoke Customer', status: 'completed', saleDate: saleDate.toISOString(), items: [{ productId, quantity: 1, unitPrice: 150 }] }) });
    console.log('Sale after close:', sale2.status, sale2.body);
    if (sale2.status === 409) {
      console.log('Closed-period guard working: write rejected as expected.');
      process.exit(0);
    } else {
      console.error('Closed-period guard did NOT reject the write.');
      process.exit(2);
    }
  } catch (err) {
    console.error('Smoke test failed', err);
    process.exit(1);
  }
})();

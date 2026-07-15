import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api';

async function request(path, options = {}) {
  const token = process.env.API_TOKEN;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    headers,
    ...options,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const [products, customers, suppliers] = await Promise.all([
    request('/products'),
    request('/customers'),
    request('/suppliers'),
  ]);

  const productList = Array.isArray(products?.data) ? products.data : products;
  const customer = (Array.isArray(customers?.data) ? customers.data : customers).find((entry) => entry.name === 'City Cycle House');
  const supplier = (Array.isArray(suppliers?.data) ? suppliers.data : suppliers).find((entry) => entry.name === 'SpeedParts Wholesale');

  const brakePads = productList.find((p) => p.sku === 'BPK-BR-001');
  const chainSet = productList.find((p) => p.sku === 'BPK-CH-001');
  const tire = productList.find((p) => p.sku === 'BPK-TI-001');
  const cable = productList.find((p) => p.sku === 'BPK-GC-001');

  if (!customer || !supplier || !brakePads || !chainSet || !tire || !cable) {
    throw new Error('Required seed data not found');
  }

  const start = new Date('2026-07-01T10:00:00.000Z');
  for (let day = 0; day < 30; day += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day);
    const saleDate = date.toISOString();

    const items = [];
    const qtyA = 2 + ((day + 1) % 3);
    const qtyB = 1 + ((day + 2) % 2);
    items.push({ productId: brakePads.id, quantity: qtyA, unitPrice: brakePads.salePrice });
    items.push({ productId: chainSet.id, quantity: qtyB, unitPrice: chainSet.salePrice });

    await request('/sales', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        customerName: customer.name,
        status: 'completed',
        discount: 0,
        notes: `Daily retail sale ${day + 1}`,
        saleDate,
        items,
      }),
    });

    await request('/expenses', {
      method: 'POST',
      body: JSON.stringify({
        title: `Daily operating expense ${day + 1}`,
        category: day % 3 === 0 ? 'transport' : 'utilities',
        amount: 1500 + ((day % 5) * 250),
        date: saleDate.slice(0, 10),
        notes: `Operational expense for ${saleDate.slice(0, 10)}`,
      }),
    });

    if (day % 3 === 0) {
      await request('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: supplier.id,
          supplierName: supplier.name,
          status: 'received',
          notes: `Restock ${day + 1}`,
          purchaseDate: saleDate,
          items: [
            { productId: tire.id, quantity: 4 + (day % 2), unitCost: tire.costPrice },
            { productId: cable.id, quantity: 5 + (day % 3), unitCost: cable.costPrice },
          ],
        }),
      });
    }

    if (day % 5 === 0) {
      await delay(50);
    }
  }

  console.log('Seeded daily July transaction data');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { pool } from '@workspace/db';

function formatDateISO(date) {
  return date.toISOString();
}

// Safety guard: require explicit env var to allow bulk seeding that writes historic financial records.
if (process.env.ALLOW_WRITE_CLOSED_PERIOD !== 'true') {
  console.error('Refusing to run seed-full-month-db.mjs: set ALLOW_WRITE_CLOSED_PERIOD=true to allow writing historic/closed-period data');
  process.exit(1);
}

async function main() {
  const client = await pool.connect();
  try {
    // Load reference data
    const prodRes = await client.query(`SELECT id, sku, sale_price, cost_price, current_stock FROM products WHERE sku IN ($1,$2,$3,$4)`, ['BPK-BR-001','BPK-CH-001','BPK-TI-001','BPK-GC-001']);
    const products = prodRes.rows;
    const custRes = await client.query(`SELECT id, name FROM customers WHERE name = $1`, ['City Cycle House']);
    const supplierRes = await client.query(`SELECT id, name FROM suppliers WHERE name = $1`, ['SpeedParts Wholesale']);

    if (!products.length || !custRes.rows.length || !supplierRes.rows.length) {
      console.error('Required seed data not found: products/customers/suppliers');
      process.exit(1);
    }

    const productBySku = Object.fromEntries(products.map((p) => [p.sku, p]));
    const customer = custRes.rows[0];
    const supplier = supplierRes.rows[0];

    const brakePads = productBySku['BPK-BR-001'];
    const chainSet = productBySku['BPK-CH-001'];
    const tire = productBySku['BPK-TI-001'];
    const cable = productBySku['BPK-GC-001'];

    const start = new Date('2026-07-01T10:00:00.000Z');
    for (let day = 0; day < 31; day += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + day);
      const saleDate = formatDateISO(date);

      const qtyA = 2 + ((day + 1) % 3);
      const qtyB = 1 + ((day + 2) % 2);

      // Insert sale
      const items = [
        { productId: brakePads.id, quantity: qtyA, unitPrice: parseFloat(String(brakePads.sale_price)) },
        { productId: chainSet.id, quantity: qtyB, unitPrice: parseFloat(String(chainSet.sale_price)) },
      ];
      const subtotal = items.reduce((s, it) => s + (it.quantity * it.unitPrice), 0);
      const total = subtotal; // no discount
      const invoice = `JULY2026-SALE-${Date.now()}-${day}`;
      await client.query(
        `INSERT INTO sales (invoice_number, customer_id, customer_name, status, subtotal, discount, total, notes, items, sale_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [invoice, customer.id, customer.name, 'completed', subtotal.toFixed(2), 0, total.toFixed(2), `Daily retail sale ${day + 1}`, JSON.stringify(items), saleDate]
      );

      // Decrement stock for sold items
      for (const it of items) {
        await client.query(`UPDATE products SET current_stock = GREATEST(0, current_stock - $1) WHERE id = $2`, [it.quantity, it.productId]);
      }

      // Insert expense
      const expenseAmount = 1500 + ((day % 5) * 250);
      await client.query(`INSERT INTO expenses (title, category, amount, date, notes) VALUES ($1,$2,$3,$4,$5)`, [
        `Daily operating expense ${day + 1}`,
        day % 3 === 0 ? 'transport' : 'utilities',
        expenseAmount.toFixed(2),
        saleDate.slice(0,10),
        `Operational expense for ${saleDate.slice(0,10)}`,
      ]);

      // Periodic purchases (restock)
      if (day % 3 === 0) {
        const purchaseItems = [
          { productId: tire.id, quantity: 4 + (day % 2), unitCost: parseFloat(String(tire.cost_price)) },
          { productId: cable.id, quantity: 5 + (day % 3), unitCost: parseFloat(String(cable.cost_price)) },
        ];
        const pSubtotal = purchaseItems.reduce((s, it) => s + (it.quantity * it.unitCost), 0);
        const po = `JULY2026-PO-${Date.now()}-${day}`;
        await client.query(
          `INSERT INTO purchases (po_number, supplier_id, supplier_name, status, subtotal, total, notes, items, purchase_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [po, supplier.id, supplier.name, 'received', pSubtotal.toFixed(2), pSubtotal.toFixed(2), `Restock ${day + 1}`, JSON.stringify(purchaseItems), saleDate]
        );

        // Increment stock
        for (const it of purchaseItems) {
          await client.query(`UPDATE products SET current_stock = current_stock + $1 WHERE id = $2`, [it.quantity, it.productId]);
        }
      }
    }

    console.log('DB seeding of July transactions complete');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

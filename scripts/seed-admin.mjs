#!/usr/bin/env node
/**
 * Seeds the admin user and dummy data.
 * Usage: pnpm run seed
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

async function main() {
  console.log('🌱 Seeding database...');

  // --- Users ---
  const pwHash = await bcrypt.hash('admin123', 12);
  const managerHash = await bcrypt.hash('manager123', 12);

  await sql`
    INSERT INTO users (name, email, phone, password_hash, role, is_active, permissions, created_at)
    VALUES
      ('CEO Junaid', 'junaid@alghani.pk', '+923001234567', ${pwHash}, 'ceo', true,
       ARRAY['dashboard','inventory','sales','purchases','customers','suppliers','expenses','reports','users','settings','quick-entry','operations','months','customer-ledger','supplier-ledger'],
       NOW()),
      ('Manager Ahmed', 'ahmed@alghani.pk', '+923009876543', ${managerHash}, 'manager', true,
       ARRAY['dashboard','inventory','sales','purchases','customers','suppliers','expenses','reports','quick-entry','operations','months','customer-ledger','supplier-ledger'],
       NOW()),
      ('Sales Ali', 'ali@alghani.pk', '+923005551234', ${managerHash}, 'sales', true,
       ARRAY['dashboard','sales','customers','quick-entry','customer-ledger'],
       NOW())
    ON CONFLICT (email) DO NOTHING
  `;
  console.log('✅ Users seeded');

  // --- Categories ---
  await sql`
    INSERT INTO categories (name, description) VALUES
      ('Auto Parts', 'Vehicle spare parts'),
      ('Electronics', 'Electronic components'),
      ('Accessories', 'Vehicle accessories'),
      ('Lubricants', 'Engine oils and fluids')
    ON CONFLICT (name) DO NOTHING
  `;

  // --- Brands ---
  await sql`
    INSERT INTO brands (name) VALUES
      ('Toyota'), ('Honda'), ('Suzuki'), ('Bosch'), ('NGK'), ('Philips')
    ON CONFLICT (name) DO NOTHING
  `;
  console.log('✅ Categories and brands seeded');

  // --- Products ---
  const [cat] = await sql`SELECT id FROM categories WHERE name = 'Auto Parts' LIMIT 1`;
  const [brand] = await sql`SELECT id FROM brands WHERE name = 'Toyota' LIMIT 1`;

  await sql`
    INSERT INTO products (name, sku, category_id, brand_id, cost_price, sale_price, current_stock, min_stock, unit, created_at)
    VALUES
      ('Toyota Corolla Air Filter', 'AC-TC-001', ${cat?.id}, ${brand?.id}, 450.00, 650.00, 45, 10, 'pcs', NOW()),
      ('Oil Filter 3/4-16', 'OF-OEM-002', ${cat?.id}, ${brand?.id}, 280.00, 420.00, 80, 15, 'pcs', NOW()),
      ('Spark Plug NGK BKR6E', 'SP-NGK-003', ${cat?.id}, ${brand?.id}, 180.00, 280.00, 120, 20, 'pcs', NOW()),
      ('Engine Oil 10W-30 (4L)', 'EO-10W-004', ${cat?.id}, ${brand?.id}, 1200.00, 1650.00, 60, 10, 'can', NOW()),
      ('Brake Pad Set Front', 'BP-FR-005', ${cat?.id}, ${brand?.id}, 950.00, 1400.00, 30, 5, 'set', NOW())
    ON CONFLICT (sku) DO NOTHING
  `;
  console.log('✅ Products seeded');

  // --- Customers ---
  await sql`
    INSERT INTO customers (name, phone, email, city, type, opening_balance, current_balance, total_orders, total_spent, created_at)
    VALUES
      ('Malik Motors', '+923001111111', 'malik@motors.pk', 'Lahore', 'wholesale', 50000.00, 50000.00, 0, 0, NOW()),
      ('Speed Auto Works', '+923002222222', 'speed@auto.pk', 'Karachi', 'dealer', 25000.00, 25000.00, 0, 0, NOW()),
      ('Ahmed Spare Parts', '+923003333333', NULL, 'Faisalabad', 'retail', 0.00, 0.00, 0, 0, NOW())
    ON CONFLICT DO NOTHING
  `;
  console.log('✅ Customers seeded');

  // --- Suppliers ---
  await sql`
    INSERT INTO suppliers (name, phone, email, city, opening_balance, current_balance, created_at)
    VALUES
      ('Pakistan Auto Parts Ltd', '+924211234567', 'info@paparts.pk', 'Karachi', 200000.00, 200000.00, NOW()),
      ('Toyota Spare Parts Depot', '+924299876543', NULL, 'Lahore', 150000.00, 150000.00, NOW()),
      ('Universal Auto Traders', '+924215556789', 'universal@auto.pk', 'Islamabad', 75000.00, 75000.00, NOW())
    ON CONFLICT DO NOTHING
  `;
  console.log('✅ Suppliers seeded');

  // --- Sample Sales ---
  const [cust1] = await sql`SELECT id FROM customers WHERE name = 'Malik Motors' LIMIT 1`;
  if (cust1) {
    const [sale] = await sql`
      INSERT INTO sales (invoice_number, customer_id, customer_name, status, subtotal, discount, total, paid_amount, sale_date, created_at)
      VALUES ('INV-2026-0001', ${cust1.id}, 'Malik Motors', 'completed', 5800.00, 0, 5800.00, 5800.00, NOW(), NOW())
      ON CONFLICT (invoice_number) DO NOTHING
      RETURNING id
    `;
    if (sale) {
      const [p1] = await sql`SELECT id FROM products WHERE sku = 'AC-TC-001' LIMIT 1`;
      const [p2] = await sql`SELECT id FROM products WHERE sku = 'OF-OEM-002' LIMIT 1`;
      await sql`
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost, total)
        VALUES
          (${sale.id}, ${p1?.id}, 'Toyota Corolla Air Filter', 5, 650.00, 450.00, 3250.00),
          (${sale.id}, ${p2?.id}, 'Oil Filter 3/4-16', 6, 420.00, 280.00, 2520.00)
        ON CONFLICT DO NOTHING
      `;
    }
  }
  console.log('✅ Sample sales seeded');

  // --- Sample Expenses ---
  await sql`
    INSERT INTO expenses (title, category, amount, date, notes, created_at)
    VALUES
      ('Office Rent - July 2026', 'Rent', 45000.00, '2026-07-01', 'Monthly office rent', NOW()),
      ('Electricity Bill', 'Utilities', 8500.00, '2026-07-05', 'Monthly electricity', NOW()),
      ('Staff Salaries', 'Salaries', 120000.00, '2026-07-31', 'Monthly salaries', NOW()),
      ('Vehicle Fuel', 'Transport', 12000.00, '2026-07-15', 'Delivery vehicle fuel', NOW())
    ON CONFLICT DO NOTHING
  `;
  console.log('✅ Sample expenses seeded');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\nLogin credentials:');
  console.log('  CEO:     junaid@alghani.pk / admin123');
  console.log('  Manager: ahmed@alghani.pk  / manager123');
  console.log('  Sales:   ali@alghani.pk    / manager123');

  await sql.end();
}

main().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });

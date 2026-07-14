import { Router } from 'express';
import { db, products, categories, brands } from '@workspace/db';
import { eq, ilike, and, sql } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { search, categoryId, brandId, lowStock, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const conditions: any[] = [];
    if (search) conditions.push(ilike(products.name, `%${search}%`));
    if (categoryId) conditions.push(eq(products.categoryId, Number(categoryId)));
    if (brandId) conditions.push(eq(products.brandId, Number(brandId)));
    if (lowStock === 'true') conditions.push(sql`CAST(current_stock AS NUMERIC) <= CAST(min_stock AS NUMERIC)`);

    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.select({
      id: products.id, name: products.name, sku: products.sku,
      description: products.description, categoryId: products.categoryId,
      brandId: products.brandId, categoryName: categories.name,
      brandName: brands.name, costPrice: products.costPrice,
      salePrice: products.salePrice, currentStock: products.currentStock,
      minStock: products.minStock, unit: products.unit,
      oemNumber: products.oemNumber, barcode: products.barcode,
      createdAt: products.createdAt,
    })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(where)
      .orderBy(products.name)
      .limit(Number(limit))
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(products).where(where);

    return res.json({
      data: rows.map(r => ({ ...r, costPrice: Number(r.costPrice), salePrice: Number(r.salePrice), currentStock: Number(r.currentStock), minStock: Number(r.minStock), createdAt: r.createdAt.toISOString() })),
      total: Number(count), page: Number(page), limit: Number(limit),
    });
  } catch { res.status(500).json({ error: 'Failed to fetch products' }); }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const [row] = await db.select().from(products).where(eq(products.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...row, costPrice: Number(row.costPrice), salePrice: Number(row.salePrice), currentStock: Number(row.currentStock), minStock: Number(row.minStock), createdAt: row.createdAt.toISOString() });
});

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(products).values({
      name: body.name, sku: body.sku, description: body.description,
      categoryId: body.categoryId || null, brandId: body.brandId || null,
      costPrice: String(body.costPrice), salePrice: String(body.salePrice),
      currentStock: String(body.currentStock || 0), minStock: String(body.minStock || 0),
      unit: body.unit || 'pcs', oemNumber: body.oemNumber, barcode: body.barcode,
      createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    }).returning();
    return res.status(201).json(row);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(products).set({
      name: body.name, sku: body.sku, description: body.description,
      categoryId: body.categoryId || null, brandId: body.brandId || null,
      costPrice: body.costPrice !== undefined ? String(body.costPrice) : undefined,
      salePrice: body.salePrice !== undefined ? String(body.salePrice) : undefined,
      currentStock: body.currentStock !== undefined ? String(body.currentStock) : undefined,
      minStock: body.minStock !== undefined ? String(body.minStock) : undefined,
      unit: body.unit, oemNumber: body.oemNumber, barcode: body.barcode,
      updatedAt: new Date(),
    }).where(eq(products.id, Number(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(row);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  await db.delete(products).where(eq(products.id, Number(req.params.id)));
  return res.status(204).send();
});

// ---- Categories ----
router.get('/categories/all', async (_req, res) => {
  const rows = await db.select().from(categories).orderBy(categories.name);
  return res.json(rows.map(r => ({ ...r, productCount: 0 })));
});
router.post('/categories/create', async (req, res) => {
  const [row] = await db.insert(categories).values({ name: req.body.name, description: req.body.description }).returning();
  return res.status(201).json({ ...row, productCount: 0 });
});
router.delete('/categories/:id', async (req, res) => {
  await db.delete(categories).where(eq(categories.id, Number(req.params.id)));
  return res.status(204).send();
});

// ---- Brands ----
router.get('/brands/all', async (_req, res) => {
  const rows = await db.select().from(brands).orderBy(brands.name);
  return res.json(rows.map(r => ({ ...r, productCount: 0 })));
});
router.post('/brands/create', async (req, res) => {
  const [row] = await db.insert(brands).values({ name: req.body.name, description: req.body.description }).returning();
  return res.status(201).json({ ...row, productCount: 0 });
});
router.delete('/brands/:id', async (req, res) => {
  await db.delete(brands).where(eq(brands.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;

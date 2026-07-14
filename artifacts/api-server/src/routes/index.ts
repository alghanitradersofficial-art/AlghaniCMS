import { Router } from 'express';
import authRouter from './auth.js';
import dashboardRouter from './dashboard.js';
import productsRouter from './products.js';
import salesRouter from './sales.js';
import purchasesRouter from './purchases.js';
import customersRouter from './customers.js';
import suppliersRouter from './suppliers.js';
import expensesRouter from './expenses.js';
import usersRouter from './users.js';
import reportsRouter from './reports.js';
import monthsRouter from './months.js';
import quickEntryRouter from './quick-entry.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.use('/auth', authRouter);
router.use('/dashboard', dashboardRouter);
router.use('/products', productsRouter);
router.use('/sales', salesRouter);
router.use('/purchases', purchasesRouter);
router.use('/customers', customersRouter);
router.use('/suppliers', suppliersRouter);
router.use('/expenses', expensesRouter);
router.use('/users', usersRouter);
router.use('/reports', reportsRouter);
router.use('/months', monthsRouter);
router.use('/quick-entry', quickEntryRouter);

export default router;

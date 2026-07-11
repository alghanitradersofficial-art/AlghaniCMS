# Al Ghani CMS / ERP Project Structure

## Overview
This repository contains a full-stack ERP system for Al Ghani Wholesale Traders with:
- a React + TypeScript ERP frontend
- an Express + TypeScript API backend
- a shared Drizzle ORM + PostgreSQL database layer
- reporting, inventory, sales, purchases, customer/supplier accounting, and month closing features

## Root Structure
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- tsconfig.base.json
- tsconfig.json
- README.md
- structure.md
- api/
- artifacts/
- lib/
- db/
- scripts/

## Frontend ERP
Path: artifacts/erp

### Main folders
- artifacts/erp/src/
  - App.tsx
  - main.tsx
  - index.css
  - components/
  - hooks/
  - lib/
  - pages/

### Main pages
- Dashboard
- Inventory
- Sales
- Purchases
- Customers
- Suppliers
- Expenses
- Reports
- Staff
- Users
- Settings
- Quick Entry
- Operations
- Financial Periods

### UI architecture
- Layout wrapper
- Sidebar navigation
- Card-based page design
- Theme support with dark/light mode
- Reusable UI components
- Responsive mobile and desktop views

## Backend API
Path: artifacts/api-server

### Main folders
- artifacts/api-server/src/
  - app.ts
  - index.ts
  - routes/
  - services/
  - lib/

### Main route modules
- auth
- dashboard
- products
- sales
- purchases
- customers
- suppliers
- expenses
- users
- reports
- payments
- months
- stock-adjustments
- reminders
- export/import
- upload
- telegram
- email

## Shared Database Layer
Path: lib/db

### Main folders
- lib/db/src/
  - schema/
  - index.ts

### Key schema modules
- sales.ts
- purchases.ts
- products.ts
- customers.ts
- suppliers.ts
- expenses.ts
- ledger.ts
- month-closures.ts
- financial-periods.ts
- financial-period-snapshots.ts
- financial-period-balances.ts
- financial-period-audit.ts

## Additional Modules
### API client library
Path: lib/api-client-react

### OpenAPI / generated API spec
Path: lib/api-spec

### Zod API validation layer
Path: lib/api-zod

## Scripts
- scripts/run-migrations.mjs
- scripts/seed-admin.mjs

## Tech Stack
- Frontend: React, TypeScript, Vite, Tailwind CSS, TanStack Query, Wouter
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL, Drizzle ORM
- Auth: JWT-based authentication
- Styling: Tailwind CSS, shadcn-style component system

## Feature Areas
- Accounting and financial reporting
- Inventory and stock management
- Sales and purchase workflows
- Customer and supplier ledgers
- Monthly closing and financial periods
- User management and permissions
- Export/import and file upload support

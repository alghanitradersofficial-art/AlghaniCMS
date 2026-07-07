# 🏪 Al Ghani ERP — Enterprise Resource Planning System

**Al Ghani Wholesale Traders** | Motorcycle Spare Parts | Lahore, Pakistan  
CEO: **Junaid Malik** | Full-stack ERP with AI, Telegram bot, email reports, and more.

---

## 🚀 Features

| Module | Description |
|--------|-------------|
| 🔐 Authentication | JWT-based DB login, bcrypt passwords, role-based permissions |
| 📦 Inventory | Products with categories, brands, stock tracking, low-stock alerts |
| 🛒 Sales | Invoices, PDF export, customer management |
| 🚚 Purchases | Purchase orders, supplier management |
| 👥 Customers & Suppliers | Full contact management with import |
| 💸 Expenses | Track business expenses by category |
| 📊 Reports | Sales, inventory, profit/loss, daily/weekly/monthly |
| 🤖 Groq AI Import | Import from JPG/PNG/PDF/DOCX/Excel using AI |
| 📬 Telegram Bot | Real-time alerts + scheduled reports |
| 📧 AI Email Reports | Professional emails written by Groq AI |
| 💾 DB Backup | Export JSON/SQL, import from backup, project ZIP download |
| ⚙️ Settings | Company info, schedules, API keys, branding |

---

## 🖥️ Tech Stack

- **Frontend**: React + Vite + TypeScript + TailwindCSS + Shadcn UI
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Neon in production)
- **ORM**: Drizzle ORM + raw `pg` pool
- **AI**: Groq AI (Llama 3.1 70B + Vision)
- **Auth**: JWT + bcryptjs
- **Bot**: node-telegram-bot-api
- **Email**: Nodemailer
- **Export**: ExcelJS + PDFKit + docx + archiver

---

## 📋 Default Logins

| User | Email | Password | Role |
|------|-------|----------|------|
| Junaid Malik (CEO) | junaid@alghani.pk | admin123 | CEO |
| Muhammad Ghani | ceo@alghani.pk | admin123 | CEO |
| Sajid Khan | admin@alghani.com | admin123 | Developer |

---

## 🔧 Local Development (VS Code)

### Prerequisites
- Node.js 18+
- pnpm 8+ (`npm install -g pnpm`)
- PostgreSQL (local) or Neon account

### Setup Steps

```bash
# 1. Extract the project ZIP and open in VS Code
cd alghani-erp

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp artifacts/api-server/.env.example artifacts/api-server/.env
cp artifacts/erp/.env.example artifacts/erp/.env
# Edit both .env files with your values (see below)

# 4. Push the schema to your database
pnpm --filter @workspace/db run push

# 5. Create the default login users (optional)
psql "$DATABASE_URL" -f lib/db/seed-users.sql

# 6. Start each service (in separate terminals)
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/erp run dev
```

### Environment Variables (.env)

```env
# Database
DATABASE_URL=postgresql://localhost:5432/alghani_erp

# JWT (for production, use a random secret)
JWT_SECRET=your-random-secret-here-min-32-chars

# Groq AI (free at console.groq.com)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx

# Telegram Bot (create via @BotFather)
TELEGRAM_BOT_TOKEN=1234567890:ABCxxxxx
TELEGRAM_CHAT_ID=123456789

# Email (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
CEO_EMAIL=junaid@alghani.pk
```

### Running Separate Services

```bash
# API Server only (port 8080)
pnpm --filter @workspace/api-server run dev

# Frontend only (port from $PORT)
pnpm --filter @workspace/erp run dev
```

---

## 🌐 Vercel Deployment

### 1. Set up Neon PostgreSQL

1. Go to [neon.tech](https://neon.tech) → Create free account
2. Create new project: `alghani-erp`
3. Copy the connection string: `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`

### 2. Deploy Backend (API Server)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy API server
cd artifacts/api-server
vercel --prod
```

Set these environment variables in Vercel dashboard:
```
DATABASE_URL=<your-neon-connection-string>
JWT_SECRET=<random-64-char-string>
GROQ_API_KEY=<from-console.groq.com>
TELEGRAM_BOT_TOKEN=<from-botfather>
TELEGRAM_CHAT_ID=<your-chat-id>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
CEO_EMAIL=junaid@alghani.pk
NODE_ENV=production
```

### 3. Deploy Frontend (ERP App)

```bash
cd artifacts/erp
vercel --prod
```

Set this environment variable in Vercel:
```
VITE_API_URL=https://your-api.vercel.app
```

The frontend already reads `VITE_API_URL` (see `src/main.tsx` and `src/lib/auth.ts`) — no code changes needed, just set the variable.

### 4. Push the Schema to Neon

```bash
DATABASE_URL="<neon-url>" pnpm --filter @workspace/db run push
```

Then, optionally, create the default login users:
```bash
psql "<neon-url>" -f lib/db/seed-users.sql
```

---

## 🤖 Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` → name it "Al Ghani ERP Bot"
3. Copy the token → set as `TELEGRAM_BOT_TOKEN`
4. Start your bot → send `/chatid`
5. Copy your chat ID → set as `TELEGRAM_CHAT_ID`

Available commands:
- `/start` — Welcome + your chat ID
- `/report` — Full business summary
- `/sales` — Recent 10 sales
- `/inventory` — Low stock alerts
- `/today` — Today's sales total
- `/chatid` — Get your chat ID

---

## 📧 Groq AI Email Reports

Groq writes professional Pakistani business emails automatically. To enable:

1. Get free API key at [console.groq.com](https://console.groq.com)
2. Set `GROQ_API_KEY` in environment
3. Configure SMTP settings
4. Go to **Settings → Email** → Preview or Send

---

## 📥 AI Import (Groq Vision)

Import products, customers, or suppliers from:
- 📸 **Images**: JPG, PNG, WEBP, BMP, TIFF, GIF — AI reads product info from photos
- 📄 **Documents**: PDF, DOCX, XLSX, TXT, CSV, JSON — AI extracts structured data

Go to any module → click **AI Import** → upload your file.

---

## 💾 Database Backup & Restore

### Export
- **Settings → Database** → Export JSON (full backup)
- **Settings → Database** → Export SQL (for psql restore)

### Import
- **Settings → Database** → Upload JSON backup

### Project ZIP
- **Settings → Database** → Download Project ZIP

---

## 📁 Project Structure

```
alghani-erp/
├── artifacts/
│   ├── api-server/          # Express backend
│   │   ├── src/
│   │   │   ├── routes/      # All API endpoints
│   │   │   │   ├── auth.ts        # Login/JWT
│   │   │   │   ├── products.ts
│   │   │   │   ├── sales.ts
│   │   │   │   ├── telegram.ts    # Telegram bot
│   │   │   │   ├── email.ts       # AI email reports
│   │   │   │   ├── import.ts      # AI + Excel import
│   │   │   │   ├── export.ts      # PDF/Excel export
│   │   │   │   └── dbbackup.ts    # DB backup/restore
│   │   │   ├── lib/
│   │   │   │   └── groq.ts        # Groq AI client
│   │   │   └── app.ts
│   │   └── vercel.json
│   └── erp/                 # React frontend
│       ├── src/
│       │   ├── pages/
│       │   │   ├── login.tsx      # DB auth login
│       │   │   ├── dashboard.tsx
│       │   │   ├── inventory.tsx
│       │   │   ├── employees.tsx  # Users + permissions
│       │   │   └── settings.tsx   # 7-tab settings
│       │   ├── components/
│       │   │   ├── sidebar.tsx
│       │   │   ├── export-buttons.tsx
│       │   │   └── ai-import-dialog.tsx
│       │   └── lib/
│       │       └── auth.ts        # JWT helpers
│       └── vercel.json
├── lib/
│   ├── db/                  # Drizzle ORM schema + pg pool
│   ├── api-zod/             # Generated Zod types (used by the API server)
│   └── api-client-react/    # Generated React Query hooks (used by the frontend)
└── README.md
```

---

## 🔒 User Roles & Permissions

| Role | Access |
|------|--------|
| **CEO** | Full system access (all modules) |
| **Developer** | Full system access |
| **Manager** | All except user management & settings |
| **Accountant** | Expenses, reports, sales view |
| **Sales** | Sales, customers, inventory view |
| **Warehouse** | Inventory, purchases, suppliers |
| **Purchase** | Purchases, suppliers, inventory |

---

## 🧪 Testing Locally

```bash
# Test API health
curl http://localhost:8080/api/health

# Test login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"junaid@alghani.pk","password":"admin123"}'

# Test dashboard (with token)
curl http://localhost:8080/api/dashboard \
  -H "Authorization: Bearer <your-jwt-token>"
```

---

**Al Ghani Wholesale Traders** · Lahore, Pakistan  
Built with ❤️ using React + Express + Groq AI

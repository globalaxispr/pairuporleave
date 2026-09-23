# Pair Up or Leave — Voting & Competition Platform

A modern, responsive live voting competition platform for individual candidates and couples. Supports secure Stripe checkout, dynamic live ranking, immutable score ledger auditing, real-time vote updates via Supabase, and role-based administrative control.

---

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite
- **Routing**: React Router v7 (Single-Page Application with client-side routing)
- **Styling**: Tailwind CSS v4 + Vanilla CSS Design Tokens
- **Database & Auth**: Supabase (PostgreSQL, Supabase Auth, Row-Level Security, Edge Functions)
- **Icons & UI**: Lucide React, Radix UI primitives, Recharts
- **SEO & Meta**: React Helmet Async

---

## Getting Started Locally

### 1. Prerequisites
- Node.js 18+ (Node 20+ recommended)
- npm or pnpm

### 2. Installation
```bash
npm install
```

### 3. Local Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your development Supabase credentials in `.env.local`:
```env
VITE_SITE_URL=http://localhost:5173
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ENABLE_DEMO_AUTH=false
```

### 4. Running the Development Server
```bash
npm run dev
```

---

## Production Build & Vercel Deployment

### Build Verification
```bash
npm run build
```
Build output is generated into the `dist/` directory with 0 errors.

### Vercel Deployment Settings
- **Framework Preset**: Vite
- **Build Command**: `npm run build` (or `tsc -b && vite build`)
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **SPA Routing**: Handled via `vercel.json` (rewrites all client routes to `/index.html`)

### Required Vercel Environment Variables
Configure the following in your **Vercel Project Dashboard** (`Settings -> Environment Variables`):

| Variable | Description | Example / Note |
|---|---|---|
| `VITE_SITE_URL` | Production website base URL | `https://pair-up-or-leave.vercel.app` (or custom domain) |
| `VITE_SUPABASE_URL` | Supabase project API URL | `https://[your-project-ref].supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key | Browser-safe anon key from Supabase Dashboard |
| `VITE_ENABLE_DEMO_AUTH` | Gating for demo login | Set to `false` in production |

> **Security Note**: Never configure `SUPABASE_SERVICE_ROLE_KEY` or Stripe secret keys in client-side environment variables (`VITE_*`). These must only be used in Supabase Edge Functions.

---

## Administrator Setup

1. Admin users are authenticated via **Supabase Auth** (`auth.users`) and authorized via the `public.admin_users` table.
2. In production, demo authentication is disabled (`import.meta.env.DEV === false`).
3. To provision an administrator account securely:
   - Create a user in Supabase Auth Dashboard or via CLI.
   - Insert a record into `public.admin_users` with matching `id`, `email`, and `role` (`SUPER_ADMIN` or `ADMIN`).
   - Log in at `/admin/login`.

---

## Project Structure

```
├── public/                 # Static assets, logos, favicon, robots.txt, sitemap.xml
├── src/
│   ├── components/         # Reusable UI & section components
│   │   ├── admin/          # Admin modals, layouts, sidebar, guards
│   │   ├── home/           # Homepage sections & candidate cards
│   │   ├── layout/         # Navbar, Footer, Sticky Vote bar
│   │   └── ui/             # Radix-based UI components
│   ├── contexts/           # React context providers (AuthContext)
│   ├── lib/                # Supabase client, utilities, types
│   ├── pages/              # Public & Admin route views
│   └── App.tsx             # Root router & layout configuration
├── supabase/
│   ├── functions/          # Deno Edge Functions (Stripe, score adjustment)
│   └── migrations/         # Idempotent PostgreSQL schemas & RLS policies
├── vercel.json             # Vercel SPA routing configuration
└── vite.config.ts          # Vite build & plugin configuration
```

# Khwaish Yadav — AWS Route 53 Clone

A full-stack project by **Khwaish Yadav** recreating the AWS Route 53 management console and its core hosted-zone and DNS-record workflows. It uses a Next.js TypeScript frontend, FastAPI backend, and SQLite database. Production can use a persistent Turso/libSQL database through the same SQL repository. DNS changes are simulated; the application does not publish real DNS records.

## Features

- Mocked login/logout with durable, HTTP-only cookie sessions
- Hosted-zone list, name search, type filtering, pagination, creation, description editing, and deletion
- Public and private hosted-zone forms
- Automatic NS and SOA records for new zones, matching Route 53 behavior
- DNS record list, search, type filtering, pagination, creation, editing, and bulk deletion
- A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, and CAA record types
- AWS-console-inspired navigation, tables, forms, modals, notifications, loading states, and responsive layouts
- Placeholder pages for Dashboard, Health Checks, Profiles, Traffic Policies, Policy Records, and Resolver
- Browser WebMCP tools for listing and creating hosted zones in supported clients
- Accessible keyboard behavior, focus-managed modals, custom error recovery, and 404 states
- BIND zone-file import with `$ORIGIN`, `$TTL`, multiline records, grouping, and validation
- Hosted-zone export as formatted JSON or standards-friendly BIND text
- Persistent light/dark appearance mode
- Persistent AWS region selector for the console experience (Route 53 data remains global)
- Transactional bulk deletion for selected DNS records

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+S` | Focus AWS service search |
| `/` | Focus the current hosted-zone or record search |
| `C` | Create a hosted zone or record on the current page |
| `G`, then `H` | Go to Hosted zones |
| `G`, then `D` | Go to Dashboard |
| `?` | Open the keyboard shortcut reference |
| `Esc` | Close the active dialog |

## Quick start

Prerequisites: Node.js 20.9+, npm, and Python 3.11+.

### 1. Start the API

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API and interactive OpenAPI docs are available at `http://localhost:8000` and `http://localhost:8000/docs`.

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and sign in with:

```text
Email: khwaish.yadav@route53.local
Password: password
```

The SQLite file is created automatically at `backend/route53.db`. Set `ROUTE53_DB_PATH` to use another location. When `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are configured, the same repository uses the persistent SQLite-compatible Turso database instead.

## Architecture

```text
Browser
  └─ Next.js App Router (frontend/)
       ├─ Route 53 console shell and responsive UI
       ├─ Cookie-authenticated API client
       └─ Hosted-zone and record management screens
            │ JSON/HTTP
            ▼
     FastAPI (backend/app/)
       ├─ Authentication and session endpoints
       ├─ Hosted-zone REST endpoints
       ├─ DNS-record REST endpoints
       └─ sqlite3 repository and schema initialization
            │
            ▼
          SQLite
```

The browser talks directly to FastAPI using `NEXT_PUBLIC_API_URL`. FastAPI sets an HTTP-only session cookie and applies authentication to all zone and record endpoints. SQLite uses foreign keys and cascading deletes so deleting a hosted zone also removes its records.

## Database schema

| Table | Purpose | Important fields |
| --- | --- | --- |
| `users` | Mock console identities | `email` (unique), `password`, `account_id` |
| `sessions` | Persistent login sessions | `token` (PK), `user_id` (FK), `expires_at` |
| `hosted_zones` | Public/private DNS zones | `id` (PK), `name` (unique), `zone_type`, VPC metadata |
| `records` | DNS records within a zone | `zone_id` (FK), `name`, `type`, `value`, `ttl`, routing metadata |

Indexes cover hosted-zone name searches, zone-scoped record lookups, and session ownership. `(zone_id, name, type)` is unique to prevent duplicate record sets.

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Create a seven-day session |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/me` | Return the current user |
| `GET` / `POST` | `/api/zones` | Search/list or create hosted zones |
| `GET` / `PATCH` / `DELETE` | `/api/zones/{zone_id}` | Read, edit, or delete a zone |
| `GET` / `POST` | `/api/zones/{zone_id}/records` | Search/list or create records |
| `PUT` / `DELETE` | `/api/zones/{zone_id}/records/{record_id}` | Replace or delete a record |
| `POST` | `/api/zones/{zone_id}/records/import` | Parse and import a BIND zone file |
| `POST` | `/api/zones/{zone_id}/records:bulk-delete` | Delete up to 100 selected records atomically |
| `GET` | `/api/zones/{zone_id}/export?format=json\|bind` | Download the zone and its records |
| `GET` | `/api/health` | Service health check |

List endpoints support `search`, `page`, and `page_size`; record lists also support `record_type`.

## Verification

```bash
# API tests
cd backend
pip install -r requirements-dev.txt
pytest

# Frontend type and production checks
cd frontend
npm run lint
npm run typecheck
npm run build
```

## Free deployment

The included `render.yaml` deploys the FastAPI backend on Render's free web-service plan. Persistent production data is stored on Turso's free SQLite-compatible service because free Render instances have an ephemeral filesystem.

1. Create a free Turso database and token.
2. In Render, create a Blueprint from this repository and provide `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and the final Vercel origin as `FRONTEND_ORIGINS`.
3. In Vercel, import the repository and set the project root to `frontend`.
4. Set Vercel's `BACKEND_API_URL` to the Render service origin, for example `https://khwaish-route53-api.onrender.com`. Do not set `NEXT_PUBLIC_API_URL` in production; the browser uses `/api`, which Next.js securely proxies to FastAPI.
5. Redeploy Vercel after setting the backend URL, then verify login and CRUD persistence.

The proxy keeps authentication first-party from the browser's perspective. Render free services sleep after inactivity, so the first API request after an idle period can take approximately one minute.

## Project layout

```text
frontend/  Next.js application and console UI
backend/   FastAPI service, SQLite schema, and API tests
README.md  Setup, architecture, schema, and endpoint guide
```

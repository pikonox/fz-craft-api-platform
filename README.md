# fz-craft-api-platform

FZ-craft: one OpenAI- and Anthropic-compatible API for many AI models, with a developer dashboard, Playground, Image Studio, billing (Binance Pay, USDT BEP-20, JazzCash, Easypaisa, bank transfer) and an admin panel.

## Stack

pnpm monorepo:

- `apps/web`: Next.js 15 (website, dashboard, admin)
- `apps/api`: Express 5 + MongoDB (REST API and the `/v1` gateway)
- `packages/shared`: types, constants and money helpers

## Run locally

1. `pnpm install`
2. `cp .env.example .env`, then fill it in (MongoDB URI, secrets, providers)
3. `pnpm seed` (plans, payment methods, model catalog, admin user)
4. `pnpm dev`: website on http://localhost:3000, API on http://localhost:4000

## Deploy

See [`deploy/`](deploy): `bash deploy/push.sh SERVER_IP --setup` sets up a fresh Ubuntu server (Node, Caddy with HTTPS, systemd services).

Never commit `.env`; it holds the database password, encryption key and provider API keys.

#!/usr/bin/env bash
set -euo pipefail

# ── Prerequisites ─────────────────────────────────────────────────────────────
for cmd in docker pnpm node; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is not installed or not in PATH." >&2
    exit 1
  fi
done

# ── Start services ────────────────────────────────────────────────────────────
echo "Starting Docker services..."
docker compose up -d

# ── Wait for PostgreSQL ───────────────────────────────────────────────────────
echo "Waiting for PostgreSQL..."
deadline=$(( $(date +%s) + 30 ))
until docker compose exec -T postgres pg_isready -U verifit -d verifit &>/dev/null; do
  if [[ $(date +%s) -ge $deadline ]]; then
    echo "Error: PostgreSQL did not become ready within 30 seconds." >&2
    exit 1
  fi
  sleep 1
done
echo "PostgreSQL is ready."

# ── Wait for Redis ────────────────────────────────────────────────────────────
echo "Waiting for Redis..."
deadline=$(( $(date +%s) + 30 ))
until docker compose exec -T redis redis-cli ping &>/dev/null; do
  if [[ $(date +%s) -ge $deadline ]]; then
    echo "Error: Redis did not become ready within 30 seconds." >&2
    exit 1
  fi
  sleep 1
done
echo "Redis is ready."

# ── Load environment ─────────────────────────────────────────────────────────
if [[ -f .env.local ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env.local
  set +a
else
  echo "Warning: .env.local not found. Run: cp .env.example .env.local" >&2
fi

# ── Install dependencies ──────────────────────────────────────────────────────
echo "Installing dependencies..."
pnpm install

# ── Migrate ───────────────────────────────────────────────────────────────────
echo "Running database migrations..."
pnpm db:migrate

# ── Seed ─────────────────────────────────────────────────────────────────────
echo "Seeding database..."
pnpm db:seed

echo "Setup complete."

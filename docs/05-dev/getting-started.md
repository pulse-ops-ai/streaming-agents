# Getting Started

## Prerequisites

- Node 22+
- pnpm
- uv
- Docker (for LocalStack)
- Terraform
- LocalStack Ultimate

---

## Setup

1. Install JS dependencies
   pnpm install

2. Install Python dependencies
   cd python
   uv sync
   cd ..

3. Start LocalStack
   docker compose up -d

4. Apply Terraform (localstack)
   cd infra/envs/localstack
   tflocal init
   tflocal apply

5. Start services
   pnpm dev

---

## Demo

Run simulator:
pnpm run simulate

Open dashboard:
http://localhost:3000

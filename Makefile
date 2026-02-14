.PHONY: help install dev build test lint clean infra-up infra-down

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	pnpm install

dev: ## Start local development
	pnpm run dev

build: ## Build all packages & services
	pnpm run build

test: ## Run all tests
	pnpm run test

lint: ## Lint everything
	pnpm run lint

clean: ## Clean build artifacts
	pnpm run clean

infra-up: ## Spin up LocalStack infra
	cd infra/envs/localstack && terraform init && terraform apply -auto-approve

infra-down: ## Tear down LocalStack infra
	cd infra/envs/localstack && terraform destroy -auto-approve

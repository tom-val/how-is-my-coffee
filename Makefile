# Local development. Docker provides DynamoDB Local + MinIO; the API and the Expo client run on the
# host so they hot-reload.

.PHONY: help infra infra-down api api-lan seed test web aot-check set-password

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

infra: ## Start DynamoDB Local (:8000) and MinIO (:9000/:9001)
	docker compose up -d
	@echo "Waiting for DynamoDB Local…"; until curl -s -o /dev/null http://localhost:8000; do sleep 1; done
	@echo "Infra ready — run 'make seed' next."

infra-down: ## Stop and remove the local containers
	docker compose down

api: ## Run the API on http://localhost:5090
	dotnet run --project backend/src/Coffee.Api

api-lan: ## Run the API on 0.0.0.0:5090 so a phone on the same Wi-Fi can reach it
	dotnet run --project backend/src/Coffee.Api --launch-profile lan

seed: ## Create the table + photo bucket if missing and load the demo data
	dotnet run --project backend/tools/Coffee.Seed

test: ## Run the backend unit + integration tests (integration skips without 'make infra')
	dotnet test backend/Coffee.slnx

web: ## Run the Expo client in a browser
	cd app && npm run web

aot-check: ## Native AOT publish for this Mac — catches trimming/AOT breakage before CI does
	dotnet publish backend/src/Coffee.Api/Coffee.Api.csproj -c Release -r osx-arm64

set-password: ## Set a user's password: make set-password USER=tomas PASS=secret [REGION=eu-west-1] (uses your AWS credentials; add ENDPOINT=http://localhost:8000 for local)
	dotnet run --project backend/tools/Coffee.Admin -- set-password "$(USER)" "$(PASS)" --region "$(or $(REGION),eu-west-1)" $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",)

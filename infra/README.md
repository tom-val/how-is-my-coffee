# Infrastructure

Terraform for the coffee app: **one** .NET 10 Native AOT Lambda behind an HTTP API, the Expo web
export on S3, and a CloudFront distribution that fronts all three (`/` → web, `/v1/*` + `/health` →
API, `/uploads/*` → photos). State lives in S3 with a lock table, created by `bootstrap.sh`. AWS
auth in CI is GitHub OIDC — no static keys.

```
bootstrap.sh              one-time CloudShell setup (state bucket, lock table, OIDC, deploy role)
modules/
  dynamodb/               table CoffeeApp (PK/SK + GSI1), PITR, prevent_destroy
  lambda/                 generic Lambda + role + log group (provided.al2023 / bootstrap / arm64)
  api-gateway/            HTTP API, $default → Lambda, no authorizer
  s3-web/                 private bucket for the Expo web export (OAC)
  s3-photos/              private bucket for rating photos (OAC + presigned-PUT CORS)
  cloudfront/             distribution, OACs, SPA-rewrite function, optional custom domain + ACM
environments/
  prod/                   root module (its own state key)
```

## One-time bootstrap

```bash
bash infra/bootstrap.sh          # in CloudShell, admin credentials
```

Creates/refreshes `coffee-app-terraform-state`, `coffee-app-terraform-locks`, the GitHub OIDC
provider and the `coffee-app-github-actions` role, then prints the role ARN for `AWS_ROLE_ARN`.
It is idempotent — the state bucket and lock table already exist from the pre-rework stack.

> If the repo's existing `AWS_ROLE_ARN` points at a differently named role, either repoint the
> secret at the printed ARN or add the same permissions to that role. It now additionally needs
> `acm:*` (optional custom domain) and `dynamodb:*` on `CoffeeApp/index/*` (the new GSI1).

## Running it

```bash
cd infra/environments/prod
terraform init
terraform plan            # TF_VAR_openai_api_key=... for the AI caffeine fallback
```

`terraform fmt -check -recursive infra` and `terraform validate` run on every PR.

## GitHub secrets and variables

| Kind | Name | Required | Used by | Purpose |
|---|---|---|---|---|
| Secret | `AWS_ROLE_ARN` | yes | `deploy.yml` (all jobs) | OIDC role assumed to run Terraform, ship the Lambda zip, sync S3, invalidate CloudFront |
| Secret | `OPENAI_API_KEY` | no | `deploy.yml` → `TF_VAR_openai_api_key` | `OpenAi__ApiKey` on the Lambda. Unset ⇒ `POST /v1/drinks/resolve-caffeine` still answers from the static table and returns `source: "error"` for unknown drinks |
| Secret | `EXPO_TOKEN` | no | `eas-build.yml` | EAS CLI auth for native builds. Only needed once EAS is initialised |
| Variable | `AWS_REGION` | no | `deploy.yml` | Region for the OIDC session; defaults to `eu-west-1` |
| Environment | `Prod` | yes | `deploy-prod.yml` → `deploy.yml` | Holds the secrets above; add reviewers here to gate deploys |

The JWT signing secret is **not** a GitHub secret: `random_password` generates it in Terraform and
it goes straight into the Lambda's environment. Rotating it (tainting the resource) signs everyone out.

## How the Lambda code ships

Terraform creates the function with a tiny placeholder zip (`data.archive_file.placeholder`) and
carries `lifecycle { ignore_changes = [filename, source_code_hash] }`, so the infrastructure and the
application deploy independently and an apply never reverts the running code.

CI (`deploy.yml`, job `api`) then:

1. runs on `ubuntu-24.04-arm` and compiles inside an `amazonlinux:2023` container — Native AOT links
   against the build host's glibc, and the Ubuntu runner's is newer than the Lambda runtime's, so an
   Ubuntu-built binary dies with `GLIBC_2.xx not found`;
2. `dotnet publish backend/src/Coffee.Api/Coffee.Api.csproj -c Release -r linux-arm64`;
3. renames the native executable to `bootstrap` (what `provided.al2023` runs) and zips it *inside*
   the container, because the container writes as root;
4. `aws lambda update-function-code`, waits for `function-updated`, then curls `/health`.

The web build is plain `aws s3 sync app/dist s3://<web_bucket> --delete` plus a `/*` CloudFront
invalidation.

## Notes

- **Provider 5 → 6.** The pre-rework stack pinned `hashicorp/aws 5.82.2`; this is `~> 6.0`.
  Nothing in the config used a v5 form that v6 removed (no inline `aws_s3_bucket` `acl`/`cors_rule`/
  `policy`/`versioning` arguments — those were already separate resources). Two things to know:
  v6 adds a per-resource `region` argument (purely additive, everything inherits the provider), and
  `aws_dynamodb_table`'s `hash_key`/`range_key`/`attribute` are now soft-deprecated in favour of a
  `key_schema` block. The deprecated form is kept deliberately: it is what the existing state holds,
  it still works, and switching would raise the effective minimum provider version. `terraform
  validate` therefore prints two deprecation warnings — expected.
- **Backend locking.** The backend declares both `dynamodb_table` (deprecated) and
  `use_lockfile = true` (S3 conditional writes) during the transition. Drop the table once nothing
  older than Terraform 1.10 runs against this state.
- **`moved` blocks.** `environments/prod/main.tf` ends with the state migration from the pre-rework
  root module. They are what keeps the DynamoDB table, the photos bucket, the web bucket, the
  CloudFront distribution/OACs/function and the HTTP API itself (so its id, and therefore the
  CloudFront origin, is unchanged) instead of destroying and recreating them. The 19 per-handler
  Node Lambdas, their shared role and log groups, and the 19 old routes/integrations are dropped on
  purpose. Keep the blocks until one apply has run against prod; after that they are no-ops and can
  be deleted.
- **Guard rails.** `prevent_destroy` is on the DynamoDB table and the photos bucket — the only two
  resources holding data that cannot be rebuilt.
- **Dependency order.** The Lambda needs the CloudFront domain (`Photos__PublicBaseUrl`,
  `Cors__AllowedOrigins__0`) and CloudFront needs the API Gateway hostname, so the CloudFront origin
  is built from `module.gateway.api_id` rather than from the stage's `invoke_url`, and the gateway's
  own CORS config is static `["*"]`. Both details are what keep the graph acyclic — see the comments
  in `environments/prod/main.tf` before changing them.

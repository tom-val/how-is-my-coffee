data "aws_caller_identity" "current" {}

locals {
  env    = "prod"
  prefix = var.project_name

  tags = merge({
    Project     = var.project_name
    Environment = local.env
    ManagedBy   = "terraform"
  }, var.tags)

  # Bucket names are global and were created by the pre-rework stack as
  # <project>-photos-<account> / <project>-frontend-<account>. They MUST keep those exact names:
  # an S3 bucket name change is a replacement, i.e. every uploaded photo is deleted.
  photos_bucket_name = "${local.prefix}-photos-${data.aws_caller_identity.current.account_id}"
  web_bucket_name    = "${local.prefix}-frontend-${data.aws_caller_identity.current.account_id}"

  # Built from the API id rather than module.gateway.api_endpoint on purpose. The Lambda needs the
  # CloudFront domain in its environment (Photos__PublicBaseUrl, Cors__AllowedOrigins__0), so the
  # chain is lambda → gateway → cloudfront → lambda. It is not a cycle only because each hop lands
  # on a different resource: aws_apigatewayv2_api does not depend on the Lambda (the *integration*
  # does), and this output touches the api resource alone. Referencing api_endpoint or wiring the
  # CloudFront origins into the gateway's CORS config would reintroduce the cycle.
  api_origin_domain = "${module.gateway.api_id}.execute-api.${var.aws_region}.amazonaws.com"

  web_cf_origin = "https://${module.cloudfront.domain_name}"
  web_origin    = var.custom_domain != "" ? "https://${var.custom_domain}" : local.web_cf_origin
  # Every hostname the API may see as an Origin: the custom domain (when set) and the raw CloudFront
  # domain, which stays reachable and is what the app uses before a DNS cutover.
  web_origins = distinct(compact([local.web_origin, local.web_cf_origin]))
  # ASP.NET Core binds `Cors:AllowedOrigins` (a string[]) from indexed env vars: __0, __1, …
  api_cors_env = { for i, o in local.web_origins : "Cors__AllowedOrigins__${i}" => o }
}

# --- Data -------------------------------------------------------------------

module "dynamodb" {
  source = "../../modules/dynamodb"
  name   = "CoffeeApp"
  tags   = local.tags
}

module "photos" {
  source                      = "../../modules/s3-photos"
  name                        = local.photos_bucket_name
  cloudfront_distribution_arn = module.cloudfront.distribution_arn
  tags                        = local.tags
}

module "web" {
  source                      = "../../modules/s3-web"
  name                        = local.web_bucket_name
  cloudfront_distribution_arn = module.cloudfront.distribution_arn
  tags                        = local.tags
}

# --- Compute ----------------------------------------------------------------

# Signing key for the HS256 tokens the API mints and validates. Generated here so it is never typed
# by a human; it lives only in Terraform state and the function's (KMS-encrypted) environment.
# Changing it signs every user out — `terraform taint` it only when you mean that.
resource "random_password" "jwt_secret" {
  length  = 32
  special = false
}

module "api" {
  source      = "../../modules/lambda"
  name        = "${local.prefix}-api"
  memory_size = 512
  timeout     = 30

  environment = merge({
    ASPNETCORE_ENVIRONMENT = "Production"
    Dynamo__TableName      = module.dynamodb.table_name
    Auth__JwtSecret        = random_password.jwt_secret.result
    Photos__Bucket         = module.photos.bucket_id
    # Just the CloudFront origin: photo keys already start with `uploads/`, and the /uploads/*
    # behaviour maps straight onto the photos bucket root, so photoUrl = <base>/uploads/<user>/<id>.jpg.
    Photos__PublicBaseUrl = local.web_cf_origin
    OpenAi__ApiKey        = var.openai_api_key
    Google__PlacesApiKey  = var.google_places_api_key
  }, local.api_cors_env)

  extra_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:TransactGetItems",
          "dynamodb:TransactWriteItems",
        ]
        # The table and every index on it (GSI1 backs the username prefix search).
        Resource = [module.dynamodb.table_arn, "${module.dynamodb.table_arn}/index/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${module.photos.bucket_arn}/*"
      }
    ]
  })

  tags = local.tags
}

module "gateway" {
  source               = "../../modules/api-gateway"
  name                 = "${local.prefix}-api"
  lambda_invoke_arn    = module.api.invoke_arn
  lambda_function_name = module.api.function_name
  # Left wide open deliberately. Browsers reach the API through CloudFront on the same origin as the
  # web app (so no preflight at all), native clients ignore CORS, and the .NET app enforces the real
  # allow-list via Cors__AllowedOrigins. Narrowing it here would make the gateway depend on the
  # CloudFront domain and close the dependency cycle described above.
  cors_allow_origins = ["*"]
  tags               = local.tags
}

# --- Edge -------------------------------------------------------------------

module "cloudfront" {
  source = "../../modules/cloudfront"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
  name                 = local.prefix
  web_bucket_domain    = module.web.bucket_regional_domain_name
  photos_bucket_domain = module.photos.bucket_regional_domain_name
  api_origin_domain    = local.api_origin_domain
  custom_domain        = var.custom_domain
  acm_certificate_arn  = var.acm_certificate_arn
  tags                 = local.tags
}

# --- State migration from the pre-rework layout ------------------------------
#
# The old root module (terraform/*.tf) held these resources at the top level. Without these blocks
# Terraform would see "resource gone from config" + "new resource" and destroy/recreate them —
# wiping the DynamoDB table and the photo bucket, and handing out a new CloudFront domain.
#
# Everything NOT listed here is intentionally destroyed: the 19 per-handler Node Lambdas, their
# shared IAM role and policies, their log groups, and the 19 API Gateway routes + integrations.

moved {
  from = aws_dynamodb_table.main
  to   = module.dynamodb.aws_dynamodb_table.this
}

moved {
  from = aws_s3_bucket.photos
  to   = module.photos.aws_s3_bucket.this
}

moved {
  from = aws_s3_bucket_cors_configuration.photos
  to   = module.photos.aws_s3_bucket_cors_configuration.this
}

moved {
  from = aws_s3_bucket_public_access_block.photos
  to   = module.photos.aws_s3_bucket_public_access_block.this
}

moved {
  from = aws_s3_bucket_policy.photos
  to   = module.photos.aws_s3_bucket_policy.this
}

moved {
  from = aws_s3_bucket.frontend
  to   = module.web.aws_s3_bucket.this
}

moved {
  from = aws_s3_bucket_public_access_block.frontend
  to   = module.web.aws_s3_bucket_public_access_block.this
}

moved {
  from = aws_s3_bucket_policy.frontend
  to   = module.web.aws_s3_bucket_policy.this
}

moved {
  from = aws_cloudfront_distribution.main
  to   = module.cloudfront.aws_cloudfront_distribution.this
}

moved {
  from = aws_cloudfront_origin_access_control.frontend
  to   = module.cloudfront.aws_cloudfront_origin_access_control.web
}

moved {
  from = aws_cloudfront_origin_access_control.photos
  to   = module.cloudfront.aws_cloudfront_origin_access_control.photos
}

moved {
  from = aws_cloudfront_function.spa_rewrite
  to   = module.cloudfront.aws_cloudfront_function.spa_rewrite
}

# Keeping the existing HTTP API keeps its id — so the CloudFront origin hostname and the public
# endpoint never change. Its old routes/integrations are replaced by the single $default route.
moved {
  from = aws_apigatewayv2_api.main
  to   = module.gateway.aws_apigatewayv2_api.this
}

moved {
  from = aws_apigatewayv2_stage.default
  to   = module.gateway.aws_apigatewayv2_stage.default
}

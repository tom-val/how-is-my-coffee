# Copy to prod.tfvars (gitignored) for local runs, or pass via TF_VAR_* in CI.
aws_region   = "eu-west-1"
project_name = "coffee-app"

# openai_api_key comes from the OPENAI_API_KEY secret (TF_VAR_openai_api_key) in CI.
# openai_api_key = "sk-..."

# Optional custom domain (in CI: GitHub variables APP_CUSTOM_DOMAIN + APP_ACM_CERTIFICATE_ARN).
# The certificate is an ISSUED ACM certificate in us-east-1, created or reused in the ACM console.
# custom_domain       = "coffee.example.com"
# acm_certificate_arn = "arn:aws:acm:us-east-1:<account>:certificate/<id>"
# google_places_api_key comes from the GOOGLE_PLACES_API_KEY secret (TF_VAR_google_places_api_key) in CI.
# google_places_api_key = "AIza..."

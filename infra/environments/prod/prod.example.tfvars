# Copy to prod.tfvars (gitignored) for local runs, or pass via TF_VAR_* in CI.
aws_region   = "eu-west-1"
project_name = "coffee-app"

# openai_api_key comes from the OPENAI_API_KEY secret (TF_VAR_openai_api_key) in CI.
# openai_api_key = "sk-..."

# Optional custom domain. Apply once with only custom_domain set, create the DNS records from the
# acm_validation_records output, wait for ISSUED, then uncomment acm_certificate_arn and re-apply.
# custom_domain       = "coffee.example.com"
# acm_certificate_arn = "arn:aws:acm:us-east-1:<account>:certificate/<id>"

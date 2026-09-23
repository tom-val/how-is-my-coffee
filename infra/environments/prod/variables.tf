variable "aws_region" {
  description = "Region for every resource except the CloudFront ACM certificate"
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Resource name prefix. Changing it renames (and for S3, replaces) live resources."
  type        = string
  default     = "coffee-app"
}

# Supplied by CI from the OPENAI_API_KEY secret. Empty is safe: the caffeine lookup still answers
# from the static table and only falls back to `{ caffeineMg: 0, source: "error" }` for unknown drinks.
variable "openai_api_key" {
  description = "OpenAI API key used by POST /v1/drinks/resolve-caffeine"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_places_api_key" {
  description = "Google Places API (New) key used server-side for café autocomplete. Unset ⇒ the app falls back to Nominatim."
  type        = string
  sensitive   = true
  default     = ""
}

# Optional custom domain for the web app (e.g. coffee.valiunas.dev). Empty ⇒ *.cloudfront.net only.
# In CI it comes from the GitHub variable APP_CUSTOM_DOMAIN.
variable "custom_domain" {
  type    = string
  default = ""
}

# ARN of an ISSUED us-east-1 ACM certificate covering custom_domain (created or reused in the ACM
# console). In CI it comes from the GitHub variable APP_ACM_CERTIFICATE_ARN.
variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "tags" {
  description = "Extra tags merged into the defaults applied to every resource"
  type        = map(string)
  default     = {}
}

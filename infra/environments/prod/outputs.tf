output "api_function_name" {
  description = "Lambda function CI ships the AOT bootstrap zip to"
  value       = module.api.function_name
}

output "api_endpoint" {
  description = "Direct API Gateway base URL (health checks; clients use the CloudFront origin)"
  value       = module.gateway.api_endpoint
}

output "web_bucket" {
  description = "S3 bucket the Expo web export is synced to"
  value       = module.web.bucket_id
}

output "photos_bucket" {
  description = "S3 bucket holding uploads/<userId>/<uuid>.<ext>"
  value       = module.photos.bucket_id
}

output "cloudfront_distribution_id" {
  description = "Distribution id used for cache invalidation"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_domain" {
  description = "Distribution hostname — also the API base URL the clients use"
  value       = module.cloudfront.domain_name
}

output "web_url" {
  description = "Public URL of the web app"
  value       = local.web_origin
}

# Only meaningful when custom_domain is set: the CNAMEs to create, then the ARN to feed back into
# var.acm_certificate_arn once ACM reports ISSUED.
output "acm_certificate_arn" {
  value = module.cloudfront.acm_certificate_arn
}

output "acm_validation_records" {
  value = module.cloudfront.acm_validation_records
}

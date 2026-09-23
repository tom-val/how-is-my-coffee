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

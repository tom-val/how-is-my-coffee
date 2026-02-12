output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidation)"
  value       = aws_cloudfront_distribution.main.id
}

output "api_gateway_url" {
  description = "API Gateway HTTP API endpoint"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "frontend_bucket" {
  description = "S3 bucket name for frontend static files"
  value       = aws_s3_bucket.frontend.id
}

output "photos_bucket" {
  description = "S3 bucket name for photo uploads"
  value       = aws_s3_bucket.photos.id
}

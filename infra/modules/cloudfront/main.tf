terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
      # CloudFront certificates must live in us-east-1 regardless of where the rest of the stack is.
      configuration_aliases = [aws.us_east_1]
    }
  }
}

variable "name" {
  type = string
}

variable "web_bucket_domain" {
  description = "bucket_regional_domain_name of the web (Expo export) bucket"
  type        = string
}

variable "photos_bucket_domain" {
  description = "bucket_regional_domain_name of the photos bucket"
  type        = string
}

variable "api_origin_domain" {
  description = "API Gateway hostname (no scheme), e.g. abc123.execute-api.eu-west-1.amazonaws.com"
  type        = string
}

# Optional custom domain. Empty (the default) ⇒ the app is served only on the *.cloudfront.net name.
variable "custom_domain" {
  type    = string
  default = ""
}

# ARN of an ISSUED ACM certificate in us-east-1 that covers custom_domain. The certificate is
# created (or reused) outside Terraform, once, in the ACM console: CloudFront refuses an alias whose
# certificate is still pending validation, and managing it here meant a two-apply dance. The alias
# is attached only when both custom_domain and this ARN are set.
variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}

locals {
  # AWS-managed policies (same ids in every account/region).
  cache_optimized        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  cache_disabled         = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader

  aliases = var.custom_domain != "" && var.acm_certificate_arn != "" ? [var.custom_domain] : []
}


resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "photos" {
  name                              = "${var.name}-photos-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Expo Router's web export is a SPA: deep links like /rating/abc have no object in S3. Anything
# without a file extension is rewritten to /index.html so the client router can take over. Assets
# (with extensions) and the /v1, /health, /uploads behaviours never reach this function.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      if (request.uri.includes('.')) {
        return request;
      }
      request.uri = '/index.html';
      return request;
    }
  JS
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  default_root_object = "index.html"
  comment             = var.name
  price_class         = "PriceClass_100"
  aliases             = local.aliases

  origin {
    domain_name              = var.web_bucket_domain
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    domain_name              = var.photos_bucket_domain
    origin_id                = "s3-photos"
    origin_access_control_id = aws_cloudfront_origin_access_control.photos.id
  }

  origin {
    domain_name = var.api_origin_domain
    origin_id   = "api-gateway"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Web app.
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_optimized
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # API. CachingDisabled = TTL 0 everywhere; AllViewerExceptHostHeader forwards the query string,
  # cookies and every header INCLUDING Authorization, while leaving Host as the API Gateway
  # hostname (API Gateway rejects a mismatched Host on its execute-api domain).
  ordered_cache_behavior {
    path_pattern             = "/v1/*"
    target_origin_id         = "api-gateway"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.all_viewer_except_host
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/health"
    target_origin_id         = "api-gateway"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.all_viewer_except_host
    compress                 = true
  }

  # Photo keys are `uploads/<userId>/<uuid>.jpg` at the bucket root, so the request path maps 1:1
  # onto the key — no prefix rewriting. Immutable objects (uuid names) ⇒ cache hard.
  ordered_cache_behavior {
    path_pattern           = "/uploads/*"
    target_origin_id       = "s3-photos"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_optimized
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == "" ? true : null
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.acm_certificate_arn != "" ? "TLSv1.2_2021" : null
  }

  tags = var.tags
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}

output "domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

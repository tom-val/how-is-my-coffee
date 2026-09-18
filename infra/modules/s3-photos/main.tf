terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "name" {
  description = "Bucket name. Keep the existing coffee-app-photos-<account-id> — renaming loses every uploaded photo."
  type        = string
}

variable "cloudfront_distribution_arn" {
  type = string
}

# Origins allowed to PUT directly to S3 with a presigned URL. The signature is the real
# authorization boundary (5-minute expiry, minted by the API for the signed-in user), and no cookies
# are sent, so "*" is safe here — it only has to cover every app origin, including native WebViews.
variable "cors_origins" {
  type    = list(string)
  default = ["*"]
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Private bucket for rating photos. Keys are `uploads/<userId>/<uuid>.<ext>` and are served publicly
# only through the CloudFront /uploads/* behaviour, which maps to this bucket's root.
resource "aws_s3_bucket" "this" {
  bucket = var.name
  tags   = var.tags

  # Every uploaded photo. See the dynamodb module for the same reasoning.
  lifecycle {
    prevent_destroy = true
  }
}

# The browser sends a CORS preflight before the signed PUT; without a matching rule S3 answers 403
# on the OPTIONS. ETag is exposed so the client can verify the upload it just made.
resource "aws_s3_bucket_cors_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = var.cors_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.this.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = var.cloudfront_distribution_arn
        }
      }
    }]
  })
}

output "bucket_id" {
  value = aws_s3_bucket.this.id
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.this.bucket_regional_domain_name
}

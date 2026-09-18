terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Unchanged from the pre-rework terraform/main.tf so the existing state (and therefore the live
  # DynamoDB table, the photo bucket and the CloudFront distribution) is reused rather than
  # recreated. Backend blocks cannot interpolate, so a fork must edit these literals AND pass the
  # same bucket name to bootstrap.sh via STATE_BUCKET.
  backend "s3" {
    bucket = "coffee-app-terraform-state"
    key    = "coffee-app/terraform.tfstate"
    region = "eu-west-1"
    # DynamoDB locking is deprecated in favour of S3 conditional writes (use_lockfile). Both are
    # declared during the transition: drop dynamodb_table (and the table) once every machine that
    # runs Terraform is on >= 1.10.
    dynamodb_table = "coffee-app-terraform-locks"
    use_lockfile   = true
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# CloudFront viewer certificates must be issued in us-east-1, whatever region the stack lives in.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

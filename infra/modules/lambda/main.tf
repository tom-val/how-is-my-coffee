terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

variable "name" {
  type = string
}

variable "runtime" {
  type    = string
  default = "provided.al2023" # Native AOT custom runtime (.NET) — no JIT, fast cold start
}

variable "handler" {
  type    = string
  default = "bootstrap" # the AOT-published native executable
}

variable "architecture" {
  type    = string
  default = "arm64"
}

variable "memory_size" {
  type    = number
  default = 512
}

variable "timeout" {
  type    = number
  default = 30
}

variable "environment" {
  type    = map(string)
  default = {}
}

# Optional extra inline IAM policy (JSON) for this function's role.
variable "extra_policy_json" {
  type    = string
  default = null
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Placeholder package so the function can be created before any code exists. CI ships the real
# binary via `aws lambda update-function-code`; the lifecycle ignore_changes below keeps Terraform
# from reverting those updates on the next apply.
data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/.placeholder-${var.name}.zip"
  source {
    content  = "placeholder - real code shipped by CI"
    filename = "placeholder.txt"
  }
}

resource "aws_iam_role" "this" {
  name = "${var.name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "extra" {
  count  = var.extra_policy_json == null ? 0 : 1
  name   = "${var.name}-extra"
  role   = aws_iam_role.this.id
  policy = var.extra_policy_json
}

# Lambda encrypts environment variables at rest; when the account uses a customer-managed KMS key
# the execution role needs kms:Decrypt or the function never starts (no logs, opaque 500s).
resource "aws_iam_role_policy" "kms_decrypt" {
  name = "${var.name}-kms-decrypt"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt"]
      Resource = "*"
    }]
  })
}

# Created explicitly (with retention) so logs exist and expire, rather than relying on Lambda's
# first-invocation auto-creation which defaults to never-expire.
resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  role          = aws_iam_role.this.arn
  runtime       = var.runtime
  handler       = var.handler
  architectures = [var.architecture]
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = var.environment
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy_attachment.logs,
    aws_cloudwatch_log_group.this,
  ]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "invoke_arn" {
  value = aws_lambda_function.this.invoke_arn
}

output "role_arn" {
  value = aws_iam_role.this.arn
}

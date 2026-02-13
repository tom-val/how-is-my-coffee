variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "eu-west-1"
}

variable "aws_account_id" {
  description = "AWS account ID (passed via TF_VAR_aws_account_id in CI/CD)"
  type        = string
}

variable "openai_api_key" {
  description = "OpenAI API key for AI caffeine resolution"
  type        = string
  sensitive   = true
  default     = ""
}

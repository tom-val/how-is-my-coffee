terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "name" {
  description = "Table name. MUST stay CoffeeApp — production data lives in it."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Single-table design (see docs/api-contract.md): PK/SK carry every entity
# (USER#, RATING#, PLACE#, USERNAME#). On-demand billing — traffic is spiky and tiny.
resource "aws_dynamodb_table" "this" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # GSI1 attributes are sparse: only items that set them are indexed.
  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  # Username prefix search (`GET /v1/users/search?q=`): USERNAME# items carry
  # GSI1PK = "USERNAME", GSI1SK = <username>, so a begins_with query replaces a table scan.
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags

  # The only copy of every rating, user and password hash. Never let a refactor destroy it:
  # removing this table from the config requires removing prevent_destroy first, on purpose.
  lifecycle {
    prevent_destroy = true
  }
}

output "table_name" {
  value = aws_dynamodb_table.this.name
}

output "table_arn" {
  value = aws_dynamodb_table.this.arn
}

# --- Shared IAM role for all Lambda functions ---

resource "aws_iam_role" "lambda" {
  name = "${local.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_app" {
  name = "${local.project_name}-lambda-app-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
        ]
        Resource = aws_dynamodb_table.main.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.photos.arn}/*"
      }
    ]
  })
}

# --- Lambda functions (one per handler) ---

resource "aws_lambda_function" "handlers" {
  for_each = local.handlers

  function_name = "${local.project_name}-${each.key}"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../dist/lambdas/${each.key}.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/lambdas/${each.key}.zip")

  environment {
    variables = merge(
      {
        S3_BUCKET = aws_s3_bucket.photos.id
        S3_REGION = var.aws_region
      },
      var.openai_api_key != "" ? { OPENAI_API_KEY = var.openai_api_key } : {}
    )
  }
}

# --- CloudWatch log groups ---

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.handlers

  name              = "/aws/lambda/${local.project_name}-${each.key}"
  retention_in_days = 14
}

# --- API Gateway invoke permissions ---

resource "aws_lambda_permission" "apigw" {
  for_each = local.handlers

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handlers[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

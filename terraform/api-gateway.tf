resource "aws_apigatewayv2_api" "main" {
  name          = "${local.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "x-user-id"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

# --- Integrations (one per handler) ---

resource "aws_apigatewayv2_integration" "handlers" {
  for_each = local.handlers

  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.handlers[each.key].invoke_arn
  payload_format_version = "2.0"
}

# --- Routes (one per handler) ---

resource "aws_apigatewayv2_route" "handlers" {
  for_each = local.handlers

  api_id    = aws_apigatewayv2_api.main.id
  route_key = "${each.value.method} ${each.value.route}"
  target    = "integrations/${aws_apigatewayv2_integration.handlers[each.key].id}"
}

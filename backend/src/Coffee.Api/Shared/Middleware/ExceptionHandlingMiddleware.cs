using System.Text.Json;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Middleware;

/// <summary>
/// Catches unhandled exceptions and answers with the same <c>{ "error": ... }</c> body every other
/// endpoint uses, logging the detail for CloudWatch. Replaces the old handlers' per-file try/catch.
/// </summary>
public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // The client went away — not a server fault, and there is nobody left to answer.
            logger.LogDebug("Request {Method} {Path} was canceled by the client",
                context.Request.Method, context.Request.Path);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception processing {Method} {Path}",
                context.Request.Method, context.Request.Path);

            if (context.Response.HasStarted) throw; // too late to write a clean JSON 500

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(
                new ErrorResponse("Internal server error"),
                ApiJsonSerializerContext.Default.ErrorResponse));
        }
    }
}

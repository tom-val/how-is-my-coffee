namespace Coffee.Api.Shared.Serialization;

// Shared response shapes, replacing the anonymous objects the old Node handlers returned: Native AOT
// forbids reflection-based System.Text.Json, so every serialized shape needs a named type the source
// generator can see. Property names serialize camelCase: Error→"error", Status→"status".
public sealed record ErrorResponse(string Error);
public sealed record StatusResponse(string Status);

/// <summary>
/// AOT-safe helpers for "error body + status code". <c>Results.Json</c>'s default overload is
/// reflection-based; these route through the source-generated <see cref="ErrorResponse"/> type info,
/// so call sites stay terse and warning-free.
/// </summary>
public static class ApiResults
{
    public static IResult Error(string message, int statusCode) =>
        Results.Json(new ErrorResponse(message), ApiJsonSerializerContext.Default.ErrorResponse, statusCode: statusCode);

    public static IResult BadRequest(string message) => Error(message, StatusCodes.Status400BadRequest);
    public static IResult Unauthorized(string message = "unauthorized") => Error(message, StatusCodes.Status401Unauthorized);
    public static IResult Forbidden(string message = "forbidden") => Error(message, StatusCodes.Status403Forbidden);
    public static IResult NotFound(string message = "not_found") => Error(message, StatusCodes.Status404NotFound);
    public static IResult Conflict(string message = "conflict") => Error(message, StatusCodes.Status409Conflict);

    public static IResult Deleted() =>
        Results.Json(new StatusResponse("deleted"), ApiJsonSerializerContext.Default.StatusResponse);
}

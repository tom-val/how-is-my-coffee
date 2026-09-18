using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Features.Health;

public sealed record HealthDto(string Status);

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        // Liveness — public, and what the deploy smoke check hits.
        app.MapGet("/health", () => Results.Json(new HealthDto("ok"), ApiJsonSerializerContext.Default.HealthDto))
            .WithName("Health");

        return app;
    }
}

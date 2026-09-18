using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Caffeine;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Features.Caffeine;

public sealed record ResolveCaffeineBody(string? DrinkName);

/// <summary><c>source</c> tells the client how much to trust the number: table &gt; ai &gt; error.</summary>
public sealed record ResolveCaffeineDto(int CaffeineMg, string Source);

public static class CaffeineEndpoints
{
    public static IEndpointRouteBuilder MapCaffeineEndpoints(this IEndpointRouteBuilder app)
    {
        // The static table first — it is free, instant, and covers the drinks people actually log.
        // Only genuinely unknown names cost an OpenAI round trip, and a failure there is not an
        // error for the caller: they get 0 mg and can type their own number.
        app.MapPost("/v1/drinks/resolve-caffeine", async (
            ResolveCaffeineBody body, AuthContext auth, ICaffeineAiResolver ai, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            var drinkName = (body.DrinkName ?? string.Empty).Trim();
            if (drinkName.Length is < 1 or > 100) return ApiResults.BadRequest("drinkName must be 1-100 characters");

            if (CaffeineTable.Lookup(drinkName) is { } known)
            {
                return Results.Json(
                    new ResolveCaffeineDto(known, "table"), ApiJsonSerializerContext.Default.ResolveCaffeineDto);
            }

            var estimated = await ai.ResolveAsync(drinkName, ct);
            return Results.Json(
                estimated is { } mg ? new ResolveCaffeineDto(mg, "ai") : new ResolveCaffeineDto(0, "error"),
                ApiJsonSerializerContext.Default.ResolveCaffeineDto);
        });

        return app;
    }
}

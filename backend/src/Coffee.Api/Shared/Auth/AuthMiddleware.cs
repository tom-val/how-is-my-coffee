namespace Coffee.Api.Shared.Auth;

/// <summary>
/// Populates the request-scoped <see cref="AuthContext"/> from a Bearer token. It never rejects on
/// its own: the public endpoints (<c>/health</c>, register, login, public profile and its ratings)
/// simply see an anonymous context, and everything else calls
/// <see cref="AuthContextExtensions.TryRequireUser"/> to answer 401. That keeps "who may call this"
/// next to the endpoint rather than in a path list that drifts.
/// </summary>
public sealed class AuthMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, AuthContext auth, JwtIssuer jwt)
    {
        var header = context.Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = header["Bearer ".Length..].Trim();
            if (jwt.TryValidate(token, out var userId, out var username))
            {
                auth.UserId = userId;
                auth.Username = username;
            }
        }

        await next(context);
    }
}

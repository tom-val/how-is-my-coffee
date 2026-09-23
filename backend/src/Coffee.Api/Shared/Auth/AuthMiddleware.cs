namespace Coffee.Api.Shared.Auth;

/// <summary>
/// Populates the request-scoped <see cref="AuthContext"/> from a Bearer token. It never rejects on
/// its own: the public endpoints (<c>/health</c>, register, login, public profile and its ratings)
/// simply see an anonymous context, and everything else calls
/// <see cref="AuthContextExtensions.TryRequireUser"/> to answer 401. That keeps "who may call this"
/// next to the endpoint rather than in a path list that drifts.
/// <para>
/// A valid signature is not enough: the account must still exist (see <see cref="IAccountLookup"/>).
/// A deleted user's token therefore resolves to an anonymous context, and every protected endpoint
/// answers 401 <c>unauthorized</c> through the same <c>TryRequireUser</c> guard — no endpoint has to
/// remember to check. The lookup runs here, once per request, so the scoped context is the
/// per-request cache.
/// </para>
/// </summary>
public sealed class AuthMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, AuthContext auth, JwtIssuer jwt, IAccountLookup accounts)
    {
        var header = context.Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = header["Bearer ".Length..].Trim();
            if (jwt.TryValidate(token, out var userId, out var username)
                && await accounts.ExistsAsync(userId, context.RequestAborted))
            {
                auth.UserId = userId;
                auth.Username = username;
            }
        }

        await next(context);
    }
}

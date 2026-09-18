using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Auth;

/// <summary>
/// Per-request identity, resolved by <see cref="AuthMiddleware"/> from the <c>Authorization: Bearer</c>
/// token. Null <see cref="UserId"/> means "no valid token" — which is fine on the handful of public
/// endpoints and a 401 everywhere else.
/// </summary>
public sealed class AuthContext
{
    public string? UserId { get; set; }
    public string? Username { get; set; }

    public bool IsAuthenticated => UserId is not null;
}

public static class AuthContextExtensions
{
    /// <summary>
    /// Guard for protected endpoints: hands back the caller's id, or writes the contract's
    /// <c>401 { "error": "unauthorized" }</c>. Used as
    /// <c>if (!auth.TryRequireUser(out var userId, out var fail)) return fail;</c>.
    /// </summary>
    public static bool TryRequireUser(this AuthContext auth, out string userId, out IResult failure)
    {
        userId = auth.UserId ?? string.Empty;
        failure = ApiResults.Unauthorized();
        return auth.IsAuthenticated;
    }
}

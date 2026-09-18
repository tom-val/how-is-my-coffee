using Coffee.Api.Shared.Auth;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Coffee.Api.Tests;

public class JwtIssuerTests
{
    private static JwtIssuer Issuer(string secret = "test-secret-value") =>
        new(new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:JwtSecret"] = secret })
            .Build());

    [Fact]
    public void Issued_token_validates_and_carries_its_claims()
    {
        var token = Issuer().Issue("user-1", "tomas");

        Assert.True(Issuer().TryValidate(token, out var userId, out var username));
        Assert.Equal("user-1", userId);
        Assert.Equal("tomas", username);
    }

    [Fact]
    public void Expired_token_is_rejected()
    {
        // Issued longer ago than the lifetime, so `exp` is already in the past.
        var token = Issuer().Issue("user-1", "tomas", DateTimeOffset.UtcNow - JwtIssuer.Lifetime - TimeSpan.FromMinutes(1));

        Assert.False(Issuer().TryValidate(token, out _, out _));
    }

    [Fact]
    public void Tampered_payload_is_rejected()
    {
        var parts = Issuer().Issue("user-1", "tomas").Split('.');
        // Re-sign nothing: swap the payload for another user's and keep the original signature.
        var forgedPayload = Issuer().Issue("user-2", "mallory").Split('.')[1];

        Assert.False(Issuer().TryValidate($"{parts[0]}.{forgedPayload}.{parts[2]}", out _, out _));
    }

    [Fact]
    public void Token_signed_with_another_secret_is_rejected()
    {
        var token = Issuer("secret-a").Issue("user-1", "tomas");

        Assert.False(Issuer("secret-b").TryValidate(token, out _, out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not.a.jwt.at.all")]
    [InlineData("onlyonepart")]
    public void Malformed_tokens_are_rejected(string? token)
    {
        Assert.False(Issuer().TryValidate(token, out _, out _));
    }

    [Fact]
    public void A_missing_secret_fails_fast_at_construction()
    {
        Assert.Throws<InvalidOperationException>(() => new JwtIssuer(new ConfigurationBuilder().Build()));
    }
}

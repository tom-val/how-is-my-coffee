using Coffee.Api.Shared.Auth;
using Xunit;

namespace Coffee.Api.Tests;

public class PasswordHasherTests
{
    /// <summary>
    /// A hash produced by the OLD Node backend:
    /// <c>node -e "const c=require('crypto');const s='0123456789abcdef0123456789abcdef';
    /// console.log(s+':'+c.scryptSync('coffee123',s,64).toString('hex'))"</c>.
    /// If the managed scrypt ever stops reproducing this, every pre-migration user is locked out —
    /// which is exactly the failure this test exists to catch.
    /// </summary>
    private const string LegacyHash =
        "0123456789abcdef0123456789abcdef:12376cc10993d4566e71095e85367db477b56c9efe202de260557f6e5ac70df8d1e17573177baa24275bca129188eaa17ae889c03019e46a7c17b5ef2eb68262";

    [Fact]
    public void Pbkdf2_hash_round_trips()
    {
        var hash = PasswordHasher.Hash("coffee123");

        Assert.StartsWith($"pbkdf2${PasswordHasher.Iterations}$", hash, StringComparison.Ordinal);
        Assert.True(PasswordHasher.Verify("coffee123", hash));
        Assert.False(PasswordHasher.Verify("Coffee123", hash));
        Assert.False(PasswordHasher.NeedsRehash(hash));
    }

    [Fact]
    public void Pbkdf2_uses_a_random_salt_per_hash()
    {
        Assert.NotEqual(PasswordHasher.Hash("coffee123"), PasswordHasher.Hash("coffee123"));
    }

    [Fact]
    public void Legacy_scrypt_hash_from_node_still_verifies()
    {
        Assert.True(PasswordHasher.Verify("coffee123", LegacyHash));
        Assert.False(PasswordHasher.Verify("wrong-password", LegacyHash));
    }

    [Fact]
    public void Legacy_scrypt_hash_is_flagged_for_upgrade()
    {
        Assert.True(PasswordHasher.NeedsRehash(LegacyHash));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-hash")]
    [InlineData("pbkdf2$notanumber$c2FsdA==$aGFzaA==")]
    [InlineData("zz:zz")]
    public void Malformed_hashes_never_verify(string? stored)
    {
        Assert.False(PasswordHasher.Verify("coffee123", stored));
    }
}

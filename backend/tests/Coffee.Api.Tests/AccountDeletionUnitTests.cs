using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Storage;
using Xunit;

namespace Coffee.Api.Tests;

public class AccountDeletionUnitTests
{
    private static AttributeValue Companion(string displayName, string? userId = null, string? username = null)
    {
        var map = new Dictionary<string, AttributeValue> { [Attr.DisplayName] = Av.S(displayName) };
        map.PutIfPresent(Attr.UserId, userId);
        map.PutIfPresent(Attr.Username, username);
        return Av.M(map);
    }

    [Fact]
    public void WithoutCompanion_drops_only_that_user_and_keeps_everyone_else_verbatim()
    {
        var stored = new List<AttributeValue>
        {
            Companion("Anna", "u-anna", "anna"),
            Companion("Guest Bob"),
            Companion("Carl", "u-carl", "carl"),
            Companion("Anna again", "u-anna", "anna"),
        };

        var remaining = RatingMapper.WithoutCompanion(stored, "u-anna");

        Assert.Equal(2, remaining.Count);
        Assert.Same(stored[1], remaining[0]);
        Assert.Same(stored[2], remaining[1]);
    }

    [Fact]
    public void WithoutCompanion_is_a_no_op_when_the_user_is_not_listed()
    {
        var stored = new List<AttributeValue> { Companion("Guest Bob"), Companion("Carl", "u-carl", "carl") };

        Assert.Equal(stored, RatingMapper.WithoutCompanion(stored, "u-anna"));
        Assert.Empty(RatingMapper.WithoutCompanion([], "u-anna"));
    }

    [Fact]
    public void WithoutCompanion_keeps_entries_that_are_not_maps()
    {
        // Whatever odd shape an old row carries is not ours to throw away.
        var stored = new List<AttributeValue> { Av.S("legacy"), Companion("Anna", "u-anna") };

        var remaining = RatingMapper.WithoutCompanion(stored, "u-anna");

        Assert.Single(remaining);
        Assert.Equal("legacy", remaining[0].S);
    }

    [Theory]
    [InlineData("uploads/u-1/abc.jpg", "u-1", true)]
    [InlineData("uploads/u-1/nested/abc.png", "u-1", true)]
    [InlineData("uploads/u-2/abc.jpg", "u-1", false)]
    [InlineData("uploads/u-10/abc.jpg", "u-1", false)]
    [InlineData("uploads/u-1/../u-2/abc.jpg", "u-1", false)]
    [InlineData("other/u-1/abc.jpg", "u-1", false)]
    [InlineData("", "u-1", false)]
    [InlineData(null, "u-1", false)]
    [InlineData("uploads//abc.jpg", "", false)]
    public void Only_a_users_own_upload_keys_may_be_deleted(string? key, string userId, bool owned)
    {
        Assert.Equal(owned, IPhotoStorage.IsOwnedBy(key, userId));
    }
}

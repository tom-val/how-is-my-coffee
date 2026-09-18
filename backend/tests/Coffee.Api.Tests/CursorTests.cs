using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;
using Xunit;

namespace Coffee.Api.Tests;

public class CursorTests
{
    [Fact]
    public void Key_cursor_round_trips()
    {
        var key = new Dictionary<string, AttributeValue>
        {
            ["PK"] = Av.S("USER#11111111-1111-1111-1111-111111111111"),
            ["SK"] = Av.S("RATING#2025-02-01T08:00:00.000Z#r3"),
        };

        var decoded = Cursor.DecodeKey(Cursor.EncodeKey(key));

        Assert.NotNull(decoded);
        Assert.Equal(key["PK"].S, decoded!["PK"].S);
        Assert.Equal(key["SK"].S, decoded["SK"].S);
    }

    [Fact]
    public void Encoded_cursor_is_url_safe()
    {
        var cursor = Cursor.EncodeKey(new Dictionary<string, AttributeValue> { ["PK"] = Av.S("USER#ümlaut/+?") })!;

        Assert.DoesNotContain('+', cursor);
        Assert.DoesNotContain('/', cursor);
        Assert.DoesNotContain('=', cursor);
    }

    [Fact]
    public void No_last_evaluated_key_means_no_next_page()
    {
        Assert.Null(Cursor.EncodeKey(null));
        Assert.Null(Cursor.EncodeKey([]));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("!!!not-base64!!!")]
    public void An_unreadable_cursor_starts_from_the_beginning(string? cursor)
    {
        Assert.Null(Cursor.DecodeKey(cursor));
        Assert.Null(Cursor.DecodeTimestamp(cursor));
    }

    [Fact]
    public void Timestamp_cursor_round_trips()
    {
        const string createdAt = "2025-02-01T08:00:00.000Z";

        Assert.Equal(createdAt, Cursor.DecodeTimestamp(Cursor.EncodeTimestamp(createdAt)));
    }

    [Theory]
    [InlineData(null, 10)]
    [InlineData("", 10)]
    [InlineData("0", 10)]
    [InlineData("-5", 10)]
    [InlineData("abc", 10)]
    [InlineData("25", 25)]
    [InlineData("999", 50)]
    public void Limit_is_clamped_to_the_documented_range(string? raw, int expected)
    {
        Assert.Equal(expected, Cursor.ParseLimit(raw));
    }
}

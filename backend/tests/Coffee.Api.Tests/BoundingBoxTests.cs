using System.Globalization;
using Coffee.Api.Features.Places;
using Xunit;

namespace Coffee.Api.Tests;

/// <summary>
/// The <c>?bbox=</c> parser behind <c>GET /v1/places</c>. Every rejection here is a 400
/// <c>invalid_bbox</c> on the wire, so the cases are the contract.
/// </summary>
public class BoundingBoxTests
{
    [Fact]
    public void Parses_lng_lat_lng_lat_in_geojson_order()
    {
        Assert.True(BoundingBox.TryParse("25.2,54.6,25.3,54.7", out var box));

        Assert.Equal(25.2, box.MinLng);
        Assert.Equal(54.6, box.MinLat);
        Assert.Equal(25.3, box.MaxLng);
        Assert.Equal(54.7, box.MaxLat);
    }

    [Fact]
    public void Tolerates_padding_and_exponents_but_never_the_local_decimal_comma()
    {
        Assert.True(BoundingBox.TryParse(" -1.0 , -1.0 , 1e0 , 1.0 ", out var box));
        Assert.Equal(1d, box.MaxLng);

        // "54,6" would otherwise parse as 546 on a Lithuanian machine.
        Assert.False(BoundingBox.TryParse("25,2,54,6,25,3,54,7", out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("1,2,3")]
    [InlineData("1,2,3,4,5")]
    [InlineData("a,b,c,d")]
    [InlineData("1,2,3,")]
    [InlineData("NaN,0,1,1")]
    [InlineData("0,0,Infinity,1")]
    public void Rejects_anything_that_is_not_four_finite_numbers(string? raw)
    {
        Assert.False(BoundingBox.TryParse(raw, out _));
    }

    [Theory]
    [InlineData("-180.1,0,0,1")]
    [InlineData("0,0,180.1,1")]
    [InlineData("0,-90.1,1,0")]
    [InlineData("0,0,1,90.1")]
    public void Rejects_coordinates_outside_the_world(string raw)
    {
        Assert.False(BoundingBox.TryParse(raw, out _));
    }

    [Theory]
    // A viewport crossing the antimeridian, and a plain min > max.
    [InlineData("170,0,-170,10")]
    [InlineData("0,30,10,20")]
    public void Rejects_an_inverted_box(string raw)
    {
        Assert.False(BoundingBox.TryParse(raw, out _));
    }

    [Fact]
    public void Accepts_the_extremes_and_a_degenerate_point()
    {
        Assert.True(BoundingBox.TryParse("-180,-90,180,90", out var world));
        Assert.True(world.Contains(0, 0));

        Assert.True(BoundingBox.TryParse("25,54,25,54", out var point));
        Assert.True(point.Contains(54, 25));
        Assert.False(point.Contains(54.0001, 25));
    }

    [Fact]
    public void Contains_is_inclusive_on_every_edge()
    {
        Assert.True(BoundingBox.TryParse("10,20,30,40", out var box));

        Assert.True(box.Contains(20, 10));
        Assert.True(box.Contains(40, 30));
        Assert.True(box.Contains(30, 20));
        Assert.False(box.Contains(19.999, 20));
        Assert.False(box.Contains(30, 30.001));
    }

    [Fact]
    public void World_is_the_no_filter_default()
    {
        Assert.True(BoundingBox.World.Contains(-89.9, -179.9));
        Assert.True(BoundingBox.World.Contains(89.9, 179.9));
        Assert.Equal("-180", BoundingBox.World.MinLng.ToString(CultureInfo.InvariantCulture));
    }
}

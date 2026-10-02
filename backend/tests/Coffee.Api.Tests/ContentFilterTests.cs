using Coffee.Api.Shared.Moderation;
using Xunit;

namespace Coffee.Api.Tests;

public class ContentFilterTests
{
    [Theory]
    [InlineData("you cunt")]
    [InlineData("NIGGER")]
    [InlineData("what a Motherfucker")]
    [InlineData("cheap whore")]
    [InlineData("fuck you barista")]
    [InlineData("Fuck   off!!")]
    [InlineData("just kill yourself")]
    [InlineData("kys")]
    [InlineData("faggot_99")] // usernames split on underscores
    [InlineData("latte...slut...latte")]
    public void English_hits_are_rejected(string text) => Assert.True(ContentFilter.IsObjectionable(text));

    [Theory]
    [InlineData("tu pyderas")]
    [InlineData("Kurva, kokia kava")]
    [InlineData("KURVĄ")] // diacritics + case
    [InlineData("eik nachui")]
    [InlineData("eik tu nachui")]
    [InlineData("šliundra")]
    [InlineData("kekšė")]
    [InlineData("bybį")]
    [InlineData("pizdec")]
    [InlineData("čiurka")]
    [InlineData("Susikišk į subinę")]
    public void Lithuanian_hits_are_rejected_with_or_without_diacritics(string text) =>
        Assert.True(ContentFilter.IsObjectionable(text));

    [Theory]
    [InlineData("Scunthorpe flat white")]
    [InlineData("Penistone espresso bar")]
    [InlineData("cocktail hour")]
    [InlineData("assessment of the crema")]
    [InlineData("classic cappuccino")]
    [InlineData("Shitake mushroom latte")]
    [InlineData("pizza and coffee")] // ≠ pizda
    [InlineData("kurvalanga")] // a longer word is not the listed one
    [InlineData("Spicy chai")] // ≠ spic
    [InlineData("Pakistani chai")] // ≠ paki
    [InlineData("Bybiai? Ne, Bybliotekos kavinė")] // ≠ bybi
    [InlineData("You must try this, fuckin' good coffee")] // plain profanity is out of scope
    [InlineData("this coffee is shit")]
    [InlineData("you're killing it")]
    [InlineData("Kalė snaudžia ant palangės")] // kale/kalė is deliberately not listed (dog, vegetable)
    [InlineData("Šaltas kavos gėrimas su ąžuolo skoniu")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Normal_text_and_near_misses_pass(string? text) => Assert.False(ContentFilter.IsObjectionable(text));

    [Fact]
    public void Any_of_several_texts_is_enough()
    {
        Assert.True(ContentFilter.IsObjectionable("Latte", null, "you cunt"));
        Assert.False(ContentFilter.IsObjectionable("Latte", null, "great crema"));
    }

    [Fact]
    public void Tokenize_lowercases_folds_diacritics_and_splits_on_non_letters()
    {
        Assert.Equal(["zalia", "arbata", "su", "ciobreliu", "2"], ContentFilter.Tokenize("Žalia arbata_su-čiobrelių 2!"));
    }
}

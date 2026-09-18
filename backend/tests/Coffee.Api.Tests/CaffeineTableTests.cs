using Coffee.Api.Shared.Caffeine;
using Xunit;

namespace Coffee.Api.Tests;

public class CaffeineTableTests
{
    [Theory]
    [InlineData("Espresso", 63)]
    [InlineData("double espresso", 126)]          // longest match wins over "espresso"
    [InlineData("Triple Espresso to go", 189)]
    [InlineData("kava", 95)]                       // Lithuanian alias for coffee
    [InlineData("Juoda kava", 95)]
    [InlineData("žalioji arbata", 28)]             // beats the shorter "arbata"
    [InlineData("arbata", 47)]
    [InlineData("Flat White", 130)]
    [InlineData("herbal tea", 0)]
    public void Known_drinks_resolve_from_the_table(string drinkName, int expected)
    {
        Assert.Equal(expected, CaffeineTable.Lookup(drinkName));
    }

    [Theory]
    [InlineData("gazuotas vanduo")]
    [InlineData("orange juice")]
    [InlineData("")]
    [InlineData("   ")]
    public void Unknown_drinks_return_null_so_the_caller_can_ask_the_ai(string drinkName)
    {
        Assert.Null(CaffeineTable.Lookup(drinkName));
    }

    [Fact]
    public void Zero_is_a_real_answer_not_a_miss()
    {
        // "herbal tea" is genuinely caffeine-free; null would send it to the AI for nothing.
        Assert.Equal(0, CaffeineTable.Lookup("herbal tea"));
    }
}

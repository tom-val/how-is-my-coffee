namespace Coffee.Api.Shared.Caffeine;

/// <summary>
/// Caffeine content in mg for common drinks — a 1:1 port of the old <c>lib/caffeine.ts</c>, including
/// the Lithuanian aliases. Matching is longest-substring-first, so "double espresso" wins over
/// "espresso" and "žalioji arbata" over "arbata". The Expo client ships the same table for instant
/// offline matches, so the two must stay in step.
/// </summary>
public static class CaffeineTable
{
    private static readonly (string Key, int Mg)[] Entries =
    [
        // Coffee
        ("double espresso", 126),
        ("triple espresso", 189),
        ("vietnamese coffee", 100),
        ("turkish coffee", 65),
        ("irish coffee", 70),
        ("iced coffee", 95),
        ("filter coffee", 95),
        ("drip coffee", 95),
        ("cold brew", 200),
        ("flat white", 130),
        ("cappuccino", 130),
        ("americano", 95),
        ("ristretto", 63),
        ("macchiato", 63),
        ("cortado", 63),
        ("affogato", 63),
        ("espresso", 63),
        ("lungo", 80),
        ("mocha", 130),
        ("latte", 130),
        ("decaf", 3),
        ("3in1", 50),
        ("2in1", 50),
        ("coffee", 95),

        // Tea
        ("english breakfast", 47),
        ("green tea", 28),
        ("black tea", 47),
        ("oolong tea", 38),
        ("white tea", 15),
        ("herbal tea", 0),
        ("earl grey", 47),
        ("yerba mate", 85),
        ("rooibos", 0),
        ("matcha", 70),
        ("chai", 50),
        ("tea", 47),

        // Other
        ("hot chocolate", 5),
        ("energy drink", 80),
        ("kombucha", 15),
        ("cocoa", 5),

        // Lithuanian — Coffee
        ("dvigubas espreso", 126),
        ("trigubas espreso", 189),
        ("juoda kava", 95),
        ("kapučinas", 130),
        ("amerikanas", 95),
        ("espreso", 63),
        ("latė", 130),
        ("moka", 130),
        ("kava", 95),

        // Lithuanian — Tea
        ("žolelių arbata", 0),
        ("žalioji arbata", 28),
        ("juodoji arbata", 47),
        ("baltoji arbata", 15),
        ("arbata", 47),

        // Lithuanian — Other
        ("karštas šokoladas", 5),
        ("kakava", 5),
    ];

    // Pre-sorted by descending key length so the longest match wins.
    private static readonly (string Key, int Mg)[] Sorted =
        [.. Entries.OrderByDescending(e => e.Key.Length)];

    /// <summary>The table's estimate for a drink name, or null when nothing matches (the caller then asks the AI).</summary>
    public static int? Lookup(string drinkName)
    {
        if (string.IsNullOrWhiteSpace(drinkName)) return null;

        var lower = drinkName.ToLowerInvariant();
        foreach (var (key, mg) in Sorted)
        {
            if (lower.Contains(key, StringComparison.Ordinal)) return mg;
        }
        return null;
    }
}

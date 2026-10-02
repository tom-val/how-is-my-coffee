using System.Text;

namespace Coffee.Api.Shared.Moderation;

/// <summary>
/// The narrow first line of the UGC policy (App Store 1.2 / Google Play): free text other people
/// will see is checked against a short list of slurs and explicit sexual / abusive terms, in English
/// and Lithuanian. A hit is <c>400 objectionable_content</c>.
/// <para>
/// Deliberately small and unambiguous. Matching is on whole words only, after lower-casing and
/// folding diacritics (so "Kurvą" and "kurva" are the same word, while "Scunthorpe", "cocktail" or
/// "pizza" never trip it): the text is split on everything that is not a letter or digit, which also
/// splits usernames on <c>_</c>. Plain profanity ("this coffee is shit") is not on the list — the
/// filter blocks the obvious, reports and moderation handle the rest.
/// </para>
/// <para>
/// Static string data and a hand-written diacritic fold rather than <c>string.Normalize</c>: the
/// Lambda runs with <c>InvariantGlobalization</c>, and this keeps the filter free of ICU and of
/// anything the AOT compiler has to think about.
/// </para>
/// </summary>
public static class ContentFilter
{
    /// <summary>The error code the API answers with on a hit.</summary>
    public const string ErrorCode = "objectionable_content";

    // Single words, already lower-case and diacritic-free. Inflected forms are listed explicitly —
    // there is no stemming, so a stem can never swallow an innocent longer word.
    private static readonly HashSet<string> Words = new(StringComparer.Ordinal)
    {
        // English: slurs.
        "nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "kike", "kikes", "spic", "spics",
        "wetback", "wetbacks", "gook", "gooks", "raghead", "ragheads", "towelhead", "towelheads",
        "beaner", "beaners", "tranny", "trannies", "paki", "pakis",
        // English: explicit sexual / abusive.
        "cunt", "cunts", "motherfucker", "motherfuckers", "motherfucking", "cocksucker", "cocksuckers",
        "whore", "whores", "slut", "sluts", "blowjob", "blowjobs", "handjob", "handjobs", "cumshot",
        "cumshots", "gangbang", "jizz", "kys",
        // Lithuanian (diacritics folded): slurs.
        "pyderas", "pyderai", "pyderu", "pydere", "pyderiai", "pydaras", "pydarai", "pidaras", "pidarasas",
        "pidarai", "nigeris", "nigeriai", "niggeris", "ciurka", "ciurkos",
        // Lithuanian (diacritics folded): explicit sexual / abusive.
        "pizda", "pizdos", "pizdec", "pizdiec", "bybis", "bybi", "bybys", "byby", "bybiu", "kurva", "kurvos",
        "kurvu", "kurvis", "kekse", "kekses", "keksiu", "sliundra", "sliundros", "nachui", "nahui",
        "nachuj", "nahuj", "chujus", "chujau", "blet", "bliat", "blyat",
    };

    // Short phrases (whole words in sequence) that are abuse even though each word alone is not.
    private static readonly string[][] Phrases =
    [
        ["fuck", "you"],
        ["fuck", "off"],
        ["kill", "yourself"],
        ["eik", "nachui"],
        ["eik", "nahui"],
        ["eik", "tu", "nachui"],
        ["susikisk", "i", "subine"],
    ];

    /// <summary>True when any of <paramref name="texts"/> contains a listed word or phrase. Nulls are skipped.</summary>
    public static bool IsObjectionable(params string?[] texts)
    {
        foreach (var text in texts)
        {
            if (IsObjectionable(text)) return true;
        }
        return false;
    }

    /// <summary>True when <paramref name="text"/> contains a listed word or phrase as whole words.</summary>
    public static bool IsObjectionable(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;

        var tokens = Tokenize(text);
        for (var i = 0; i < tokens.Count; i++)
        {
            if (Words.Contains(tokens[i])) return true;
            foreach (var phrase in Phrases)
            {
                if (Matches(tokens, i, phrase)) return true;
            }
        }
        return false;
    }

    private static bool Matches(List<string> tokens, int start, string[] phrase)
    {
        if (start + phrase.Length > tokens.Count) return false;
        for (var j = 0; j < phrase.Length; j++)
        {
            if (!string.Equals(tokens[start + j], phrase[j], StringComparison.Ordinal)) return false;
        }
        return true;
    }

    /// <summary>Lower-cased, diacritic-folded runs of letters and digits.</summary>
    internal static List<string> Tokenize(string text)
    {
        var tokens = new List<string>();
        var current = new StringBuilder();
        foreach (var raw in text)
        {
            var c = char.ToLowerInvariant(raw);
            if (char.IsLetterOrDigit(c))
            {
                current.Append(Fold(c));
            }
            else if (current.Length > 0)
            {
                tokens.Add(current.ToString());
                current.Clear();
            }
        }
        if (current.Length > 0) tokens.Add(current.ToString());
        return tokens;
    }

    /// <summary>Strips the diacritics of the Latin letters that matter here (Lithuanian first).</summary>
    internal static string Fold(char c) => c switch
    {
        'ą' or 'à' or 'á' or 'â' or 'ä' or 'ã' or 'å' or 'ā' => "a",
        'č' or 'ç' or 'ć' => "c",
        'ę' or 'ė' or 'è' or 'é' or 'ê' or 'ë' or 'ē' => "e",
        'į' or 'ì' or 'í' or 'î' or 'ï' or 'ī' or 'ı' => "i",
        'ł' => "l",
        'ñ' or 'ń' or 'ņ' => "n",
        'ò' or 'ó' or 'ô' or 'ö' or 'õ' or 'ø' or 'ō' => "o",
        'š' or 'ś' or 'ş' => "s",
        'ų' or 'ū' or 'ù' or 'ú' or 'û' or 'ü' => "u",
        'ý' or 'ÿ' => "y",
        'ž' or 'ź' or 'ż' => "z",
        'ß' => "ss",
        _ => c.ToString(),
    };
}

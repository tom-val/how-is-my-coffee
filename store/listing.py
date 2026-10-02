"""Kavutė store listing texts — the single source for App Store Connect and Google Play Console.

Run `python3 store/listing.py` to check every field against the store's limit and regenerate
`store/LISTING.md`, the copy-paste sheet. Edit texts here, never in the .md.
"""
import pathlib, re, sys

LIMITS = {
    # App Store Connect (characters; keywords are comma-separated, no spaces needed)
    "as_name": 30, "as_subtitle": 30, "as_promo": 170, "as_description": 4000, "as_keywords": 100, "as_whats_new": 4000,
    # Google Play Console
    "gp_title": 30, "gp_short": 80, "gp_full": 4000, "gp_whats_new": 500,
}

EN_DESCRIPTION = """Kavutė is a coffee journal you share with friends. Rate every cup you drink, keep an eye on your caffeine, and discover the cafés your friends love.

RATE EVERY CUP
• Give each coffee a rating from half a star to five stars
• Add the drink, a few notes and a photo
• Pick the café from search, from places you have been, or with "Use my location"
• Edit or delete a rating at any time

COFFEE WITH FRIENDS
• Follow friends and see their ratings in your feed
• Tag the people you had the coffee with, even if they are not on Kavutė yet
• "Coffees with me" collects every cup you were tagged in
• Like and comment on your friends' coffees

DISCOVER CAFÉS
• See every café you have rated on a map, with your visit count
• Discover cafés near you, rated by the whole community or only by friends
• Each café page shows its average rating and every review

TRACK YOUR CAFFEINE
• Kavutė estimates the caffeine in your drink automatically
• See how much caffeine you have had today and in total
• Adjust the amount whenever you know better

MADE FOR YOU
• Light and dark appearance
• English and Lithuanian
• Notifications for tags, likes, comments and new followers — each one can be switched off
• Also works in your browser at coffee.valiunas.dev

PRIVATE BY DESIGN
• No ads, no tracking, no selling of data
• No email or phone number needed — just a username
• Report content or block people right from the app
• Delete your account and all your data from Settings at any time

Caffeine amounts are estimates for information only and are not medical advice."""

LT_DESCRIPTION = """Kavutė – kavos dienoraštis, kuriuo dalijatės su draugais. Įvertinkite kiekvieną išgertą puodelį, sekite suvartotą kofeiną ir atraskite kavines, kurias mėgsta jūsų draugai.

ĮVERTINKITE KIEKVIENĄ PUODELĮ
• Kiekvienai kavai skirkite nuo pusės iki penkių žvaigždučių
• Įrašykite gėrimą, pastabas ir pridėkite nuotrauką
• Kavinę pasirinkite paieškoje, iš jau aplankytų vietų arba mygtuku „Naudoti mano vietą“
• Įvertinimą bet kada galite pakeisti arba ištrinti

KAVA SU DRAUGAIS
• Sekite draugus ir matykite jų įvertinimus savo sraute
• Pažymėkite, su kuo gėrėte kavą – net jei jie dar nesinaudoja Kavute
• Skiltyje „Kavos su manimi“ – visi puodeliai, kuriuose esate pažymėti
• Spauskite „patinka“ ir komentuokite draugų kavas

ATRASKITE KAVINES
• Visos įvertintos kavinės žemėlapyje su apsilankymų skaičiumi
• Atraskite netoliese esančias kavines – pagal visos bendruomenės arba tik draugų įvertinimus
• Kavinės puslapyje – vidutinis įvertinimas ir visi atsiliepimai

SEKITE KOFEINĄ
• Kavutė automatiškai įvertina, kiek kofeino yra jūsų gėrime
• Matykite, kiek kofeino išgėrėte šiandien ir iš viso
• Kiekį visada galite pataisyti

SUKURTA JUMS
• Šviesi ir tamsi išvaizda
• Lietuvių ir anglų kalbos
• Pranešimai apie pažymėjimus, „patinka“, komentarus ir naujus sekėjus – kiekvieną galima išjungti
• Veikia ir naršyklėje adresu coffee.valiunas.dev

PRIVATUMAS – SVARBIAUSIA
• Jokių reklamų, sekimo ar duomenų pardavimo
• Nereikia nei el. pašto, nei telefono numerio – užtenka vartotojo vardo
• Pranešti apie turinį ar užblokuoti žmones galite tiesiai programėlėje
• Paskyrą ir visus duomenis bet kada ištrinsite nustatymuose

Kofeino kiekiai yra apytiksliai, skirti tik informacijai ir nėra medicininė konsultacija."""

LISTING = {
    "en-GB": {
        "as_name": "Kavutė: Coffee Journal",
        "as_subtitle": "Rate coffees with your friends",
        "as_promo": "Rate every cup, see where your friends drink coffee and keep an eye on today's caffeine. Tag who you had it with and discover great cafés nearby.",
        "as_description": EN_DESCRIPTION,
        "as_keywords": "cafe,espresso,latte,cappuccino,flat white,caffeine,tracker,barista,review,rating,diary,map,brew",
        "as_whats_new": "The first release of Kavutė. Rate your coffees, tag who you had them with, follow friends and discover cafés on the map.",
        "gp_title": "Kavutė: Coffee Journal",
        "gp_short": "Rate every cup, track your caffeine and find great cafés with your friends.",
        "gp_full": EN_DESCRIPTION,
        "gp_whats_new": "The first release of Kavutė. Rate your coffees, tag who you had them with, follow friends and discover cafés on the map.",
    },
    "lt": {
        "as_name": "Kavutė: kavos dienoraštis",
        "as_subtitle": "Vertinkite kavą su draugais",
        "as_promo": "Įvertinkite kiekvieną puodelį, matykite, kur kavą geria draugai, ir sekite šiandienos kofeiną. Pažymėkite, su kuo gėrėte, ir atraskite kavines netoliese.",
        "as_description": LT_DESCRIPTION,
        "as_keywords": "kava,kavinė,espresso,latte,kapučinas,kofeinas,barista,vertinimas,atsiliepimai,žemėlapis,draugai",
        "as_whats_new": "Pirmoji Kavutės versija. Vertinkite kavą, žymėkite, su kuo ją gėrėte, sekite draugus ir atraskite kavines žemėlapyje.",
        "gp_title": "Kavutė: kavos dienoraštis",
        "gp_short": "Įvertinkite kiekvieną puodelį, sekite kofeiną ir atraskite kavines su draugais.",
        "gp_full": LT_DESCRIPTION,
        "gp_whats_new": "Pirmoji Kavutės versija. Vertinkite kavą, žymėkite, su kuo ją gėrėte, sekite draugus ir atraskite kavines žemėlapyje.",
    },
}

LABELS = {
    "as_name": "App Store · Name", "as_subtitle": "App Store · Subtitle", "as_promo": "App Store · Promotional Text",
    "as_keywords": "App Store · Keywords", "as_whats_new": "App Store · What's New", "as_description": "App Store · Description",
    "gp_title": "Google Play · App name", "gp_short": "Google Play · Short description",
    "gp_whats_new": "Google Play · Release notes", "gp_full": "Google Play · Full description",
}

# Policy checks that commonly get listings rejected (Play metadata policy, App Store 2.3.7).
BANNED = re.compile(r"\b(best|#1|number one|top|free|new|sale|download now|install now)\b", re.I)

def check():
    problems = []
    for lang, fields in LISTING.items():
        for key, text in fields.items():
            n = len(text)
            if n > LIMITS[key]:
                problems.append(f"{lang} {key}: {n} > {LIMITS[key]}")
            if key in ("as_name", "as_subtitle", "gp_title", "gp_short") and BANNED.search(text):
                problems.append(f"{lang} {key}: promotional word '{BANNED.search(text).group(0)}'")
            if key in ("as_name", "gp_title") and re.search(r"[\U0001F300-\U0001FAFF]", text):
                problems.append(f"{lang} {key}: emoji in title")
        kw = fields["as_keywords"].split(",")
        name_words = {w.lower().strip(":") for w in (fields["as_name"] + " " + fields["as_subtitle"]).split()}
        dup = [k for k in kw if k.lower() in name_words]
        if dup:
            problems.append(f"{lang} as_keywords repeat words already in name/subtitle (wasted): {dup}")
        if any(k != k.strip() for k in kw):
            problems.append(f"{lang} as_keywords: spaces around commas waste characters")
    return problems

def render():
    out = ["# Kavutė — store listing (generated)", "",
           "Generated by `python3 store/listing.py` from the texts in that file. Copy each block into the field named in its heading.", ""]
    for lang, fields in LISTING.items():
        out += [f"## {lang}", ""]
        for key in LABELS:
            text = fields[key]
            out += [f"### {LABELS[key]} ({len(text)}/{LIMITS[key]})", "", "```text", text, "```", ""]
    return "\n".join(out)

if __name__ == "__main__":
    problems = check()
    for lang, fields in LISTING.items():
        print(lang, " ".join(f"{k}={len(v)}/{LIMITS[k]}" for k, v in fields.items()))
    if problems:
        print("PROBLEMS:\n  " + "\n  ".join(problems)); sys.exit(1)
    pathlib.Path(__file__).with_name("LISTING.md").write_text(render() + "\n", encoding="utf-8")
    print("ok — store/LISTING.md written")

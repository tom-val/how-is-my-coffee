"""Fills a LOCAL Kavutė API with believable demo data for store screenshots.

Everything goes through the public HTTP API (so it exercises the real code paths and never writes
DynamoDB directly). Cafés are invented names at real-looking Vilnius coordinates — no real
business appears in the store screenshots. Run against a fresh local stack:

    docker restart coffee-dynamodb && make seed && make api   # empty in-memory table + base seed
    python3 store/seed_screenshot_data.py [--api http://localhost:5090]

Then sign in as `ieva` / the password printed at the end and take the screenshots.
Refuses to run against anything but localhost / a LAN address.
"""
import json, random, sys, time, urllib.request, urllib.error

API = "http://localhost:5090"
if "--api" in sys.argv:
    API = sys.argv[sys.argv.index("--api") + 1].rstrip("/")
if not any(h in API for h in ("localhost", "127.0.0.1", "192.168.", "10.")):
    sys.exit(f"refusing to seed a non-local API: {API}")

PASSWORD = "kavute-demo-2026"

def call(method, path, body=None, token=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={"content-type": "application/json",
                                          **({"authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()[:200]}")

PEOPLE = [  # username, display name
    ("ieva", "Ieva Kazlauskė"), ("mantas", "Mantas Petrauskas"), ("ruta", "Rūta Jankauskaitė"),
    ("jonas", "Jonas Vaitkus"), ("laura", "Laura Stankevičiūtė"),
]
CAFES = [  # placeName, address, lat, lng
    ("Pupelė", "Pilies g. 23, Vilnius", 54.6834, 25.2893),
    ("Rytinė Kava", "Gedimino pr. 15, Vilnius", 54.6873, 25.2765),
    ("Mėta & Kava", "Užupio g. 7, Vilnius", 54.6807, 25.2962),
    ("Old Town Roasters", "Vokiečių g. 12, Vilnius", 54.6795, 25.2846),
    ("Kavos Namai", "Savanorių pr. 1, Vilnius", 54.6858, 25.2638),
    ("Saulėtas Puodelis", "Žvėryno g. 4, Vilnius", 54.6912, 25.2589),
]
def place_id(name):
    import unicodedata, re
    s = unicodedata.normalize("NFD", name.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return "place_" + re.sub(r"[^a-z0-9]+", "_", s).strip("_")

# author, cafe index, drink, stars, caffeine, notes, companions (usernames or guest names)
RATINGS = [
    ("mantas", 0, "Flat white", 5.0, 130, "Silky microfoam, perfectly balanced. My new morning spot.", ["ieva"]),
    ("ruta", 2, "Oat cappuccino", 4.5, 130, "Lovely terrace and a very friendly barista.", ["Guest: Agnė"]),
    ("ieva", 1, "Cortado", 4.0, 63, "Strong but smooth. Busy at lunch.", ["mantas", "ruta"]),
    ("jonas", 3, "V60 Ethiopia", 5.0, 120, "Bright, floral, berry notes. Worth the wait.", []),
    ("laura", 4, "Iced latte", 3.5, 95, "Good on a hot day, a bit too much ice.", ["ieva"]),
    ("ieva", 3, "Espresso", 4.5, 63, "Chocolatey with a long finish.", []),
    ("mantas", 5, "Americano", 3.5, 95, "Decent and cheap, great for working.", []),
    ("ruta", 0, "Matcha latte", 4.0, 70, "Not coffee, but very good.", ["laura"]),
    ("ieva", 2, "Flat white", 5.0, 130, "Sunday coffee with the best company.", ["laura", "jonas"]),
]
COMMENTS = [
    (0, "ieva", "Agree, best flat white in the old town!"),
    (3, "mantas", "Saving this one for Saturday."),
    (8, "laura", "Let's go again next week."),
]

tokens = {}
for u, name in PEOPLE:
    res = call("POST", "/v1/auth/register", {"username": u, "displayName": name, "password": PASSWORD})
    tokens[u] = res["token"]
print("users:", ", ".join(tokens))

for a in tokens:  # everyone follows everyone: a lively feed for whoever is signed in
    for b in tokens:
        if a != b:
            call("POST", "/v1/friends", {"friendUsername": b}, tokens[a])

created = []
for author, ci, drink, stars, mg, notes, comps in RATINGS:
    name, addr, lat, lng = CAFES[ci]
    companions = [{"displayName": c.split(": ", 1)[1]} if c.startswith("Guest: ") else {"username": c} for c in comps]
    r = call("POST", "/v1/ratings", {"placeId": place_id(name), "placeName": name, "address": addr,
                                     "lat": lat + random.uniform(-0.0002, 0.0002), "lng": lng + random.uniform(-0.0002, 0.0002),
                                     "stars": stars, "drinkName": drink, "description": notes,
                                     "caffeineMg": mg, "companions": companions}, tokens[author])
    created.append(r["ratingId"])
    time.sleep(0.05)  # distinct createdAt so the feed order is the list order

for idx, who, text in COMMENTS:
    call("POST", f"/v1/ratings/{created[idx]}/comments", {"text": text}, tokens[who])
for idx, count in ((0, 4), (2, 2), (3, 3), (8, 4)):  # like toggles, so each user likes a rating once
    author = RATINGS[idx][0]
    for who in random.sample([u for u in tokens if u != author], count):
        call("POST", f"/v1/ratings/{created[idx]}/like", None, tokens[who])

print(f"{len(created)} ratings, {len(COMMENTS)} comments. Sign in as ieva / {PASSWORD}")

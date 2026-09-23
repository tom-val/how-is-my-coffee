import { useTranslation } from 'react-i18next';

import { BACKUP_RETENTION_DAYS, LEGAL_CONTACT } from '@/features/legal/constants';
import { LegalLayout, usePickLanguage, type LegalDoc } from '@/features/legal/LegalLayout';

/**
 * The privacy policy. Written from what the code actually does — keep it in step with
 * `docs/api-contract.md`, `src/lib/*.ts` and `app.json` when a data flow or a provider changes, and
 * bump `LEGAL_LAST_UPDATED`. It also backs the App Store privacy label and the Play data-safety
 * form: no tracking, no ads, no analytics SDKs.
 */
const CONTACT = LEGAL_CONTACT;
const BACKUP_DAYS = BACKUP_RETENTION_DAYS;

const EN: LegalDoc = {
  intro:
    'Kavutė is an app for rating the coffee you drink, keeping a caffeine log and sharing both with friends. This policy explains what personal data Kavutė handles, why, who helps us process it, and the rights you have. We collect as little as the app needs: no email address, no phone number, no advertising, no tracking.',
  sections: [
    {
      heading: '1. Who is responsible',
      blocks: [
        {
          p: `Kavutė is built and run by Tomas Valiūnas, an individual developer based in Lithuania, who is the data controller for the personal data described here ("we", "us"). For anything about this policy or your data, write to ${CONTACT}.`,
        },
      ],
    },
    {
      heading: '2. What we collect',
      blocks: [
        {
          bullets: [
            'Account — your username, your display name, the date you joined, and your password. The password is never stored as text: only a salted PBKDF2 hash of it is kept, which cannot be turned back into the password. We do not ask for your email address, phone number or real name.',
            'Ratings — for each coffee you rate: the drink name, the star rating, your optional notes, the caffeine amount (in mg) and when you rated it (and last edited it).',
            'Cafés — the name, address and map coordinates of the café you choose for a rating, whether you pick it from search results, from your current location or type it yourself.',
            'Photos — a photo you choose to attach to a rating. The app shrinks and re-encodes it on your device before upload, which removes hidden metadata such as the GPS position the camera may have recorded.',
            'Companions — the people you tag as having had coffee with you: either a registered user (by username) or a free-text name you type for a guest. If someone tags you, your username and display name appear on their rating and in your "Coffees with me".',
            'Social activity — who you follow and who follows you, the ratings you like, and the comments you write.',
            'Notifications — on a phone where you allow notifications: the push token that addresses this app on your device, whether the device is iOS or Android, and your notification preferences (which of the five kinds of notification you want).',
            'Technical logs — our server keeps short-lived logs of requests (such as the time, the endpoint called and any error) to run the service, fix faults and prevent abuse. Our hosting provider necessarily sees your IP address when your device connects.',
          ],
        },
        {
          p: 'Stored only on your device, never on our servers: your sign-in session token (in the phone’s secure storage, or the browser’s local storage on the web), and your language and appearance (light/dark) choices.',
        },
      ],
    },
    {
      heading: '3. Your location',
      blocks: [
        {
          p: 'With your permission, the app reads your device’s location to centre the map on where you are and to suggest the café you are sitting in. Turning that position into a street address is done by your phone’s own location service (Apple on iOS, Google on Android).',
        },
        {
          p: 'When you search for a café, the text you type is sent to our server together with your approximate position, rounded to about 1 km (or, if the app does not know it, the location of the café you rated most recently), and our server passes both to Google Places so that nearby cafés come first. When you browse the map, the visible map area is sent to our server to find cafés in it. None of this is stored: your location is never saved to your account. The only coordinates we keep are those of the café you choose for a rating. If you use “Use my location” to pick the café, those coordinates are your device’s position at that moment, and they are saved with the rating and visible to other users like any café location.',
        },
        {
          p: 'You can refuse or withdraw location permission at any time in your device settings; you can still search for cafés by name and type them in yourself.',
        },
      ],
    },
    {
      heading: '4. Who can see what',
      blocks: [
        {
          bullets: [
            'Your username, display name and join date form your profile. Your profile page (the link /u/<your username>) and the list of your ratings on it are public: anyone with the link can see them, even without an account.',
            'Your ratings — with their drink, stars, notes, caffeine, photo, café and companions — and your likes and comments are visible to other signed-in users of Kavutė: in the feed of people who follow you, on café pages and on your profile.',
            'Who you follow and who follows you is visible to you; the people you follow see that you follow them.',
            'Your password hash, your push tokens and your notification preferences are never shown to anyone.',
          ],
        },
      ],
    },
    {
      heading: '5. Why we use it',
      blocks: [
        {
          bullets: [
            'To provide the app you signed up for: keep your account, show your ratings, feed, map, caffeine totals and friends, and send the notifications you asked for (legal basis: performance of our contract with you, GDPR Art. 6(1)(b)).',
            'To keep the service secure and working: sign-in checks, abuse prevention, fixing bugs (legal basis: our legitimate interest in running a safe, working service, Art. 6(1)(f)).',
            'Location, camera, photo library and notifications are used only after you allow them in the device’s permission prompt, and you can withdraw that permission at any time in your device settings (Art. 6(1)(a)).',
          ],
        },
        {
          p: 'We do not show ads, do not use analytics or tracking SDKs, do not profile you, do not sell or rent your data, and do not track you across other companies’ apps or websites. The web version sets no tracking cookies.',
        },
      ],
    },
    {
      heading: '6. Service providers we use',
      blocks: [
        {
          p: 'We share data only with the providers that make the app work, each only what it needs:',
        },
        {
          bullets: [
            'Amazon Web Services (AWS) — hosts our server, the database and the photo storage, in the EU (Ireland, eu-west-1), and delivers the web app and photos through its content-delivery network.',
            'Google Places API — café search: the text you type and your approximate position (see section 3), sent from our server. Google’s own identifier for the café is not stored.',
            'OpenAI — only the name of a drink, and only when our built-in caffeine table has no match for it, to estimate its caffeine content. No username, account or other personal data is sent.',
            'Expo (650 Industries) — delivers push notifications to your phone through Apple Push Notification service and Google Firebase Cloud Messaging (it receives your push token and the notification text, e.g. "Alice liked your flat white"), and serves app updates (it sees your IP address and app version).',
            'OpenStreetMap — Nominatim, the fallback café search when Google search is unavailable (it receives only the text you type), and the map tiles on the web version (your browser requests the tiles for the visible map area).',
            'Apple Maps on iOS and Google Maps on Android — draw the map inside the app; your device requests the map for the visible area directly from them.',
          ],
        },
        {
          p: 'We may also disclose data where the law requires it, or where it is necessary to protect the rights and safety of our users or the service.',
        },
      ],
    },
    {
      heading: '7. International transfers',
      blocks: [
        {
          p: 'Your account data, ratings and photos are stored in the European Union (Ireland). Some of the providers above (Google, OpenAI, Expo, Apple) are based in the United States or process data there. Such transfers rely on the EU–US Data Privacy Framework where the provider is certified, or on the European Commission’s Standard Contractual Clauses.',
        },
      ],
    },
    {
      heading: '8. How long we keep it',
      blocks: [
        {
          bullets: [
            'Everything in your account is kept until you delete it. Deleting a rating removes it, its photo, its likes and comments straight away.',
            'Deleting your account (Settings → Delete account) immediately removes your profile, username, password hash, push tokens and notification preferences, all your ratings and their photos, your follows and followers, your likes and comments on other people’s ratings, and your name from ratings where others tagged you.',
            `Our database keeps automatic backups for disaster recovery for up to ${BACKUP_DAYS} days; deleted data disappears from them when they roll off. Server logs are kept for 14 days.`,
            'A push token is also removed when you sign out on that device, or when Apple or Google tells us it is no longer valid.',
          ],
        },
      ],
    },
    {
      heading: '9. Security',
      blocks: [
        {
          p: 'All traffic between the app and our server is encrypted (HTTPS). Passwords are stored only as salted PBKDF2 hashes. On phones your session token is kept in the operating system’s secure storage (Keychain on iOS, Keystore on Android). Photos are stored at long, unguessable web addresses; anyone who has a photo’s address can open it, as they can your public profile. No system is perfectly secure, but we take reasonable measures to protect your data.',
        },
      ],
    },
    {
      heading: '10. Your rights',
      blocks: [
        { p: 'Under the GDPR you have the right to:' },
        {
          bullets: [
            'access the personal data we hold about you and get a copy of it;',
            'have inaccurate data corrected;',
            'have your data erased — you can do this yourself at any time with Settings → Delete account;',
            'receive your data in a portable, machine-readable format;',
            'object to processing based on our legitimate interests, or ask us to restrict it;',
            'withdraw any permission you gave, at any time, in your device settings;',
            'lodge a complaint with a supervisory authority — in Lithuania, the State Data Protection Inspectorate (Valstybinė duomenų apsaugos inspekcija, vdai.lrv.lt), or the authority where you live.',
          ],
        },
        {
          p: `To exercise a right, write to ${CONTACT}. Because we do not store your email address, tell us your username and enough about your account (for example a few of your ratings) for us to confirm it is yours. We answer within one month.`,
        },
      ],
    },
    {
      heading: '11. Children',
      blocks: [
        {
          p: `Kavutė is not directed at children. You must be at least 13 years old to use it, or older where the law of your country requires. We do not knowingly collect data from children under 13; if you believe a child has created an account, write to ${CONTACT} and we will delete it.`,
        },
      ],
    },
    {
      heading: '12. Changes to this policy',
      blocks: [
        {
          p: 'We may update this policy when the app or the law changes. We will change the date at the top and, for significant changes, tell you in the app.',
        },
      ],
    },
    {
      heading: '13. Contact',
      blocks: [{ p: `Tomas Valiūnas, Lithuania — ${CONTACT}.` }],
    },
  ],
};

const LT: LegalDoc = {
  intro:
    '„Kavutė“ — programėlė, kurioje vertinate išgertą kavą, vedate kofeino žurnalą ir dalijatės abiem su draugais. Šioje politikoje paaiškinama, kokius asmens duomenis „Kavutė“ tvarko, kodėl, kas padeda juos tvarkyti ir kokias teises turite. Renkame tik tai, ko reikia programėlei: jokio el. pašto adreso, jokio telefono numerio, jokios reklamos, jokio sekimo.',
  sections: [
    {
      heading: '1. Kas atsakingas',
      blocks: [
        {
          p: `„Kavutę“ kuria ir prižiūri Tomas Valiūnas, Lietuvoje veikiantis individualus kūrėjas, kuris yra čia aprašytų asmens duomenų valdytojas („mes“). Visais klausimais dėl šios politikos ar savo duomenų rašykite ${CONTACT}.`,
        },
      ],
    },
    {
      heading: '2. Ką renkame',
      blocks: [
        {
          bullets: [
            'Paskyra — jūsų vartotojo vardas, rodomas vardas, prisijungimo data ir slaptažodis. Slaptažodis niekada nesaugomas kaip tekstas: saugoma tik jo „pasūdyta“ PBKDF2 maiša, iš kurios slaptažodžio atkurti neįmanoma. Neprašome jūsų el. pašto adreso, telefono numerio ar tikrojo vardo.',
            'Įvertinimai — kiekvienai įvertintai kavai: gėrimo pavadinimas, žvaigždučių skaičius, neprivalomos pastabos, kofeino kiekis (mg) ir kada įvertinote (bei paskutinį kartą redagavote).',
            'Kavinės — jūsų įvertinimui pasirinktos kavinės pavadinimas, adresas ir koordinatės žemėlapyje — nesvarbu, ar ją pasirinkote iš paieškos rezultatų, pagal savo buvimo vietą, ar įvedėte patys.',
            'Nuotraukos — nuotrauka, kurią pasirenkate pridėti prie įvertinimo. Prieš įkeliant programėlė ją sumažina ir perkoduoja jūsų įrenginyje, todėl pašalinami paslėpti metaduomenys, pavyzdžiui, fotoaparato užfiksuota GPS vieta.',
            'Kompanionai — žmonės, kuriuos pažymite kaip gėrusius kavą su jumis: registruotas vartotojas (pagal vartotojo vardą) arba svečio vardas, kurį įrašote patys. Jei kas nors pažymi jus, jūsų vartotojo vardas ir rodomas vardas matomi jo įvertinime ir jūsų skiltyje „Kavos su manimi“.',
            'Socialinė veikla — ką sekate ir kas seka jus, kuriems įvertinimams paspaudėte „patinka“ ir kokius komentarus parašėte.',
            'Pranešimai — telefone, kuriame leidote pranešimus: pranešimų prieigos raktas (push token), kuriuo adresuojama programėlė jūsų įrenginyje, ar įrenginys yra „iOS“, ar „Android“, ir jūsų pranešimų nustatymai (kurių iš penkių rūšių pranešimų norite).',
            'Techniniai žurnalai — mūsų serveris trumpai saugo užklausų įrašus (pvz., laiką, iškviestą adresą ir klaidas), kad paslauga veiktų, būtų galima taisyti gedimus ir užkirsti kelią piktnaudžiavimui. Jūsų įrenginiui jungiantis, prieglobos paslaugų teikėjas neišvengiamai mato jūsų IP adresą.',
          ],
        },
        {
          p: 'Tik jūsų įrenginyje, niekada mūsų serveriuose, saugoma: jūsų prisijungimo sesijos raktas (telefono saugioje saugykloje arba, žiniatinklyje, naršyklės vietinėje saugykloje) ir jūsų pasirinkta kalba bei išvaizda (šviesi/tamsi).',
        },
      ],
    },
    {
      heading: '3. Jūsų buvimo vieta',
      blocks: [
        {
          p: 'Jums leidus, programėlė nuskaito įrenginio buvimo vietą, kad centruotų žemėlapį ties jumis ir pasiūlytų kavinę, kurioje sėdite. Jūsų buvimo vietą į gatvės adresą paverčia pačio telefono vietos paslauga („Apple“ – „iOS“, „Google“ – „Android“).',
        },
        {
          p: 'Kai ieškote kavinės, jūsų įvestas tekstas kartu su apytiksle jūsų buvimo vieta, suapvalinta maždaug iki 1 km (arba, jei programėlė jos nežino, paskutinės jūsų įvertintos kavinės vieta) siunčiamas mūsų serveriui, o šis abu perduoda „Google Places“, kad pirmiausia būtų rodomos netoliese esančios kavinės. Kai naršote žemėlapį, matoma žemėlapio sritis siunčiama mūsų serveriui, kad jame būtų rastos kavinės. Niekas iš to nesaugoma: jūsų buvimo vieta niekada neįrašoma į jūsų paskyrą. Saugome tik tos kavinės, kurią pasirenkate įvertinimui, koordinates. Jei kavinę pasirenkate mygtuku „Naudoti mano vietą“, tos koordinatės yra jūsų įrenginio buvimo vieta tuo metu: jos išsaugomos su įvertinimu ir, kaip ir bet kurios kavinės vieta, matomos kitiems naudotojams.',
        },
        {
          p: 'Leidimo naudoti buvimo vietą galite atsisakyti ar jį atšaukti bet kada įrenginio nustatymuose; kavinių vis tiek galėsite ieškoti pagal pavadinimą arba įrašyti patys.',
        },
      ],
    },
    {
      heading: '4. Kas ką mato',
      blocks: [
        {
          bullets: [
            'Jūsų vartotojo vardas, rodomas vardas ir prisijungimo data sudaro jūsų profilį. Jūsų profilio puslapis (nuoroda /u/<jūsų vartotojo vardas>) ir jame esantis jūsų įvertinimų sąrašas yra vieši: juos gali matyti bet kas, turintis nuorodą, net neturėdamas paskyros.',
            'Jūsų įvertinimus — su gėrimu, žvaigždutėmis, pastabomis, kofeinu, nuotrauka, kavine ir kompanionais — bei jūsų „patinka“ ir komentarus mato kiti prisijungę „Kavutės“ vartotojai: jus sekančiųjų naujienų sraute, kavinių puslapiuose ir jūsų profilyje.',
            'Ką sekate ir kas seka jus, matote jūs; tie, kuriuos sekate, mato, kad juos sekate.',
            'Jūsų slaptažodžio maiša, pranešimų prieigos raktai ir pranešimų nustatymai niekam nerodomi.',
          ],
        },
      ],
    },
    {
      heading: '5. Kodėl juos naudojame',
      blocks: [
        {
          bullets: [
            'Kad teiktume programėlę, kuria užsiregistravote: išlaikytume jūsų paskyrą, rodytume įvertinimus, naujienų srautą, žemėlapį, kofeino sumas ir draugus bei siųstume jūsų pageidaujamus pranešimus (teisinis pagrindas: sutarties su jumis vykdymas, BDAR 6 str. 1 d. b p.).',
            'Kad paslauga būtų saugi ir veiktų: prisijungimo patikros, piktnaudžiavimo prevencija, klaidų taisymas (teisinis pagrindas: mūsų teisėtas interesas teikti saugią, veikiančią paslaugą, 6 str. 1 d. f p.).',
            'Buvimo vieta, kamera, nuotraukų biblioteka ir pranešimai naudojami tik jums leidus įrenginio leidimo lange; leidimą galite bet kada atšaukti įrenginio nustatymuose (6 str. 1 d. a p.).',
          ],
        },
        {
          p: 'Nerodome reklamos, nenaudojame analitikos ar sekimo įrankių (SDK), jūsų neprofiliuojame, neparduodame ir nenuomojame jūsų duomenų ir nesekame jūsų kitų bendrovių programėlėse ar svetainėse. Žiniatinklio versija nenaudoja sekimo slapukų.',
        },
      ],
    },
    {
      heading: '6. Paslaugų teikėjai',
      blocks: [
        {
          p: 'Duomenimis dalijamės tik su teikėjais, be kurių programėlė neveiktų, ir kiekvienam perduodame tik tai, ko jam reikia:',
        },
        {
          bullets: [
            '„Amazon Web Services“ (AWS) — talpina mūsų serverį, duomenų bazę ir nuotraukų saugyklą ES (Airijoje, eu-west-1) ir pristato žiniatinklio programėlę bei nuotraukas savo turinio pristatymo tinklu.',
            '„Google Places API“ — kavinių paieška: jūsų įvestas tekstas ir apytikslė buvimo vieta (žr. 3 skyrių), siunčiami iš mūsų serverio. „Google“ kavinės identifikatorius nesaugomas.',
            '„OpenAI“ — tik gėrimo pavadinimas ir tik tada, kai mūsų įtaisytoje kofeino lentelėje jo nėra, kad būtų įvertintas kofeino kiekis. Vartotojo vardas, paskyra ar kiti asmens duomenys nesiunčiami.',
            '„Expo“ („650 Industries“) — pristato pranešimus į jūsų telefoną per „Apple Push Notification service“ ir „Google Firebase Cloud Messaging“ (gauna jūsų pranešimų prieigos raktą ir pranešimo tekstą, pvz., „Aistei patiko jūsų flat white“) ir teikia programėlės atnaujinimus (mato jūsų IP adresą ir programėlės versiją).',
            '„OpenStreetMap“ — „Nominatim“, atsarginė kavinių paieška, kai „Google“ paieška nepasiekiama (gauna tik jūsų įvestą tekstą), ir žemėlapio plytelės žiniatinklio versijoje (jūsų naršyklė užklausia matomos žemėlapio srities plytelių).',
            '„Apple Maps“ („iOS“) ir „Google Maps“ („Android“) — piešia žemėlapį programėlėje; jūsų įrenginys matomos srities žemėlapio užklausia tiesiogiai iš jų.',
          ],
        },
        {
          p: 'Duomenis taip pat galime atskleisti, kai to reikalauja įstatymai arba kai tai būtina mūsų vartotojų ar paslaugos teisėms ir saugumui apsaugoti.',
        },
      ],
    },
    {
      heading: '7. Tarptautiniai perdavimai',
      blocks: [
        {
          p: 'Jūsų paskyros duomenys, įvertinimai ir nuotraukos saugomi Europos Sąjungoje (Airijoje). Kai kurie aukščiau nurodyti teikėjai („Google“, „OpenAI“, „Expo“, „Apple“) yra įsikūrę arba duomenis tvarko Jungtinėse Valstijose. Tokie perdavimai grindžiami ES ir JAV duomenų privatumo sistema, kai teikėjas yra sertifikuotas, arba Europos Komisijos standartinėmis sutarčių sąlygomis.',
        },
      ],
    },
    {
      heading: '8. Kiek laiko saugome',
      blocks: [
        {
          bullets: [
            'Visa, kas yra jūsų paskyroje, saugoma, kol to neištrinate. Ištrynus įvertinimą, iš karto pašalinamas jis, jo nuotrauka, „patinka“ ir komentarai.',
            'Ištrynus paskyrą (Nustatymai → Ištrinti paskyrą), iš karto pašalinamas jūsų profilis, vartotojo vardas, slaptažodžio maiša, pranešimų prieigos raktai ir nustatymai, visi jūsų įvertinimai ir jų nuotraukos, jūsų sekimai ir sekėjai, jūsų „patinka“ ir komentarai prie kitų įvertinimų, o jūsų vardas pašalinamas iš įvertinimų, kuriuose jus pažymėjo kiti.',
            `Mūsų duomenų bazė atkūrimui po avarijų automatiškai saugo atsargines kopijas iki ${BACKUP_DAYS} dienų; ištrinti duomenys iš jų išnyksta, kai šios kopijos pasensta. Serverio žurnalai saugomi 14 dienų.`,
            'Pranešimų prieigos raktas taip pat pašalinamas, kai tame įrenginyje atsijungiate arba kai „Apple“ ar „Google“ praneša, kad jis nebegalioja.',
          ],
        },
      ],
    },
    {
      heading: '9. Saugumas',
      blocks: [
        {
          p: 'Visas srautas tarp programėlės ir mūsų serverio šifruojamas (HTTPS). Slaptažodžiai saugomi tik kaip „pasūdytos“ PBKDF2 maišos. Telefone jūsų sesijos raktas laikomas operacinės sistemos saugioje saugykloje („iOS“ – „Keychain“, „Android“ – „Keystore“). Nuotraukos saugomos ilgais, neatspėjamais interneto adresais; bet kas, turintis nuotraukos adresą, gali ją atidaryti, kaip ir jūsų viešą profilį. Nė viena sistema nėra visiškai saugi, tačiau imamės pagrįstų priemonių jūsų duomenims apsaugoti.',
        },
      ],
    },
    {
      heading: '10. Jūsų teisės',
      blocks: [
        { p: 'Pagal BDAR turite teisę:' },
        {
          bullets: [
            'susipažinti su mūsų turimais jūsų asmens duomenimis ir gauti jų kopiją;',
            'reikalauti ištaisyti netikslius duomenis;',
            'reikalauti ištrinti savo duomenis — tai galite padaryti patys bet kada: Nustatymai → Ištrinti paskyrą;',
            'gauti savo duomenis perkeliamu, kompiuterio skaitomu formatu;',
            'nesutikti su tvarkymu, grindžiamu mūsų teisėtu interesu, arba prašyti jį apriboti;',
            'bet kada atšaukti suteiktą leidimą įrenginio nustatymuose;',
            'pateikti skundą priežiūros institucijai — Lietuvoje Valstybinei duomenų apsaugos inspekcijai (vdai.lrv.lt) arba jūsų gyvenamosios šalies institucijai.',
          ],
        },
        {
          p: `Norėdami pasinaudoti teise, rašykite ${CONTACT}. Kadangi jūsų el. pašto adreso nesaugome, nurodykite savo vartotojo vardą ir tiek informacijos apie paskyrą (pvz., kelis savo įvertinimus), kad galėtume įsitikinti, jog ji jūsų. Atsakome per vieną mėnesį.`,
        },
      ],
    },
    {
      heading: '11. Vaikai',
      blocks: [
        {
          p: `„Kavutė“ nėra skirta vaikams. Ja naudotis galite tik sulaukę bent 13 metų arba vyresni, jei to reikalauja jūsų šalies teisė. Sąmoningai nerenkame jaunesnių nei 13 metų vaikų duomenų; jei manote, kad paskyrą susikūrė vaikas, parašykite ${CONTACT} ir ją ištrinsime.`,
        },
      ],
    },
    {
      heading: '12. Šios politikos pakeitimai',
      blocks: [
        {
          p: 'Šią politiką galime atnaujinti, kai keičiasi programėlė ar teisės aktai. Pakeisime datą viršuje, o apie esminius pakeitimus pranešime programėlėje.',
        },
      ],
    },
    {
      heading: '13. Kontaktai',
      blocks: [{ p: `Tomas Valiūnas, Lietuva — ${CONTACT}.` }],
    },
  ],
};

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const doc = usePickLanguage(EN, LT);
  return <LegalLayout title={t('legal.privacy')} doc={doc} current="privacy" />;
}

import { useTranslation } from 'react-i18next';

import { LEGAL_CONTACT } from '@/features/legal/constants';
import { LegalLayout, usePickLanguage, type LegalDoc } from '@/features/legal/LegalLayout';

const CONTACT = LEGAL_CONTACT;

const EN: LegalDoc = {
  intro:
    'These terms are the rules for using Kavutė. They are short on purpose — please read them. By creating an account or using the app you agree to them.',
  sections: [
    {
      heading: '1. The service',
      blocks: [
        {
          p: 'Kavutė lets you rate the coffee you drink, keep a caffeine log, follow friends and tag the people you had coffee with. It is provided by Tomas Valiūnas, an individual developer in Lithuania ("we", "us").',
        },
      ],
    },
    {
      heading: '2. Who may use it',
      blocks: [
        {
          p: 'You must be at least 13 years old, or older where the law of your country requires. One account per person; keep your password to yourself — you are responsible for what happens under your account.',
        },
      ],
    },
    {
      heading: '3. Your content',
      blocks: [
        {
          p: 'The ratings, notes, photos and comments you post stay yours. You give us a non-exclusive, royalty-free licence to store them and show them inside Kavutė — to other users, and on your public profile page — for as long as they are in the app. The licence ends when you delete the content or your account.',
        },
        {
          p: 'Only post what you have the right to share. Before you tag someone or post a photo of a person, make sure they are happy with it.',
        },
      ],
    },
    {
      heading: '4. Acceptable use',
      blocks: [
        { p: 'Do not use Kavutė to:' },
        {
          bullets: [
            'post anything illegal, hateful, sexually explicit, violent or otherwise abusive;',
            'harass, threaten or bully anyone, including through tags or comments;',
            'impersonate another person, or pick a username or display name meant to mislead;',
            'spam, scrape the service, or try to break into, overload or interfere with it.',
          ],
        },
      ],
    },
    {
      heading: '5. Zero tolerance for objectionable content and abusive users',
      blocks: [
        {
          p: 'Kavutė has zero tolerance for objectionable content and for abusive users. Anything that breaks section 4 or the law is removed, and the accounts that post it or abuse other people are suspended or deleted — without warning when the abuse is serious.',
        },
        {
          bullets: [
            'Report: tap “⋯” on any rating, comment or profile (or long-press a comment) and choose Report. Pick a reason and, if you like, add details.',
            'Block: from the same menu you can block a person. You stop seeing each other’s ratings and comments, and they can no longer follow you, tag you or comment on your coffees. They are not told. You can unblock them in Settings → Blocked users.',
            'We review every report within 24 hours, remove the content that breaks these terms, and suspend or delete the account that posted it.',
            'Names, drink names, notes and comments are also checked automatically against a list of slurs and explicit abuse, and text that matches it cannot be posted.',
          ],
        },
        {
          p: `You can also write to ${CONTACT} about anything you see in Kavutė.`,
        },
      ],
    },
    {
      heading: '6. Caffeine figures are estimates',
      blocks: [
        {
          p: 'Caffeine amounts come from a general table or from an automatic (AI) estimate, and real drinks vary a lot. They are for your curiosity, not medical advice. If you need to watch your caffeine intake — for example during pregnancy or because of a health condition — follow your doctor’s advice, not the app.',
        },
      ],
    },
    {
      heading: '7. "As is"',
      blocks: [
        {
          p: 'Kavutė is a free app provided "as is" and "as available", without warranties of any kind. We may change, pause or discontinue features or the whole service. To the extent the law allows, we are not liable for indirect or consequential losses, or for loss of content; nothing here limits liability that cannot be limited by law, or your mandatory consumer rights.',
        },
      ],
    },
    {
      heading: '8. Ending',
      blocks: [
        {
          p: 'You can stop using Kavutė and delete your account at any time in Settings → Delete account. What that removes is described in the Privacy policy.',
        },
      ],
    },
    {
      heading: '9. Privacy',
      blocks: [
        {
          p: 'How we handle personal data is described in the Privacy policy, which is part of these terms.',
        },
      ],
    },
    {
      heading: '10. Governing law',
      blocks: [
        {
          p: 'These terms are governed by the law of the Republic of Lithuania. If you are a consumer, you keep the protection of the mandatory laws of the country you live in, and you may bring a claim there.',
        },
      ],
    },
    {
      heading: '11. Changes',
      blocks: [
        {
          p: 'We may update these terms. We will change the date at the top and, for significant changes, tell you in the app. Continuing to use Kavutė after that means you accept the new terms.',
        },
      ],
    },
    {
      heading: '12. Contact',
      blocks: [{ p: `Questions about these terms: ${CONTACT}.` }],
    },
  ],
};

const LT: LegalDoc = {
  intro:
    'Šios sąlygos — „Kavutės“ naudojimo taisyklės. Jos sąmoningai trumpos — perskaitykite jas. Susikurdami paskyrą ar naudodamiesi programėle, su jomis sutinkate.',
  sections: [
    {
      heading: '1. Paslauga',
      blocks: [
        {
          p: '„Kavutė“ leidžia vertinti išgertą kavą, vesti kofeino žurnalą, sekti draugus ir pažymėti žmones, su kuriais gėrėte kavą. Ją teikia Tomas Valiūnas, Lietuvoje veikiantis individualus kūrėjas („mes“).',
        },
      ],
    },
    {
      heading: '2. Kas gali naudotis',
      blocks: [
        {
          p: 'Jums turi būti bent 13 metų arba daugiau, jei to reikalauja jūsų šalies teisė. Vienam asmeniui — viena paskyra; savo slaptažodžio niekam neatskleiskite — už tai, kas vyksta jūsų paskyroje, atsakote jūs.',
        },
      ],
    },
    {
      heading: '3. Jūsų turinys',
      blocks: [
        {
          p: 'Jūsų paskelbti įvertinimai, pastabos, nuotraukos ir komentarai lieka jūsų. Suteikiate mums neišimtinę, neatlygintiną licenciją juos saugoti ir rodyti „Kavutėje“ — kitiems vartotojams ir jūsų viešame profilio puslapyje — tol, kol jie yra programėlėje. Licencija baigiasi, kai ištrinate turinį ar paskyrą.',
        },
        {
          p: 'Skelbkite tik tai, kuo turite teisę dalytis. Prieš pažymėdami ką nors ar skelbdami žmogaus nuotrauką, įsitikinkite, kad jis neprieštarauja.',
        },
      ],
    },
    {
      heading: '4. Leistinas naudojimas',
      blocks: [
        { p: 'Nenaudokite „Kavutės“, kad:' },
        {
          bullets: [
            'skelbtumėte neteisėtą, neapykantą kurstantį, seksualinio pobūdžio, smurtinį ar kitaip įžeidžiantį turinį;',
            'priekabiautumėte, grasintumėte ar tyčiotumėtės iš kitų, taip pat žymėjimais ar komentarais;',
            'apsimestumėte kitu asmeniu arba pasirinktumėte klaidinantį vartotojo ar rodomą vardą;',
            'siuntinėtumėte šlamštą, masiškai rinktumėte duomenis iš paslaugos ar bandytumėte į ją įsilaužti, ją perkrauti ar trikdyti.',
          ],
        },
      ],
    },
    {
      heading: '5. Nulinė tolerancija netinkamam turiniui ir piktnaudžiaujantiems vartotojams',
      blocks: [
        {
          p: '„Kavutė“ netoleruoja jokio netinkamo turinio ir piktnaudžiaujančių vartotojų. Viskas, kas pažeidžia 4 skyrių ar įstatymus, pašalinama, o paskyros, kurios tai skelbia ar įžeidinėja kitus, sustabdomos arba ištrinamos — rimtais atvejais be įspėjimo.',
        },
        {
          bullets: [
            'Pranešimas: bet kurio įvertinimo, komentaro ar profilio meniu „⋯“ (arba ilgai paspaudę komentarą) pasirinkite „Pranešti“. Nurodykite priežastį ir, jei norite, parašykite daugiau.',
            'Blokavimas: tame pačiame meniu galite užblokuoti žmogų. Nebematysite vienas kito įvertinimų ir komentarų, o jis nebegalės jūsų sekti, pažymėti ar komentuoti jūsų kavos. Jam apie tai nepranešama. Atblokuoti galite skiltyje Nustatymai → Užblokuoti vartotojai.',
            'Kiekvieną pranešimą peržiūrime per 24 valandas, pašaliname šias sąlygas pažeidžiantį turinį ir sustabdome arba ištriname jį paskelbusią paskyrą.',
            'Vardai, gėrimų pavadinimai, pastabos ir komentarai taip pat automatiškai tikrinami pagal įžeidžiančių ir vulgarių žodžių sąrašą — juos atitinkančio teksto paskelbti negalima.',
          ],
        },
        {
          p: `Apie bet ką, ką matote „Kavutėje“, taip pat galite parašyti ${CONTACT}.`,
        },
      ],
    },
    {
      heading: '6. Kofeino kiekiai yra apytiksliai',
      blocks: [
        {
          p: 'Kofeino kiekiai paimami iš bendros lentelės arba automatiškai (dirbtinio intelekto) įvertinami, o tikri gėrimai labai skiriasi. Jie skirti jūsų smalsumui, o ne medicininei konsultacijai. Jei turite stebėti suvartojamą kofeino kiekį — pavyzdžiui, nėštumo metu ar dėl sveikatos būklės — vadovaukitės gydytojo, o ne programėlės patarimais.',
        },
      ],
    },
    {
      heading: '7. „Tokia, kokia yra“',
      blocks: [
        {
          p: '„Kavutė“ — nemokama programėlė, teikiama „tokia, kokia yra“ ir „kiek ji pasiekiama“, be jokių garantijų. Galime keisti, sustabdyti ar nutraukti funkcijas arba visą paslaugą. Kiek leidžia įstatymai, neatsakome už netiesioginius ar pasekminius nuostolius ar turinio praradimą; niekas čia neriboja atsakomybės, kurios pagal įstatymus riboti negalima, ir jūsų privalomų vartotojo teisių.',
        },
      ],
    },
    {
      heading: '8. Pabaiga',
      blocks: [
        {
          p: 'Bet kada galite nustoti naudotis „Kavute“ ir ištrinti paskyrą: Nustatymai → Ištrinti paskyrą. Kas tada pašalinama, aprašyta privatumo politikoje.',
        },
      ],
    },
    {
      heading: '9. Privatumas',
      blocks: [
        {
          p: 'Kaip tvarkome asmens duomenis, aprašyta privatumo politikoje, kuri yra šių sąlygų dalis.',
        },
      ],
    },
    {
      heading: '10. Taikoma teisė',
      blocks: [
        {
          p: 'Šioms sąlygoms taikoma Lietuvos Respublikos teisė. Jei esate vartotojas, jums išlieka jūsų gyvenamosios šalies privalomų įstatymų apsauga, ir ieškinį galite pareikšti ten.',
        },
      ],
    },
    {
      heading: '11. Pakeitimai',
      blocks: [
        {
          p: 'Šias sąlygas galime atnaujinti. Pakeisime datą viršuje, o apie esminius pakeitimus pranešime programėlėje. Toliau naudodamiesi „Kavute“, sutinkate su naujomis sąlygomis.',
        },
      ],
    },
    {
      heading: '12. Kontaktai',
      blocks: [{ p: `Klausimai dėl šių sąlygų: ${CONTACT}.` }],
    },
  ],
};

export default function TermsScreen() {
  const { t } = useTranslation();
  const doc = usePickLanguage(EN, LT);
  return <LegalLayout title={t('legal.terms')} doc={doc} current="terms" />;
}

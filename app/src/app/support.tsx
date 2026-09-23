import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { LEGAL_CONTACT } from '@/features/legal/constants';
import { LegalLayout, usePickLanguage, type LegalDoc } from '@/features/legal/LegalLayout';

const CONTACT = LEGAL_CONTACT;

const EN: LegalDoc = {
  intro: 'Need help with Kavutė? Here is how to reach us, and answers to the usual questions.',
  sections: [
    {
      heading: 'Contact us',
      blocks: [
        {
          p: `Email ${CONTACT}. Tell us your Kavutė username, which device you use (iPhone, Android or web) and what went wrong — a screenshot helps. We usually answer within a few days.`,
        },
      ],
    },
    {
      heading: 'I forgot my password',
      blocks: [
        {
          p: 'Kavutė does not store an email address, so there is no automatic "reset password" email. Instead:',
        },
        {
          bullets: [
            `Email ${CONTACT} with your username.`,
            'Help us confirm the account is yours — for example your display name, roughly when you joined, and a few coffees you rated (drink and café).',
            'Once we are satisfied, we set a temporary password and send it to you; sign in and keep using the app. If we cannot confirm it, we cannot reset it — that protects your account from anyone else asking.',
          ],
        },
      ],
    },
    {
      heading: 'Other questions',
      blocks: [
        {
          bullets: [
            'Notifications — choose which ones you get in Settings → Notifications; turn them off entirely in your phone’s system settings.',
            'Language and appearance — Settings → Language / Appearance.',
            'A rating is wrong — open it and edit or delete it.',
            'Someone is abusing Kavutė — email us the username and what happened.',
            'Your data — the Privacy policy explains what we keep and your rights.',
          ],
        },
      ],
    },
    {
      heading: 'Deleting your account',
      blocks: [
        {
          p: 'Signed in, go to Settings → Delete account. It is immediate and removes your account and everything in it. The page below explains exactly what is deleted, and what to do if you cannot sign in.',
        },
      ],
    },
  ],
};

const LT: LegalDoc = {
  intro: 'Reikia pagalbos su „Kavute“? Štai kaip su mumis susisiekti ir atsakymai į dažniausius klausimus.',
  sections: [
    {
      heading: 'Susisiekite',
      blocks: [
        {
          p: `Rašykite ${CONTACT}. Nurodykite savo „Kavutės“ vartotojo vardą, kokį įrenginį naudojate („iPhone“, „Android“ ar žiniatinklį) ir kas nutiko — ekrano nuotrauka labai padeda. Paprastai atsakome per kelias dienas.`,
        },
      ],
    },
    {
      heading: 'Pamiršau slaptažodį',
      blocks: [
        {
          p: '„Kavutė“ nesaugo el. pašto adreso, todėl automatinio slaptažodžio atkūrimo laiško nėra. Vietoje to:',
        },
        {
          bullets: [
            `Parašykite ${CONTACT} ir nurodykite savo vartotojo vardą.`,
            'Padėkite mums įsitikinti, kad paskyra jūsų — pavyzdžiui, nurodykite rodomą vardą, maždaug kada prisiregistravote ir kelias įvertintas kavas (gėrimą ir kavinę).',
            'Įsitikinę nustatysime laikiną slaptažodį ir jį jums atsiųsime; prisijunkite ir naudokitės toliau. Jei įsitikinti nepavyks, slaptažodžio pakeisti negalėsime — taip jūsų paskyra apsaugoma nuo kitų prašančiųjų.',
          ],
        },
      ],
    },
    {
      heading: 'Kiti klausimai',
      blocks: [
        {
          bullets: [
            'Pranešimai — kuriuos gauti, pasirinkite Nustatymai → Pranešimai; visiškai išjungti galite telefono sistemos nustatymuose.',
            'Kalba ir išvaizda — Nustatymai → Kalba / Išvaizda.',
            'Įvertinime klaida — atidarykite jį ir redaguokite arba ištrinkite.',
            'Kas nors piktnaudžiauja „Kavute“ — parašykite mums vartotojo vardą ir kas nutiko.',
            'Jūsų duomenys — privatumo politikoje paaiškinta, ką saugome ir kokias teises turite.',
          ],
        },
      ],
    },
    {
      heading: 'Paskyros ištrynimas',
      blocks: [
        {
          p: 'Prisijungę eikite į Nustatymai → Ištrinti paskyrą. Paskyra ištrinama iš karto kartu su viskuo, kas joje yra. Žemiau esančiame puslapyje tiksliai paaiškinta, kas ištrinama ir ką daryti, jei negalite prisijungti.',
        },
      ],
    },
  ],
};

export default function SupportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const doc = usePickLanguage(EN, LT);
  return (
    <LegalLayout title={t('legal.support')} doc={doc} current="support">
      <Button
        title={t('legal.deleteAccount')}
        variant="ghost"
        onPress={() => router.push('/delete-account')}
      />
    </LegalLayout>
  );
}

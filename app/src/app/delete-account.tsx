import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { BACKUP_RETENTION_DAYS, LEGAL_CONTACT } from '@/features/legal/constants';
import { LegalLayout, usePickLanguage, type LegalDoc } from '@/features/legal/LegalLayout';
import { useAuth } from '@/lib/auth';

/**
 * The public "how to delete your Kavutė account" page. Google Play requires one at a URL that works
 * without the app and without an account (it goes in the Play Console's data-safety form); App
 * Store review reads it too. The deletion itself happens in the app — Settings → Delete account —
 * behind a password check; this page explains it and hands off to sign-in.
 */
const CONTACT = LEGAL_CONTACT;
const BACKUP_DAYS = BACKUP_RETENTION_DAYS;

const EN: LegalDoc = {
  intro:
    'You can delete your Kavutė account and all of its data at any time, from inside the app. Deletion is immediate and cannot be undone.',
  sections: [
    {
      heading: 'How to delete your account',
      blocks: [
        {
          bullets: [
            'Sign in to Kavutė (iPhone, Android or the web version).',
            'Open Profile → the gear icon (Settings).',
            'Scroll to the bottom and tap "Delete account".',
            'Confirm, then enter your password. Your account is deleted straight away and you are signed out.',
          ],
        },
      ],
    },
    {
      heading: 'What is deleted',
      blocks: [
        {
          bullets: [
            'Your profile: username, display name and password hash. Your username becomes available to others.',
            'All your ratings, with their notes, caffeine figures and photos.',
            'Who you follow and who follows you.',
            'Your likes and comments on other people’s ratings.',
            'Your name on ratings where other people tagged you as a companion (their ratings stay, without you).',
            'Your push-notification tokens and notification preferences.',
          ],
        },
      ],
    },
    {
      heading: 'What remains',
      blocks: [
        {
          p: `Nothing stays in the app. Encrypted database backups kept for disaster recovery roll off within ${BACKUP_DAYS} days, and server logs within 14 days; deleted data is not restored from them. Copies other people made themselves (for example a screenshot) are outside our control.`,
        },
      ],
    },
    {
      heading: 'Cannot sign in?',
      blocks: [
        {
          p: `Email ${CONTACT} from any address with your username and a few details that show the account is yours (for example your display name and some coffees you rated). Once confirmed, we delete the account for you and reply when it is done.`,
        },
      ],
    },
  ],
};

const LT: LegalDoc = {
  intro:
    'Savo „Kavutės“ paskyrą ir visus jos duomenis galite ištrinti bet kada pačioje programėlėje. Paskyra ištrinama iš karto ir to atšaukti negalima.',
  sections: [
    {
      heading: 'Kaip ištrinti paskyrą',
      blocks: [
        {
          bullets: [
            'Prisijunkite prie „Kavutės“ („iPhone“, „Android“ ar žiniatinklio versijoje).',
            'Atidarykite Profilis → krumpliaračio piktograma (Nustatymai).',
            'Slinkite į apačią ir paspauskite „Ištrinti paskyrą“.',
            'Patvirtinkite ir įveskite slaptažodį. Paskyra iš karto ištrinama, o jūs atjungiami.',
          ],
        },
      ],
    },
    {
      heading: 'Kas ištrinama',
      blocks: [
        {
          bullets: [
            'Jūsų profilis: vartotojo vardas, rodomas vardas ir slaptažodžio maiša. Vartotojo vardas vėl tampa laisvas kitiems.',
            'Visi jūsų įvertinimai su pastabomis, kofeino kiekiais ir nuotraukomis.',
            'Ką sekate ir kas seka jus.',
            'Jūsų „patinka“ ir komentarai prie kitų žmonių įvertinimų.',
            'Jūsų vardas įvertinimuose, kuriuose kiti jus pažymėjo kaip kompanioną (jų įvertinimai lieka, tik be jūsų).',
            'Jūsų pranešimų prieigos raktai ir pranešimų nustatymai.',
          ],
        },
      ],
    },
    {
      heading: 'Kas lieka',
      blocks: [
        {
          p: `Programėlėje nelieka nieko. Šifruotos duomenų bazės atsarginės kopijos, saugomos atkūrimui po avarijų, išnyksta per ${BACKUP_DAYS} dienas, o serverio žurnalai — per 14 dienų; ištrinti duomenys iš jų neatkuriami. Kopijos, kurias kiti žmonės pasidarė patys (pvz., ekrano nuotraukos), nuo mūsų nepriklauso.`,
        },
      ],
    },
    {
      heading: 'Negalite prisijungti?',
      blocks: [
        {
          p: `Parašykite ${CONTACT} iš bet kurio adreso, nurodykite savo vartotojo vardą ir kelias detales, rodančias, kad paskyra jūsų (pvz., rodomą vardą ir kelias įvertintas kavas). Įsitikinę paskyrą ištrinsime už jus ir atsakysime, kai tai bus padaryta.`,
        },
      ],
    },
  ],
};

export default function DeleteAccountInfoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signedIn } = useAuth();
  const doc = usePickLanguage(EN, LT);
  return (
    <LegalLayout title={t('legal.deleteAccount')} doc={doc} current="delete-account">
      {/* Signed in already: straight to the danger zone. Signed out: sign in first, then land there
          (the auth gate honours `?next=` after a successful sign-in). */}
      <Button
        title={signedIn ? t('legal.goToSettings') : t('legal.signInToDelete')}
        variant="danger"
        onPress={() =>
          signedIn
            ? router.push('/settings')
            : router.push({ pathname: '/login', params: { next: '/settings' } })
        }
      />
    </LegalLayout>
  );
}

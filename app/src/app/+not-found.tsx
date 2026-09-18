import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { CupIcon } from '@/components/icons';
import { colors } from '@/theme';

/** Any URL that does not exist — mostly a stale web link. */
export default function NotFoundScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={s.screen}>
      <EmptyState
        icon={<CupIcon size={26} color={colors.inkFaint} />}
        title={t('errors.not_found')}
        actionLabel={t('common.back')}
        onAction={() => router.replace('/')}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
});

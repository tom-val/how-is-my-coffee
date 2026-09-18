import { Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { colors } from '@/theme';

/**
 * The four primary tabs. The bar itself is ours (see `components/tab-bar.tsx`) — it carries the
 * raised "rate" button, which is not a tab but a modal, and it has to look the same on web as on
 * the two native platforms.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="places" />
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

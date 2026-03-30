import { Slot, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initDatabase } from '../src/lib/offline-db';
import { registerBackgroundSync } from '../src/lib/sync-engine';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

export default function RootLayout() {
  const [isReady, setIsReady]       = useState(false);
  const [isAuthenticated, setIsAuth] = useState(false);

  useEffect(() => { bootstrap(); }, []);

  const bootstrap = async () => {
    try {
      await initDatabase();
      const token = await SecureStore.getItemAsync('access_token');
      setIsAuth(!!token);
      if (token) {
        await registerBackgroundSync().catch(console.warn);
      }
    } catch (err) {
      console.error('Bootstrap error:', err);
    } finally {
      setIsReady(true);
    }
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#3366f5" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="login" />
        ) : (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="work-order/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="inspection-form" options={{ presentation: 'card' }} />
            <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
            <Stack.Screen name="sync-status" options={{ presentation: 'card' }} />
            <Stack.Screen name="profile" options={{ presentation: 'card' }} />
          </>
        )}
      </Stack>
    </QueryClientProvider>
  );
}

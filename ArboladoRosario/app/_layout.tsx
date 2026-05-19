import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e5e5e5',
          height: 60,
          paddingBottom: 8,
        },
        headerStyle: { backgroundColor: '#0F6E56' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 15 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
          headerTitle: 'Dir. Técnica de Arbolado',
        }}
      />
      <Tabs.Screen
        name="reclamos"
        options={{
          title: 'Reclamos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" color={color} size={size} />
          ),
          headerTitle: 'Reclamos pendientes',
        }}
      />
      <Tabs.Screen
        name="dictamen"
        options={{
          title: 'Dictamen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" color={color} size={size} />
          ),
          headerTitle: 'Dictamen Técnico',
        }}
      />
      <Tabs.Screen
        name="rutas"
        options={{
          title: 'Rutas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" color={color} size={size} />
          ),
          headerTitle: 'Rutas eficientes',
        }}
      />
      <Tabs.Screen
        name="tormenta"
        options={{
          title: 'Tormenta',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="thunderstorm-outline" color={color} size={size} />
          ),
          tabBarActiveTintColor: '#E24B4A',
          headerTitle: '⛈ Urgencia por Tormenta',
          headerStyle: { backgroundColor: '#1e1b4b' },
        }}
      />
    </Tabs>
  );
}
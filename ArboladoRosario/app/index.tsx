import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator
} from 'react-native';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useRouter } from 'expo-router';

interface Stats {
  totalReclamos: number;
  pendientes: number;
  urgentes: number;
  tormenta: number;
  resueltos: number;
  totalDictamenes: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalReclamos: 0,
    pendientes: 0,
    urgentes: 0,
    tormenta: 0,
    resueltos: 0,
    totalDictamenes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [ultimosReclamos, setUltimosReclamos] = useState<any[]>([]);

  useEffect(() => { cargarStats(); }, []);

  async function cargarStats() {
    setLoading(true);
    try {
      const qR = query(collection(db, 'reclamos'), orderBy('fecha', 'desc'));
      const snapR = await getDocs(qR);
      const reclamos = snapR.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const qD = query(collection(db, 'dictamenes'));
      const snapD = await getDocs(qD);

      setStats({
        totalReclamos: reclamos.length,
        pendientes: reclamos.filter(r => r.estado === 'pendiente').length,
        urgentes: reclamos.filter(r => r.prioridad === 'urgente').length,
        tormenta: reclamos.filter(r => r.esTormenta).length,
        resueltos: reclamos.filter(r => r.estado === 'resuelto').length,
        totalDictamenes: snapD.size,
      });

      setUltimosReclamos(reclamos.slice(0, 3));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const PRIORIDAD_COLORS: Record<string, string> = {
    urgente: '#E24B4A',
    alta: '#EF9F27',
    media: '#378ADD',
    baja: '#1D9E75',
    tormenta: '#6366f1',
  };

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#1D9E75" />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>

      {/* BIENVENIDA */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Dirección Técnica de Arbolado</Text>
          <Text style={styles.headerSub}>Municipalidad de Rosario</Text>
        </View>
        <Text style={styles.headerIcon}>🌳</Text>
      </View>

      {/* ALERTA TORMENTA */}
      {stats.tormenta > 0 && (
        <TouchableOpacity
          style={styles.alertaTormenta}
          onPress={() => router.push('/tormenta')}
        >
          <Text style={styles.alertaTormentaIcon}>⛈</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertaTormentaTitle}>
              {stats.tormenta} caso{stats.tormenta > 1 ? 's' : ''} de tormenta pendiente{stats.tormenta > 1 ? 's' : ''}
            </Text>
            <Text style={styles.alertaTormentaSub}>Tocá para ver el modo emergencia →</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* MÉTRICAS PRINCIPALES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Resumen del sistema</Text>
        <View style={styles.metricsGrid}>
          {[
            { label: 'Total reclamos', value: stats.totalReclamos, color: '#0F6E56' },
            { label: 'Pendientes', value: stats.pendientes, color: '#EF9F27' },
            { label: 'Urgentes', value: stats.urgentes, color: '#E24B4A' },
            { label: 'Tormenta', value: stats.tormenta, color: '#6366f1' },
            { label: 'Resueltos', value: stats.resueltos, color: '#1D9E75' },
            { label: 'Dictámenes', value: stats.totalDictamenes, color: '#378ADD' },
          ].map(m => (
            <View key={m.label} style={styles.metricCard}>
              <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ACCESOS RÁPIDOS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Accesos rápidos</Text>
        <View style={styles.accesoGrid}>
          {[
            { label: 'Nuevo reclamo', icon: '📋', route: '/reclamos', color: '#0F6E56' },
            { label: 'Nuevo dictamen', icon: '📝', route: '/dictamen', color: '#378ADD' },
            { label: 'Planificar ruta', icon: '🗺', route: '/rutas', color: '#EF9F27' },
            { label: 'Modo tormenta', icon: '⛈', route: '/tormenta', color: '#6366f1' },
          ].map(a => (
            <TouchableOpacity
              key={a.label}
              style={[styles.accesoBtn, { borderColor: a.color }]}
              onPress={() => router.push(a.route as any)}
            >
              <Text style={styles.accesoIcon}>{a.icon}</Text>
              <Text style={[styles.accesoLabel, { color: a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ÚLTIMOS RECLAMOS */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Últimos reclamos</Text>
          <TouchableOpacity onPress={() => router.push('/reclamos')}>
            <Text style={styles.verTodos}>Ver todos →</Text>
          </TouchableOpacity>
        </View>

        {ultimosReclamos.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay reclamos cargados aún</Text>
          </View>
        ) : (
          ultimosReclamos.map(r => (
            <View key={r.id} style={[styles.reclamoItem, r.esTormenta && styles.reclamoItemTormenta]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reclamoNsum, r.esTormenta && { color: '#e0e7ff' }]}>
                  {r.esTormenta ? '⛈ ' : ''}SUA {r.nsum}
                </Text>
                <Text style={[styles.reclamoDir, r.esTormenta && { color: '#a5b4fc' }]}>
                  {r.direccion}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: (PRIORIDAD_COLORS[r.prioridad] || '#999') + '22' }]}>
                <Text style={[styles.badgeText, { color: PRIORIDAD_COLORS[r.prioridad] || '#999' }]}>
                  {r.prioridad}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* BOTÓN REFRESH */}
      <TouchableOpacity style={styles.btnRefresh} onPress={cargarStats}>
        <Text style={styles.btnRefreshText}>↻ Actualizar datos</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0F6E56', borderRadius: 12, padding: 16, marginBottom: 12 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: 'white' },
  headerSub: { fontSize: 12, color: '#9FE1CB', marginTop: 2 },
  headerIcon: { fontSize: 36 },
  alertaTormenta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1e1b4b', borderWidth: 1.5, borderColor: '#6366f1', borderRadius: 12, padding: 14, marginBottom: 12 },
  alertaTormentaIcon: { fontSize: 24 },
  alertaTormentaTitle: { fontSize: 13, fontWeight: '700', color: '#e0e7ff' },
  alertaTormentaSub: { fontSize: 11, color: '#a5b4fc', marginTop: 2 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#e5e5e5' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { width: '30%', alignItems: 'center', padding: 10, backgroundColor: '#f9f9f9', borderRadius: 8, flexGrow: 1 },
  metricValue: { fontSize: 22, fontWeight: '700' },
  metricLabel: { fontSize: 10, color: '#666', marginTop: 2, textAlign: 'center' },
  accesoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  accesoBtn: { width: '47%', flexGrow: 1, alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1.5, backgroundColor: 'white' },
  accesoIcon: { fontSize: 28, marginBottom: 6 },
  accesoLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  reclamoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  reclamoItemTormenta: { backgroundColor: '#1e1b4b', borderRadius: 8, padding: 10, marginBottom: 4, borderBottomWidth: 0 },
  reclamoNsum: { fontSize: 13, fontWeight: '600', color: '#111' },
  reclamoDir: { fontSize: 11, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  verTodos: { fontSize: 12, color: '#1D9E75', fontWeight: '600' },
  empty: { alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 13, color: '#999' },
  btnRefresh: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e5e5', alignItems: 'center', backgroundColor: 'white', marginBottom: 20 },
  btnRefreshText: { fontSize: 14, color: '#666', fontWeight: '500' },
});
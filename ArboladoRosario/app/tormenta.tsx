import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';

interface Reclamo {
  id?: string;
  nsum: string;
  direccion: string;
  descripcion: string;
  prioridad: string;
  estado: string;
  esTormenta: boolean;
  fecha: any;
}

const T_DICT = 7;
const VEL = { auto: 30, bici: 12 };
const DIST_KM = { auto: 1.6, bici: 0.45 };

type Modo = 'auto' | 'bici';
type Filtro = 'todos' | 'hoy' | 'ayer';

function minToH(m: number) {
  const h = Math.floor(m / 60), mn = Math.round(m % 60);
  return h === 0 ? mn + 'min' : mn === 0 ? h + 'h' : h + 'h ' + mn + 'min';
}

function fmt(m: number) {
  const h = Math.floor(m / 60) % 24, mn = Math.round(m % 60);
  return (h < 10 ? '0' : '') + h + ':' + (mn < 10 ? '0' : '') + mn;
}

function getDia(fecha: any): Filtro {
  if (!fecha) return 'todos';
  const hoy = new Date();
  const f = fecha.toDate ? fecha.toDate() : new Date(fecha);
  const diffMs = hoy.getTime() - f.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDias === 0) return 'hoy';
  if (diffDias === 1) return 'ayer';
  return 'todos';
}

export default function Tormenta() {
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [rutaCalculada, setRutaCalculada] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [modo] = useState<Modo>('auto');
  const [horas, setHoras] = useState(5);
  const [rutaCasos, setRutaCasos] = useState<Reclamo[]>([]);
  const [stats, setStats] = useState({ nCasos: 0, workMin: 0, distKm: 0, pendientes: 0 });

  useEffect(() => { cargarReclamos(); }, []);

  async function cargarReclamos() {
    setLoading(true);
    try {
      const q = query(collection(db, 'reclamos'), orderBy('fecha', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Reclamo)
        .filter(r => r.esTormenta && r.estado === 'pendiente');
      setReclamos(data);
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los casos de tormenta');
    }
    setLoading(false);
  }

  const reclamosFiltrados = filtro === 'todos'
    ? reclamos
    : reclamos.filter(r => getDia(r.fecha) === filtro);

  function calcularRuta() {
    setCalculando(true);
    setTimeout(() => {
      const d = DIST_KM[modo], v = VEL[modo];
      const tXc = T_DICT + (d / v * 60);
      const nCasos = Math.min(Math.floor(horas * 60 / tXc), reclamos.length);

      if (nCasos === 0) {
        Alert.alert('Sin casos', 'No hay casos de tormenta pendientes');
        setCalculando(false);
        return;
      }

      const casos = reclamos.slice(0, nCasos);
      const workMin = Math.round(nCasos * tXc);

      setRutaCasos(casos);
      setStats({
        nCasos,
        workMin,
        distKm: nCasos * d,
        pendientes: reclamos.length - nCasos,
      });
      setRutaCalculada(true);
      setCalculando(false);
    }, 800);
  }

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );

  if (rutaCalculada) return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>

      {/* MÉTRICAS */}
      <View style={styles.metricsRow}>
        {[
          { label: 'Casos', value: stats.nCasos },
          { label: 'Tiempo', value: minToH(stats.workMin) },
          { label: 'Recorrido', value: stats.distKm.toFixed(1) + ' km' },
          { label: 'Pendientes', value: stats.pendientes },
        ].map(m => (
          <View key={m.label} style={styles.metricCard}>
            <Text style={[styles.metricValue, m.label === 'Pendientes' && stats.pendientes > 0 && { color: '#E24B4A' }]}>
              {m.value}
            </Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {stats.pendientes > 0 && (
        <View style={styles.alertaDanger}>
          <Text style={styles.alertaDangerText}>
            ⚠ Quedan {stats.pendientes} casos de tormenta sin atender hoy
          </Text>
        </View>
      )}

      {/* CRONOGRAMA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cronograma de emergencia</Text>
        <View style={styles.tlItem}>
          <View style={[styles.tlDot, { backgroundColor: '#6366f1' }]} />
          <View>
            <Text style={styles.tlTime}>08:00</Text>
            <Text style={styles.tlDesc}>Salida desde Parques y Paseos</Text>
          </View>
        </View>
        {rutaCasos.map((c, i) => {
          const tXc = T_DICT + (DIST_KM[modo] / VEL[modo] * 60);
          const hora = 8 * 60 + 5 + i * tXc;
          return (
            <View key={c.id} style={styles.tlItem}>
              <View style={[styles.tlDot, { backgroundColor: '#6366f1' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tlTime}>{fmt(hora)} — Caso {i + 1}</Text>
                <Text style={styles.tlDesc}>{c.direccion}</Text>
                <Text style={styles.tlSub}>SUA {c.nsum}</Text>
              </View>
            </View>
          );
        })}
        <View style={styles.tlItem}>
          <View style={[styles.tlDot, { backgroundColor: '#6366f1' }]} />
          <View>
            <Text style={styles.tlTime}>
              {fmt(8 * 60 + 5 + rutaCasos.length * (T_DICT + DIST_KM[modo] / VEL[modo] * 60) + 10)}
            </Text>
            <Text style={styles.tlDesc}>Regreso a Parques y Paseos</Text>
          </View>
        </View>
      </View>

      {/* ORDEN */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Orden de visitas — emergencia</Text>
        {rutaCasos.map((c, i) => (
          <View key={c.id} style={styles.ordenItem}>
            <View style={styles.ordenNum}>
              <Text style={styles.ordenNumText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ordenNsum}>SUA {c.nsum}</Text>
              <Text style={styles.ordenDir}>{c.direccion}</Text>
              <Text style={styles.ordenDesc}>⛈ {c.descripcion}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>tormenta</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.btnSecundario} onPress={() => setRutaCalculada(false)}>
        <Text style={styles.btnSecundarioText}>✕ Reconfigurar</Text>
      </TouchableOpacity>

    </ScrollView>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>

      {/* BANNER */}
      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>⛈</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Urgencia por Tormenta activa</Text>
          <Text style={styles.bannerSub}>
            {reclamos.length} casos pendientes requieren intervención inmediata
          </Text>
          <View style={styles.estadoBadge}>
            <View style={styles.dotPulse} />
            <Text style={styles.estadoText}>Modo emergencia</Text>
          </View>
        </View>
      </View>

      {/* FILTROS */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Casos pendientes</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{reclamosFiltrados.length} casos</Text>
          </View>
        </View>
        <View style={styles.filtrosRow}>
          {(['todos', 'hoy', 'ayer'] as Filtro[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filtroBtn, filtro === f && styles.filtroBtnActive]}
              onPress={() => setFiltro(f)}
            >
              <Text style={[styles.filtroText, filtro === f && styles.filtroTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'todos' ? `(${reclamos.length})` : f === 'hoy' ? `(${reclamos.filter(r => getDia(r.fecha) === 'hoy').length})` : `(${reclamos.filter(r => getDia(r.fecha) === 'ayer').length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {reclamosFiltrados.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay casos de tormenta pendientes</Text>
          </View>
        ) : (
          reclamosFiltrados.map(c => (
            <View key={c.id} style={styles.tormentaCard}>
              <View style={styles.tormentaHeader}>
                <View>
                  <Text style={styles.tormentaNsum}>⛈ SUA {c.nsum}</Text>
                  <Text style={styles.tormentaDir}>📍 {c.direccion}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Tormenta</Text>
                </View>
              </View>
              <Text style={styles.tormentaDesc}>{c.descripcion}</Text>
            </View>
          ))
        )}
      </View>

      {/* CONFIGURAR RUTA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Planificar ruta de emergencia</Text>

        <View style={styles.alertaInfo}>
          <Text style={styles.alertaInfoText}>
            En modo tormenta no hay distribución de prioridades. Se resuelven todos los casos por orden de ingreso.
          </Text>
        </View>

         <Text style={styles.fieldLabel}>¿Cuánto tiempo disponés?</Text>
        <View style={styles.horasRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(h => (
            <TouchableOpacity
              key={h}
              style={[styles.horaBtn, horas === h && styles.horaBtnActive]}
              onPress={() => setHoras(h)}
            >
              <Text style={[styles.horaBtnText, horas === h && styles.horaBtnTextActive]}>{h}h</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.horaEstimado}>
          ~{Math.min(Math.floor(horas * 60 / (T_DICT + DIST_KM[modo] / VEL[modo] * 60)), reclamos.length)} de {reclamos.length} casos atendibles hoy
        </Text>

        <TouchableOpacity
          style={[styles.btnCalcular, calculando && { opacity: 0.7 }]}
          onPress={calcularRuta}
          disabled={calculando}
        >
          {calculando
            ? <ActivityIndicator color="white" />
            : <Text style={styles.btnCalcularText}>⛈ Calcular ruta de emergencia</Text>
          }
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0e2a' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0e2a' },
  banner: { flexDirection: 'row', gap: 12, backgroundColor: '#1e1b4b', borderWidth: 1.5, borderColor: '#6366f1', borderRadius: 12, padding: 14, margin: 14, marginBottom: 0 },
  bannerIcon: { fontSize: 28 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#e0e7ff', marginBottom: 3 },
  bannerSub: { fontSize: 12, color: '#a5b4fc', lineHeight: 17 },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#4338ca', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8, alignSelf: 'flex-start' },
  dotPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6ee7b7' },
  estadoText: { fontSize: 11, color: '#e0e7ff', fontWeight: '500' },
  card: { backgroundColor: '#1e1b4b', borderRadius: 12, padding: 14, margin: 14, marginBottom: 0, borderWidth: 0.5, borderColor: '#4338ca' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#e0e7ff', marginBottom: 12 },
  filtrosRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filtroBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#4338ca' },
  filtroBtnActive: { backgroundColor: '#4338ca' },
  filtroText: { fontSize: 11, color: '#818cf8' },
  filtroTextActive: { color: '#e0e7ff', fontWeight: '600' },
  tormentaCard: { backgroundColor: '#12113a', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 0.5, borderColor: '#4338ca' },
  tormentaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  tormentaNsum: { fontSize: 12, fontWeight: '600', color: '#e0e7ff' },
  tormentaDir: { fontSize: 11, color: '#a5b4fc', marginTop: 2 },
  tormentaDesc: { fontSize: 11, color: '#c7d2fe' },
  badge: { backgroundColor: '#312e81', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 10, color: '#a5b4fc', fontWeight: '600' },
  alertaInfo: { backgroundColor: '#12113a', borderRadius: 8, padding: 10, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#6366f1' },
  alertaInfoText: { fontSize: 12, color: '#a5b4fc', lineHeight: 17 },
  alertaDanger: { backgroundColor: '#450a0a', borderRadius: 8, padding: 10, margin: 14, marginBottom: 0, borderLeftWidth: 3, borderLeftColor: '#E24B4A' },
  alertaDangerText: { fontSize: 12, color: '#fca5a5' },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  modoRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modoBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#4338ca', alignItems: 'center' },
  modoBtnActive: { backgroundColor: '#4338ca' },
  modoBtnText: { fontSize: 13, color: '#818cf8' },
  modoBtnTextActive: { color: 'white', fontWeight: '600' },
  horasRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  horaBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#4338ca' },
  horaBtnActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  horaBtnText: { fontSize: 12, color: '#818cf8' },
  horaBtnTextActive: { color: 'white', fontWeight: '600' },
  horaEstimado: { fontSize: 12, color: '#6ee7b7', fontWeight: '500', marginBottom: 14 },
  btnCalcular: { backgroundColor: '#6366f1', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  btnCalcularText: { color: 'white', fontSize: 15, fontWeight: '700' },
  btnSecundario: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#4338ca', alignItems: 'center', margin: 14, backgroundColor: '#1e1b4b' },
  btnSecundarioText: { fontSize: 14, color: '#a5b4fc', fontWeight: '500' },
  metricsRow: { flexDirection: 'row', gap: 8, margin: 14, marginBottom: 0 },
  metricCard: { flex: 1, alignItems: 'center', padding: 8, backgroundColor: '#1e1b4b', borderRadius: 8, borderWidth: 0.5, borderColor: '#4338ca' },
  metricValue: { fontSize: 18, fontWeight: '700', color: '#e0e7ff' },
  metricLabel: { fontSize: 10, color: '#818cf8', marginTop: 2 },
  tlItem: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3, flexShrink: 0 },
  tlTime: { fontSize: 12, fontWeight: '600', color: '#e0e7ff' },
  tlDesc: { fontSize: 11, color: '#a5b4fc' },
  tlSub: { fontSize: 10, color: '#6366f1' },
  ordenItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#312e81' },
  ordenNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ordenNumText: { color: 'white', fontSize: 11, fontWeight: '700' },
  ordenNsum: { fontSize: 12, fontWeight: '600', color: '#e0e7ff' },
  ordenDir: { fontSize: 11, color: '#a5b4fc' },
  ordenDesc: { fontSize: 10, color: '#818cf8', marginTop: 1 },
  empty: { alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 13, color: '#6366f1' },
});
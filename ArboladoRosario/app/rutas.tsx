import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';

type Prioridad = 'urgente' | 'alta' | 'media' | 'baja' | 'tormenta';

interface Reclamo {
  id?: string;
  nsum: string;
  direccion: string;
  descripcion: string;
  prioridad: Prioridad;
  estado: string;
  esTormenta: boolean;
}

const PRIORIDAD_COLORS: Record<Prioridad, string> = {
  urgente: '#E24B4A',
  alta: '#EF9F27',
  media: '#378ADD',
  baja: '#1D9E75',
  tormenta: '#6366f1',
};

const T_DICT = 7; // minutos por dictamen
const VEL = { auto: 30, bici: 12 };
const DIST_KM = { auto: 1.6, bici: 0.45 };

type Modo = 'auto' | 'bici';
type DistModo = 'urgentes' | 'jefe' | 'auto';

function minToH(m: number) {
  const h = Math.floor(m / 60), mn = Math.round(m % 60);
  return h === 0 ? mn + 'min' : mn === 0 ? h + 'h' : h + 'h ' + mn + 'min';
}

function fmt(m: number) {
  const h = Math.floor(m / 60) % 24, mn = Math.round(m % 60);
  return (h < 10 ? '0' : '') + h + ':' + (mn < 10 ? '0' : '') + mn;
}

export default function Rutas() {
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [rutaCalculada, setRutaCalculada] = useState(false);

  // Config
  const [modo] = useState<Modo>('auto');
  const [horas, setHoras] = useState(4);
  const [distModo, setDistModo] = useState<DistModo>('jefe');
  const [pcts, setPcts] = useState({ urgente: 10, alta: 20, media: 40, baja: 30 });

  // Resultado
  const [rutaCasos, setRutaCasos] = useState<Reclamo[]>([]);
  const [stats, setStats] = useState({ nCasos: 0, workMin: 0, distKm: 0, efic: 0 });

  useEffect(() => { cargarReclamos(); }, []);

  async function cargarReclamos() {
    setLoading(true);
    try {
      const q = query(collection(db, 'reclamos'), orderBy('fecha', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Reclamo)
        .filter(r => r.estado === 'pendiente' && !r.esTormenta);
      setReclamos(data);
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los reclamos');
    }
    setLoading(false);
  }

  function calcularDistribucion(n: number): Record<Prioridad, Reclamo[]> {
    const porPrioridad: Record<string, Reclamo[]> = {
      urgente: reclamos.filter(r => r.prioridad === 'urgente'),
      alta: reclamos.filter(r => r.prioridad === 'alta'),
      media: reclamos.filter(r => r.prioridad === 'media'),
      baja: reclamos.filter(r => r.prioridad === 'baja'),
    };

    if (distModo === 'urgentes') {
      const result: Reclamo[] = [];
      ['urgente', 'alta', 'media', 'baja'].forEach(p => {
        const needed = Math.min(n - result.length, porPrioridad[p].length);
        result.push(...porPrioridad[p].slice(0, needed));
      });
      return { urgente: result.filter(r => r.prioridad === 'urgente'), alta: result.filter(r => r.prioridad === 'alta'), media: result.filter(r => r.prioridad === 'media'), baja: result.filter(r => r.prioridad === 'baja'), tormenta: [] };
    }

    if (distModo === 'auto') {
      const porP = { urgente: Math.round(n * 0.25), alta: Math.round(n * 0.25), media: Math.round(n * 0.25), baja: 0 };
      porP.baja = Math.max(0, n - porP.urgente - porP.alta - porP.media);
      return {
        urgente: porPrioridad.urgente.slice(0, porP.urgente),
        alta: porPrioridad.alta.slice(0, porP.alta),
        media: porPrioridad.media.slice(0, porP.media),
        baja: porPrioridad.baja.slice(0, porP.baja),
        tormenta: [],
      };
    }

    // jefe
    const total = pcts.urgente + pcts.alta + pcts.media + pcts.baja;
    const asignados = {
      urgente: Math.min(Math.round(n * pcts.urgente / total), porPrioridad.urgente.length),
      alta: Math.min(Math.round(n * pcts.alta / total), porPrioridad.alta.length),
      media: Math.min(Math.round(n * pcts.media / total), porPrioridad.media.length),
      baja: Math.min(Math.round(n * pcts.baja / total), porPrioridad.baja.length),
    };
    return {
      urgente: porPrioridad.urgente.slice(0, asignados.urgente),
      alta: porPrioridad.alta.slice(0, asignados.alta),
      media: porPrioridad.media.slice(0, asignados.media),
      baja: porPrioridad.baja.slice(0, asignados.baja),
      tormenta: [],
    };
  }

  function calcularRuta() {
    setCalculando(true);
    setTimeout(() => {
      const d = DIST_KM[modo], v = VEL[modo];
      const tXc = T_DICT + (d / v * 60);
      const nCasos = Math.min(Math.floor(horas * 60 / tXc), reclamos.length);

      if (nCasos === 0) {
        Alert.alert('Sin reclamos', 'No hay reclamos pendientes para asignar');
        setCalculando(false);
        return;
      }

      const dist = calcularDistribucion(nCasos);
      const casosOrdenados = [
        ...dist.urgente,
        ...dist.alta,
        ...dist.media,
        ...dist.baja,
      ];

      const workMin = Math.round(casosOrdenados.length * tXc);
      const tTr = Math.round(casosOrdenados.length * d / v * 60);
      const tDi = casosOrdenados.length * T_DICT;
      const efic = Math.round(tDi / (tDi + tTr) * 100);

      setRutaCasos(casosOrdenados);
      setStats({ nCasos: casosOrdenados.length, workMin, distKm: casosOrdenados.length * d, efic });
      setRutaCalculada(true);
      setCalculando(false);
    }, 800);
  }

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#1D9E75" />
    </View>
  );

  if (rutaCalculada) return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>

      {/* MÉTRICAS */}
      <View style={styles.metricsRow}>
        {[
          { label: 'Dictámenes', value: stats.nCasos },
          { label: 'En campo', value: minToH(stats.workMin) },
          { label: 'Recorrido', value: stats.distKm.toFixed(1) + ' km' },
          { label: 'Eficiencia', value: stats.efic + '%' },
        ].map(m => (
          <View key={m.label} style={styles.metricCard}>
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* CRONOGRAMA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cronograma estimado</Text>
        <View style={styles.tlItem}>
          <View style={[styles.tlDot, { backgroundColor: '#0F6E56' }]} />
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
              <View style={[styles.tlDot, { backgroundColor: PRIORIDAD_COLORS[c.prioridad] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tlTime}>{fmt(hora)} — Caso {i + 1}</Text>
                <Text style={styles.tlDesc}>{c.direccion}</Text>
                <Text style={styles.tlSub}>SUA {c.nsum} · {c.prioridad}</Text>
              </View>
            </View>
          );
        })}
        <View style={styles.tlItem}>
          <View style={[styles.tlDot, { backgroundColor: '#0F6E56' }]} />
          <View>
            <Text style={styles.tlTime}>{fmt(8 * 60 + 5 + rutaCasos.length * (T_DICT + DIST_KM[modo] / VEL[modo] * 60) + 10)}</Text>
            <Text style={styles.tlDesc}>Regreso a Parques y Paseos</Text>
          </View>
        </View>
      </View>

      {/* ORDEN DE VISITAS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Orden de visitas</Text>
        {rutaCasos.map((c, i) => (
          <View key={c.id} style={styles.ordenItem}>
            <View style={[styles.ordenNum, { backgroundColor: PRIORIDAD_COLORS[c.prioridad] }]}>
              <Text style={styles.ordenNumText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ordenNsum}>SUA {c.nsum}</Text>
              <Text style={styles.ordenDir}>{c.direccion}</Text>
              <Text style={styles.ordenDesc}>{c.descripcion}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: PRIORIDAD_COLORS[c.prioridad] + '22' }]}>
              <Text style={[styles.badgeText, { color: PRIORIDAD_COLORS[c.prioridad] }]}>{c.prioridad}</Text>
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

      {/* STOCK */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reclamos disponibles</Text>
        <View style={styles.metricsRow}>
          {(['urgente', 'alta', 'media', 'baja'] as Prioridad[]).map(p => (
            <View key={p} style={styles.metricCard}>
              <Text style={[styles.metricValue, { color: PRIORIDAD_COLORS[p] }]}>
                {reclamos.filter(r => r.prioridad === p).length}
              </Text>
              <Text style={styles.metricLabel}>{p}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* HORAS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Horas disponibles: <Text style={{ color: '#1D9E75' }}>{horas}h</Text></Text>
        <View style={styles.horasRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
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
          ~{Math.min(Math.floor(horas * 60 / (T_DICT + DIST_KM[modo] / VEL[modo] * 60)), reclamos.length)} dictámenes posibles
        </Text>
      </View>

      {/* DISTRIBUCIÓN */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Distribución de prioridades</Text>
        <View style={styles.modoRow}>
          {([['urgentes', 'Urgentes primero'], ['jefe', 'Por el jefe'], ['auto', 'Automático']] as [DistModo, string][]).map(([v, label]) => (
            <TouchableOpacity
              key={v}
              style={[styles.distBtn, distModo === v && styles.distBtnActive]}
              onPress={() => setDistModo(v)}
            >
              <Text style={[styles.distBtnText, distModo === v && styles.distBtnTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {distModo === 'jefe' && (
          <View style={{ marginTop: 12 }}>
            {(['urgente', 'alta', 'media', 'baja'] as const).map(p => (
              <View key={p} style={styles.pctRow}>
                <View style={[styles.pctDot, { backgroundColor: PRIORIDAD_COLORS[p] }]} />
                <Text style={styles.pctLabel}>{p}</Text>
                <View style={styles.pctBtns}>
                  {[0, 10, 20, 30, 40, 50].map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.pctBtn, pcts[p] === v && { backgroundColor: PRIORIDAD_COLORS[p] }]}
                      onPress={() => setPcts(prev => ({ ...prev, [p]: v }))}
                    >
                      <Text style={[styles.pctBtnText, pcts[p] === v && { color: 'white' }]}>{v}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.btnCalcular, calculando && { opacity: 0.7 }]}
        onPress={calcularRuta}
        disabled={calculando}
      >
        {calculando
          ? <ActivityIndicator color="white" />
          : <Text style={styles.btnCalcularText}>Calcular ruta óptima →</Text>
        }
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#e5e5e5' },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 12 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, alignItems: 'center', padding: 8, backgroundColor: '#f9f9f9', borderRadius: 8 },
  metricValue: { fontSize: 18, fontWeight: '700', color: '#0F6E56' },
  metricLabel: { fontSize: 10, color: '#666', marginTop: 2 },
  modoRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modoBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e5e5', alignItems: 'center' },
  modoBtnActive: { backgroundColor: '#0F6E56', borderColor: '#0F6E56' },
  modoBtnText: { fontSize: 13, fontWeight: '500', color: '#666' },
  modoBtnTextActive: { color: 'white' },
  horasRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  horaBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e5e5' },
  horaBtnActive: { backgroundColor: '#0F6E56', borderColor: '#0F6E56' },
  horaBtnText: { fontSize: 13, color: '#666' },
  horaBtnTextActive: { color: 'white', fontWeight: '600' },
  horaEstimado: { fontSize: 12, color: '#1D9E75', fontWeight: '500' },
  distBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e5e5', marginBottom: 4 },
  distBtnActive: { backgroundColor: '#0F6E56', borderColor: '#0F6E56' },
  distBtnText: { fontSize: 12, color: '#666' },
  distBtnTextActive: { color: 'white', fontWeight: '600' },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  pctDot: { width: 10, height: 10, borderRadius: 5 },
  pctLabel: { fontSize: 12, color: '#444', minWidth: 50 },
  pctBtns: { flexDirection: 'row', gap: 4, flex: 1, flexWrap: 'wrap' },
  pctBtn: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#e5e5e5' },
  pctBtnText: { fontSize: 10, color: '#666' },
  btnCalcular: { backgroundColor: '#1D9E75', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  btnCalcularText: { color: 'white', fontSize: 16, fontWeight: '700' },
  btnSecundario: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e5e5', alignItems: 'center', marginBottom: 20, backgroundColor: 'white' },
  btnSecundarioText: { fontSize: 14, color: '#666', fontWeight: '500' },
  tlItem: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3, flexShrink: 0 },
  tlTime: { fontSize: 12, fontWeight: '600', color: '#111' },
  tlDesc: { fontSize: 11, color: '#666' },
  tlSub: { fontSize: 10, color: '#999' },
  ordenItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  ordenNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ordenNumText: { color: 'white', fontSize: 11, fontWeight: '700' },
  ordenNsum: { fontSize: 12, fontWeight: '600', color: '#111' },
  ordenDir: { fontSize: 11, color: '#666' },
  ordenDesc: { fontSize: 10, color: '#999', marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '600' },
});
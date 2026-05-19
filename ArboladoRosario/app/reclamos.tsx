import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

type Prioridad = 'urgente' | 'alta' | 'media' | 'baja' | 'tormenta';
type Estado = 'pendiente' | 'en_ruta' | 'resuelto';

interface Reclamo {
  id?: string;
  nsum: string;
  fecha: Timestamp;
  descripcion: string;
  direccion: string;
  prioridad: Prioridad;
  estado: Estado;
  esTormenta: boolean;
}

const PRIORIDAD_COLORS: Record<Prioridad, string> = {
  urgente: '#E24B4A',
  alta: '#EF9F27',
  media: '#378ADD',
  baja: '#1D9E75',
  tormenta: '#6366f1',
};

const ESTADO_LABELS: Record<Estado, string> = {
  pendiente: 'Pendiente',
  en_ruta: 'En ruta',
  resuelto: 'Resuelto',
};

export default function Reclamos() {
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [filtro, setFiltro] = useState<Prioridad | 'todos'>('todos');
  const [guardando, setGuardando] = useState(false);

  // Formulario nuevo reclamo
  const [nsum, setNsum] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [direccion, setDireccion] = useState('');
  const [prioridad, setPrioridad] = useState<Prioridad>('media');
  const [esTormenta, setEsTormenta] = useState(false);

  useEffect(() => {
    cargarReclamos();
  }, []);

  async function cargarReclamos() {
    setLoading(true);
    try {
      const q = query(collection(db, 'reclamos'), orderBy('fecha', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Reclamo[];
      setReclamos(data);
    } catch (e: any) {
      Alert.alert('Error', e?.message || JSON.stringify(e));
    }
    setLoading(false);
  }

  async function guardarReclamo() {
    if (!nsum.trim() || !descripcion.trim() || !direccion.trim()) {
      Alert.alert('Campos incompletos', 'NSUM, dirección y descripción son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      await addDoc(collection(db, 'reclamos'), {
        nsum: nsum.trim(),
        fecha: Timestamp.now(),
        descripcion: descripcion.trim(),
        direccion: direccion.trim(),
        prioridad: esTormenta ? 'tormenta' : prioridad,
        estado: 'pendiente',
        esTormenta,
      });
      setModalVisible(false);
      resetForm();
      cargarReclamos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el reclamo');
    }
    setGuardando(false);
  }

  function resetForm() {
    setNsum(''); setDescripcion(''); setDireccion('');
    setPrioridad('media'); setEsTormenta(false);
  }

  const reclamosFiltrados = filtro === 'todos'
    ? reclamos
    : reclamos.filter(r => r.prioridad === filtro);

  const contadores = {
    todos: reclamos.length,
    urgente: reclamos.filter(r => r.prioridad === 'urgente').length,
    tormenta: reclamos.filter(r => r.esTormenta).length,
    pendiente: reclamos.filter(r => r.estado === 'pendiente').length,
  };

  return (
    <View style={styles.container}>

      {/* MÉTRICAS */}
      <View style={styles.metricsRow}>
        {[
          { label: 'Total', value: contadores.todos, color: '#0F6E56' },
          { label: 'Urgentes', value: contadores.urgente, color: '#E24B4A' },
          { label: 'Tormenta', value: contadores.tormenta, color: '#6366f1' },
          { label: 'Pendientes', value: contadores.pendiente, color: '#EF9F27' },
        ].map(m => (
          <View key={m.label} style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* FILTROS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll}>
        {(['todos', 'urgente', 'alta', 'media', 'baja', 'tormenta'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filtroBtn, filtro === f && styles.filtroBtnActive]}
            onPress={() => setFiltro(f)}
          >
            <Text style={[styles.filtroText, filtro === f && styles.filtroTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* LISTA */}
      {loading ? (
        <ActivityIndicator size="large" color="#1D9E75" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={reclamosFiltrados}
          keyExtractor={item => item.id || ''}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No hay reclamos{filtro !== 'todos' ? ` de prioridad ${filtro}` : ''}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, item.esTormenta && styles.cardTormenta]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardLeft}>
                  <Text style={[styles.cardNsum, item.esTormenta && { color: '#e0e7ff' }]}>
                    {item.esTormenta ? '⛈ ' : ''}SUA {item.nsum}
                  </Text>
                  <Text style={[styles.cardDir, item.esTormenta && { color: '#a5b4fc' }]}>
                    📍 {item.direccion}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: PRIORIDAD_COLORS[item.prioridad] + '22' }]}>
                  <Text style={[styles.badgeText, { color: PRIORIDAD_COLORS[item.prioridad] }]}>
                    {item.prioridad}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cardDesc, item.esTormenta && { color: '#c7d2fe' }]}>
                {item.descripcion}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={[styles.cardEstado, item.esTormenta && { color: '#818cf8' }]}>
                  {ESTADO_LABELS[item.estado]}
                </Text>
                <Text style={[styles.cardFecha, item.esTormenta && { color: '#818cf8' }]}>
                  {item.fecha?.toDate().toLocaleDateString('es-AR')}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      {/* BOTÓN AGREGAR */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>

      {/* MODAL NUEVO RECLAMO */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nuevo reclamo</Text>
            <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>

            <Text style={styles.fieldLabel}>NSUM *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 2025-009201"
              value={nsum}
              onChangeText={setNsum}
              keyboardType="default"
            />

            <Text style={styles.fieldLabel}>Dirección *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Bv. Oroño 1240"
              value={direccion}
              onChangeText={setDireccion}
            />

            <Text style={styles.fieldLabel}>Descripción *</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Descripción del problema..."
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
            />

            <Text style={styles.fieldLabel}>Prioridad</Text>
            <View style={styles.prioridadGrid}>
              {(['urgente', 'alta', 'media', 'baja'] as Prioridad[]).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.prioBtn,
                    prioridad === p && { backgroundColor: PRIORIDAD_COLORS[p], borderColor: PRIORIDAD_COLORS[p] }
                  ]}
                  onPress={() => setPrioridad(p)}
                >
                  <Text style={[styles.prioBtnText, prioridad === p && { color: 'white' }]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.tormentaToggle, esTormenta && styles.tormentaToggleActive]}
              onPress={() => setEsTormenta(!esTormenta)}
            >
              <Text style={[styles.tormentaToggleText, esTormenta && { color: '#e0e7ff' }]}>
                ⛈ Urgencia por Tormenta {esTormenta ? '✓' : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardarReclamo}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="white" />
                : <Text style={styles.btnGuardarText}>Guardar reclamo</Text>
              }
            </TouchableOpacity>

          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  metricsRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: 'white', borderBottomWidth: 0.5, borderBottomColor: '#e5e5e5' },
  metricCard: { flex: 1, alignItems: 'center', padding: 8, backgroundColor: '#f9f9f9', borderRadius: 8 },
  metricValue: { fontSize: 20, fontWeight: '700' },
  metricLabel: { fontSize: 10, color: '#666', marginTop: 2 },
  filtrosScroll: { backgroundColor: 'white', borderBottomWidth: 0.5, borderBottomColor: '#e5e5e5', paddingVertical: 8, paddingHorizontal: 12, maxHeight: 50 },
  filtroBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#e5e5e5', marginRight: 8, backgroundColor: 'white' },
  filtroBtnActive: { backgroundColor: '#0F6E56', borderColor: '#0F6E56' },
  filtroText: { fontSize: 12, color: '#666' },
  filtroTextActive: { color: 'white', fontWeight: '600' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: '#e5e5e5' },
  cardTormenta: { backgroundColor: '#1e1b4b', borderColor: '#4338ca' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardLeft: { flex: 1 },
  cardNsum: { fontSize: 13, fontWeight: '600', color: '#111' },
  cardDir: { fontSize: 12, color: '#666', marginTop: 2 },
  cardDesc: { fontSize: 12, color: '#444', marginBottom: 8, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardEstado: { fontSize: 11, color: '#1D9E75', fontWeight: '500' },
  cardFecha: { fontSize: 11, color: '#999' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginLeft: 8 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1D9E75', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#999' },
  modalContainer: { flex: 1, backgroundColor: 'white' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#e5e5e5' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  modalBody: { padding: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, fontSize: 14, color: '#111', backgroundColor: '#fafafa' },
  prioridadGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  prioBtn: { flex: 1, minWidth: '45%', padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e5e5', alignItems: 'center' },
  prioBtnText: { fontSize: 13, fontWeight: '500', color: '#666' },
  tormentaToggle: { marginTop: 16, padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#4338ca', alignItems: 'center', backgroundColor: 'transparent' },
  tormentaToggleActive: { backgroundColor: '#1e1b4b', borderColor: '#6366f1' },
  tormentaToggleText: { fontSize: 14, fontWeight: '600', color: '#4338ca' },
  btnGuardar: { marginTop: 24, marginBottom: 40, backgroundColor: '#1D9E75', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnGuardarText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
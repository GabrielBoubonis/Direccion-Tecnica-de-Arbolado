import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator
} from 'react-native';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

type Prioridad = 'Alto' | 'Medio' | 'Bajo' | '';
type Complejidad = 'Baja' | 'Media' | 'Alta' | 'Máxima' | '';

const DISTRITOS = ['Centro', 'Noroeste', 'Norte', 'Oeste', 'Sudoeste', 'Sur'];

const EXTRACCION_OPTS = [
  '1 – Árbol muerto',
  '2 – Con riesgo de caída por ahuecamiento',
  '3 – Con riesgo de caída por inclinación',
  '4 – Afectado por enfermedad incurable',
  '5 – Con pronunciado desequilibrio estructural',
  '6 – En precario estado vegetativo',
  '7 – No es posible implementar solución técnica',
  '8 – Por daño intencional irreversible',
  '9 – Obra pública',
  '10 – Especie no apta para el lugar implantado',
  '11 – Cepa verde',
  '12 – Cepa muerta',
];

const SUBTERRANEA_OPTS = [
  '1 – Corte vertical de raíces',
  '2 – Corte horizontal de raíces',
  '3 – Agrandamiento de cazuela',
];

const AEREA_OPTS = [
  '1 – Poda de formación',
  '2 – Liberación de conductores eléctricos',
  '3 – Liberación de tránsito peatonal',
  '4 – Liberación de tránsito vehicular',
  '5 – Despeje de espacio aéreo privado',
  '6 – Despeje de luminarias',
  '7 – Equilibrio del ejemplar',
  '8 – Raleo y limpieza',
  '9 – Elevación de copa',
  '10 – Reducción de altura de copa',
  '11 – Reducción volumétrica',
  '12 – Eliminación de ramas peligrosas',
];

const SINTRABAJO_OPTS = [
  '1 – Ejemplar extraído',
  '2 – Trabajos realizados en ramas y raíces',
  '3 – El/los ejemplar/es no ocasionan problemas visibles',
  '4 – El domicilio no existe',
  '5 – Ejemplar/es en propiedad privada',
  '6 – En el domicilio no existe arbolado público',
];

const PLANTAR_OPTS = ['Cazuela', 'Construir cazuela', 'Vereda jardín'];

export default function Dictamen() {
  const [guardando, setGuardando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  // Identificación
  const [nsum, setNsum] = useState('');
  const [notaN, setNotaN] = useState('');
  const [expN, setExpN] = useState('');
  const [suaN, setSuaN] = useState('');
  const [distrito, setDistrito] = useState('');

  // Domicilios
  const [calleSolicitud, setCalleSolicitud] = useState('');
  const [numSolicitud, setNumSolicitud] = useState('');
  const [calleEjemplar, setCalleEjemplar] = useState('');
  const [numEjemplar, setNumEjemplar] = useState('');
  const [refUbicacion, setRefUbicacion] = useState('');
  const [especie, setEspecie] = useState('');
  const [distMed, setDistMed] = useState('');
  const [cantFrente, setCantFrente] = useState('');

  // Secciones
  const [danoVereda, setDanoVereda] = useState<Prioridad>('');
  const [extraccion, setExtraccion] = useState<string[]>([]);
  const [perimetro, setPerimetro] = useState('');
  const [subterranea, setSubterranea] = useState<string[]>([]);
  const [distRaices, setDistRaices] = useState('');
  const [aerea, setAerea] = useState<string[]>([]);
  const [sinTrabajo, setSinTrabajo] = useState<string[]>([]);

  // Info adicional
  const [complejidad, setComplejidad] = useState<Complejidad>('');
  const [urgente, setUrgente] = useState(false);
  const [frenteGarage, setFrenteGarage] = useState(false);
  const [mediaTension, setMediaTension] = useState(false);
  const [deOficio, setDeOficio] = useState(false);
  const [plantar, setPlantar] = useState<string[]>([]);
  const [observaciones, setObservaciones] = useState('');

  // Técnico
  const [tecnico, setTecnico] = useState('');
  const [legajo, setLegajo] = useState('');

  function toggleItem(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  }

  function resetForm() {
    setNsum(''); setNotaN(''); setExpN(''); setSuaN(''); setDistrito('');
    setCalleSolicitud(''); setNumSolicitud(''); setCalleEjemplar('');
    setNumEjemplar(''); setRefUbicacion(''); setEspecie('');
    setDistMed(''); setCantFrente(''); setDanoVereda('');
    setExtraccion([]); setPerimetro(''); setSubterranea([]);
    setDistRaices(''); setAerea([]); setSinTrabajo([]);
    setComplejidad(''); setUrgente(false); setFrenteGarage(false);
    setMediaTension(false); setDeOficio(false); setPlantar([]);
    setObservaciones(''); setTecnico(''); setLegajo('');
  }

  async function guardarDictamen() {
    if (!nsum.trim() || !especie.trim() || !tecnico.trim() || !distrito) {
      Alert.alert('Campos incompletos', 'NSUM, distrito, especie y técnico son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      await addDoc(collection(db, 'dictamenes'), {
        nsum: nsum.trim(),
        notaN: notaN.trim(),
        expN: expN.trim(),
        suaN: suaN.trim(),
        distrito,
        calleSolicitud: calleSolicitud.trim(),
        numSolicitud: numSolicitud.trim(),
        calleEjemplar: calleEjemplar.trim(),
        numEjemplar: numEjemplar.trim(),
        refUbicacion: refUbicacion.trim(),
        especie: especie.trim(),
        distMed: distMed.trim(),
        cantFrente: cantFrente.trim(),
        danoVereda,
        extraccion,
        perimetro: perimetro.trim(),
        subterranea,
        distRaices: distRaices.trim(),
        aerea,
        sinTrabajo,
        complejidad,
        urgente,
        frenteGarage,
        mediaTension,
        deOficio,
        plantar,
        observaciones: observaciones.trim(),
        tecnico: tecnico.trim(),
        legajo: legajo.trim(),
        fecha: Timestamp.now(),
      });
      setEnviado(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar el dictamen');
    }
    setGuardando(false);
  }

  if (enviado) return (
    <View style={styles.successContainer}>
      <Text style={styles.successIcon}>🌳</Text>
      <Text style={styles.successTitle}>Dictamen enviado</Text>
      <Text style={styles.successSub}>El dictamen fue guardado correctamente en la base de datos</Text>
      <TouchableOpacity style={styles.btnNuevo} onPress={() => { resetForm(); setEnviado(false); }}>
        <Text style={styles.btnNuevoText}>+ Nuevo dictamen</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 120 }}>

      {/* IDENTIFICACIÓN */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 Identificación</Text>

        <Text style={styles.label}>NSUM *</Text>
        <TextInput style={styles.input} placeholder="Ej: 2025-009201" value={nsum} onChangeText={setNsum} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Nota N°</Text>
            <TextInput style={styles.input} placeholder="12345" value={notaN} onChangeText={setNotaN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>EXP N°</Text>
            <TextInput style={styles.input} placeholder="67890" value={expN} onChangeText={setExpN} />
          </View>
        </View>

        <Text style={styles.label}>Distrito *</Text>
        <View style={styles.opcionesGrid}>
          {DISTRITOS.map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.opcionBtn, distrito === d && styles.opcionBtnActive]}
              onPress={() => setDistrito(d)}
            >
              <Text style={[styles.opcionText, distrito === d && styles.opcionTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* DOMICILIOS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📍 Domicilios</Text>

        <Text style={styles.label}>Calle solicitud *</Text>
        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <TextInput style={styles.input} placeholder="Nombre de la calle" value={calleSolicitud} onChangeText={setCalleSolicitud} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput style={styles.input} placeholder="Número" value={numSolicitud} onChangeText={setNumSolicitud} keyboardType="numeric" />
          </View>
        </View>

        <Text style={styles.label}>Calle del ejemplar *</Text>
        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <TextInput style={styles.input} placeholder="Nombre de la calle" value={calleEjemplar} onChangeText={setCalleEjemplar} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput style={styles.input} placeholder="Número" value={numEjemplar} onChangeText={setNumEjemplar} keyboardType="numeric" />
          </View>
        </View>

        <Text style={styles.label}>Referencia de ubicación</Text>
        <TextInput style={styles.input} placeholder="Ej: Frente a plaza, entre dos postes..." value={refUbicacion} onChangeText={setRefUbicacion} />

        <Text style={styles.label}>Especie *</Text>
        <TextInput style={styles.input} placeholder="Nombre de la especie arbórea" value={especie} onChangeText={setEspecie} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Dist. Med/Ref (m)</Text>
            <TextInput style={styles.input} placeholder="Ej: 2.5" value={distMed} onChangeText={setDistMed} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Cantidad frente</Text>
            <TextInput style={styles.input} placeholder="Ej: 3" value={cantFrente} onChangeText={setCantFrente} keyboardType="numeric" />
          </View>
        </View>
      </View>

      {/* 1 - DAÑO EN VEREDA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1 — Daño en vereda</Text>
        <View style={styles.opcionesRow}>
          {(['Alto', 'Medio', 'Bajo'] as Prioridad[]).map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.danoBtn, danoVereda === d && styles.danoBtnActive(d)]}
              onPress={() => setDanoVereda(d)}
            >
              <Text style={styles.danoIcon}>{d === 'Alto' ? '🔴' : d === 'Medio' ? '🟡' : '🟢'}</Text>
              <Text style={[styles.danoText, danoVereda === d && { color: 'white' }]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 2 - EXTRACCIÓN */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>2 — Extracción</Text>
        <Text style={styles.label}>Perímetro (m)</Text>
        <TextInput style={styles.input} placeholder="Ej: 1.20" value={perimetro} onChangeText={setPerimetro} keyboardType="decimal-pad" />
        {EXTRACCION_OPTS.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.checkItem, extraccion.includes(opt) && styles.checkItemActive]}
            onPress={() => toggleItem(extraccion, setExtraccion, opt)}
          >
            <View style={[styles.checkBox, extraccion.includes(opt) && styles.checkBoxActive]}>
              {extraccion.includes(opt) && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 3 - SUBTERRÁNEA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>3 — Trabajos subterráneos</Text>
        {SUBTERRANEA_OPTS.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.checkItem, subterranea.includes(opt) && styles.checkItemActive]}
            onPress={() => toggleItem(subterranea, setSubterranea, opt)}
          >
            <View style={[styles.checkBox, subterranea.includes(opt) && styles.checkBoxActive]}>
              {subterranea.includes(opt) && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>{opt}</Text>
          </TouchableOpacity>
        ))}
        {subterranea.includes('1 – Corte vertical de raíces') && (
          <>
            <Text style={styles.label}>Distancia al borde del árbol (m)</Text>
            <TextInput style={styles.input} placeholder="Ej: 0.80" value={distRaices} onChangeText={setDistRaices} keyboardType="decimal-pad" />
          </>
        )}
      </View>

      {/* 4 - AÉREA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>4 — Trabajos aéreos</Text>
        {AEREA_OPTS.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.checkItem, aerea.includes(opt) && styles.checkItemActive]}
            onPress={() => toggleItem(aerea, setAerea, opt)}
          >
            <View style={[styles.checkBox, aerea.includes(opt) && styles.checkBoxActive]}>
              {aerea.includes(opt) && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 5 - SIN TRABAJO */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>5 — Sin trabajo</Text>
        {SINTRABAJO_OPTS.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.checkItem, sinTrabajo.includes(opt) && styles.checkItemActive]}
            onPress={() => toggleItem(sinTrabajo, setSinTrabajo, opt)}
          >
            <View style={[styles.checkBox, sinTrabajo.includes(opt) && styles.checkBoxActive]}>
              {sinTrabajo.includes(opt) && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* INFO ADICIONAL */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚙️ Información adicional</Text>

        <Text style={styles.label}>Complejidad</Text>
        <View style={styles.opcionesGrid}>
          {(['Baja', 'Media', 'Alta', 'Máxima'] as Complejidad[]).map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.opcionBtn, complejidad === c && styles.opcionBtnActive]}
              onPress={() => setComplejidad(c)}
            >
              <Text style={[styles.opcionText, complejidad === c && styles.opcionTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Flags</Text>
        <View style={styles.flagsGrid}>
          {[
            { label: '🚨 Urgente', val: urgente, set: setUrgente },
            { label: '🚗 Frente a garage', val: frenteGarage, set: setFrenteGarage },
            { label: '⚡ Media tensión', val: mediaTension, set: setMediaTension },
            { label: '📄 De oficio', val: deOficio, set: setDeOficio },
          ].map(f => (
            <TouchableOpacity
              key={f.label}
              style={[styles.flagBtn, f.val && styles.flagBtnActive]}
              onPress={() => f.set(!f.val)}
            >
              <Text style={[styles.flagText, f.val && styles.flagTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Plantar</Text>
        <View style={styles.opcionesRow}>
          {PLANTAR_OPTS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.opcionBtn, plantar.includes(opt) && styles.opcionBtnActive]}
              onPress={() => toggleItem(plantar, setPlantar, opt)}
            >
              <Text style={[styles.opcionText, plantar.includes(opt) && styles.opcionTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* OBSERVACIONES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📝 Observaciones</Text>
        <TextInput
          style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
          placeholder="Descripción del estado del árbol, condiciones especiales..."
          value={observaciones}
          onChangeText={setObservaciones}
          multiline
        />
      </View>

      {/* TÉCNICO */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>✍️ Técnico firmante</Text>
        <Text style={styles.label}>Nombre y apellido *</Text>
        <TextInput style={styles.input} placeholder="Ing. Juan García" value={tecnico} onChangeText={setTecnico} />
        <Text style={styles.label}>Legajo / Matrícula</Text>
        <TextInput style={styles.input} placeholder="Ej: 8842-A" value={legajo} onChangeText={setLegajo} />
      </View>

      {/* BOTÓN ENVIAR */}
      <TouchableOpacity
        style={[styles.btnEnviar, guardando && { opacity: 0.6 }]}
        onPress={guardarDictamen}
        disabled={guardando}
      >
        {guardando
          ? <ActivityIndicator color="white" />
          : <Text style={styles.btnEnviarText}>Enviar dictamen 📤</Text>
        }
      </TouchableOpacity>

    </ScrollView>
  );
}

const DANO_COLORS: Record<string, string> = {
  Alto: '#E24B4A', Medio: '#EF9F27', Bajo: '#1D9E75'
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#e5e5e5' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fafafa', marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  opcionesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  opcionesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  opcionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e5e5', backgroundColor: 'white' },
  opcionBtnActive: { backgroundColor: '#0F6E56', borderColor: '#0F6E56' },
  opcionText: { fontSize: 13, color: '#666', fontWeight: '500' },
  opcionTextActive: { color: 'white' },
  danoBtn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e5e5' },
  danoBtnActive: (d: string) => ({ backgroundColor: DANO_COLORS[d], borderColor: DANO_COLORS[d] }),
  danoIcon: { fontSize: 22, marginBottom: 4 },
  danoText: { fontSize: 12, fontWeight: '600', color: '#666' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e5e5', marginBottom: 6 },
  checkItemActive: { borderColor: '#1D9E75', backgroundColor: '#f0faf5' },
  checkBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: '#1D9E75', borderColor: '#1D9E75' },
  checkMark: { color: 'white', fontSize: 11, fontWeight: '700' },
  checkLabel: { fontSize: 13, color: '#333', flex: 1 },
  flagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  flagBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e5e5' },
  flagBtnActive: { backgroundColor: '#0F6E56', borderColor: '#0F6E56' },
  flagText: { fontSize: 12, color: '#666', fontWeight: '500' },
  flagTextActive: { color: 'white' },
  btnEnviar: { backgroundColor: '#0F6E56', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  btnEnviarText: { color: 'white', fontSize: 16, fontWeight: '700' },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: 'white' },
  successIcon: { fontSize: 60, marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#0F6E56', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  btnNuevo: { backgroundColor: '#0F6E56', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  btnNuevoText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
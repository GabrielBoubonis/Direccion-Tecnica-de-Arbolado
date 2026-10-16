// Rutas de la interfaz. Sin sesión: ingreso (01), captor bloqueado (01b) o reanudar sin señal (01c).
// Con sesión: el marco con las pantallas del rol; los permisos los controla además el servidor.
import { Navigate, Route, Routes } from 'react-router-dom';
import { Estructura, ITEMS } from './componentes/Estructura';
import { Aviso, Modal } from './componentes/ui';
import { useConexion } from './offline/conexion';
import {
  useAvisoSesionFinalizada,
  useBloqueoLocal,
  useCierrePorInactividad,
  useClaveAbierta,
  useMotorDelCaptor,
  useSesion,
} from './estado/sesion';
import { Auditoria } from './paginas/Auditoria';
import { CaptorBloqueado } from './paginas/CaptorBloqueado';
import { Conflicto } from './paginas/Conflicto';
import { Dashboard } from './paginas/Dashboard';
import { DetalleDictamen } from './paginas/DetalleDictamen';
import { DetalleSolicitud } from './paginas/DetalleSolicitud';
import { FormularioDictamen } from './paginas/FormularioDictamen';
import { Ingresar } from './paginas/Ingresar';
import { ParaRevisar } from './paginas/ParaRevisar';
import { Perfil } from './paginas/Perfil';
import { ReanudarSinSenal } from './paginas/ReanudarSinSenal';
import { Rutas } from './paginas/Rutas';
import { Simulador } from './paginas/Simulador';
import { Solicitudes } from './paginas/Solicitudes';
import { Tormenta } from './paginas/Tormenta';
import { Usuarios } from './paginas/Usuarios';

export function App() {
  const sesion = useSesion();
  const conexion = useConexion();
  const claveAbierta = useClaveAbierta();
  const bloqueo = useBloqueoLocal();
  const cierre = useCierrePorInactividad(!!sesion);
  const [finalizada, cerrarAviso] = useAvisoSesionFinalizada();
  useMotorDelCaptor(!!sesion);

  const avisoFinalizada = finalizada && (
    <Modal titulo="Sesión finalizada" onCerrar={cerrarAviso}>
      <p className="texto-modal">{finalizada}</p>
      <div className="acciones-modal">
        <button className="boton" onClick={cerrarAviso}>
          Entendido
        </button>
      </div>
    </Modal>
  );

  if (bloqueo === null) return null;
  if (bloqueo.bloqueado && !sesion) return <CaptorBloqueado codigo={bloqueo.codigoVisible} />;

  if (!sesion)
    return (
      <>
        {avisoFinalizada}
        {!conexion ? (
          <ReanudarSinSenal motivo={cierre === 'inactividad-sin-senal' ? 'inactividad' : 'sin-senal'} />
        ) : (
          <Ingresar>{cierre && <Aviso tipo="advertencia" titulo="Tu sesión se cerró por inactividad">Pasaron 30 minutos sin actividad. Volvé a ingresar.</Aviso>}</Ingresar>
        )}
      </>
    );

  // La página se recargó sin señal: los datos del captor siguen cifrados hasta ingresar la contraseña.
  if (!conexion && !claveAbierta) return <ReanudarSinSenal motivo="recarga" />;

  const inicio = ITEMS[sesion.menu.inicio]?.ruta ?? '/perfil';
  return (
    <>
      {avisoFinalizada}
      <Routes>
        <Route element={<Estructura />}>
          <Route path="/solicitudes" element={<Solicitudes />} />
          <Route path="/solicitudes/:numero/:anio" element={<DetalleSolicitud />} />
          <Route path="/solicitudes/:numero/:anio/conflicto" element={<Conflicto />} />
          <Route path="/dictaminar/:numero/:anio" element={<FormularioDictamen />} />
          <Route path="/dictamenes/:id" element={<DetalleDictamen />} />
          <Route path="/rutas" element={<Rutas />} />
          <Route path="/tormenta" element={<Tormenta />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/usuarios/captores" element={<Usuarios seccion="captores" />} />
          <Route path="/para-revisar" element={<ParaRevisar />} />
          <Route path="/auditoria" element={<Auditoria />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/simulador" element={<Simulador />} />
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Route>
      </Routes>
    </>
  );
}

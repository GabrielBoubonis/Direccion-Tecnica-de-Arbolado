// Mapas con Leaflet sobre OpenStreetMap. Se usan marcadores circulares para no depender de imágenes.
import { useEffect, type ReactNode } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

export const CENTRO_ROSARIO: [number, number] = [-32.9468, -60.6393];

export const COLOR_PRIORIDAD: Record<string, string> = { Alta: '#dc2626', Media: '#d97706', Baja: '#16a34a', Tormenta: '#6366f1' };

export interface PuntoMapa {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  etiqueta?: string;
  numero?: number;
  apagado?: boolean;
}

function Encuadre({ puntos }: { puntos: [number, number][] }) {
  const mapa = useMap();
  const clave = puntos.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (puntos.length === 1) mapa.setView(puntos[0], 16);
    else if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, mapa]);
  return null;
}

function Clics({ alHacerClic }: { alHacerClic: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => alHacerClic(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function Mapa({
  puntos = [],
  sede,
  trazado,
  zona,
  alHacerClic,
  alto,
  encuadrar = true,
  children,
}: {
  puntos?: PuntoMapa[];
  sede?: { lat: number; lng: number; direccion?: string };
  trazado?: [number, number][] | null;
  zona?: { lat: number; lng: number }[];
  alHacerClic?: (lat: number, lng: number) => void;
  alto?: boolean;
  encuadrar?: boolean;
  children?: ReactNode;
}) {
  const encuadre: [number, number][] = [...puntos.map((p) => [p.lat, p.lng] as [number, number]), ...(sede ? [[sede.lat, sede.lng] as [number, number]] : [])];
  return (
    <div className={`mapa${alto ? ' alto' : ''}`}>
      <MapContainer center={CENTRO_ROSARIO} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {encuadrar && <Encuadre puntos={encuadre} />}
        {alHacerClic && <Clics alHacerClic={alHacerClic} />}
        {zona && zona.length > 1 && <Polygon positions={zona.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#0f6e56', fillOpacity: 0.12, dashArray: '6 6' }} />}
        {trazado && trazado.length > 1 && <Polyline positions={trazado} pathOptions={{ color: '#0f6e56', weight: 4, opacity: 0.8 }} />}
        {sede && (
          <CircleMarker center={[sede.lat, sede.lng]} radius={10} pathOptions={{ color: '#0f172a', fillColor: '#0f6e56', fillOpacity: 1, weight: 3 }}>
            <Tooltip direction="top">Sede de Parques y Paseos{sede.direccion ? ` · ${sede.direccion}` : ''}</Tooltip>
          </CircleMarker>
        )}
        {puntos.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.numero ? 11 : 7}
            pathOptions={{ color: '#fff', weight: 2, fillColor: p.color ?? '#0f6e56', fillOpacity: p.apagado ? 0.35 : 0.95 }}
          >
            {p.numero != null && (
              <Tooltip permanent direction="center" className="numero-parada">
                {p.numero}
              </Tooltip>
            )}
            {p.etiqueta && p.numero == null && <Tooltip direction="top">{p.etiqueta}</Tooltip>}
          </CircleMarker>
        ))}
        {children}
      </MapContainer>
    </div>
  );
}

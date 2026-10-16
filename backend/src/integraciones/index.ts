// Composición: qué adaptador concreto atiende cada puerto.
import { configuracion } from '../compartido/configuracion';
import { almacenEnBase } from './almacen-fotos';
import { mapasDePrueba } from './mapas-de-prueba';
import { crearOpenRouteService, mapasNoConfigurados } from './openrouteservice';
import type { AlmacenFotos, ProveedorAutenticacion, ProveedorReclamos, ServicioMapas } from './puertos';
import { autenticacionSimulada, suaSimulado } from './simulacion';

export const autenticacionInstitucional: ProveedorAutenticacion = autenticacionSimulada;
export const sua: ProveedorReclamos = suaSimulado;
/**
 * OpenRouteService si hay clave. Sin clave (o con MAPAS=prueba, como en las pruebas automáticas)
 * se usa el servicio de mapas de prueba; con MAPAS=ninguno, el sistema funciona sin mapas.
 */
export const mapas: ServicioMapas =
  configuracion.mapas === 'ninguno'
    ? mapasNoConfigurados
    : configuracion.mapas === 'prueba' || !configuracion.orsClave
      ? mapasDePrueba
      : crearOpenRouteService(configuracion.orsClave);
export const nombreServicioMapas = mapas === mapasDePrueba ? 'prueba' : mapas === mapasNoConfigurados ? 'ninguno' : 'openrouteservice';
export const fotos: AlmacenFotos = almacenEnBase;

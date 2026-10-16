// Aplicación Express: cabeceras de seguridad, rutas de cada módulo y manejo central de errores.
import express from 'express';
import helmet from 'helmet';
import { manejadorDeErrores } from './compartido/errores';
import { rutasAuditoria } from './modulos/auditoria';
import { rutasAutenticacion } from './modulos/autenticacion';
import { rutasConsultas } from './modulos/consultas';
import { rutasDictamenes } from './modulos/dictamenes';
import { rutasRutas, rutasTormenta } from './modulos/rutas';
import { rutasSimulador } from './modulos/simulador';
import { rutasSolicitudes } from './modulos/solicitudes';
import { rutasCaptores, rutasUsuarios } from './modulos/usuarios';

export function crearApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // RNF-21: CSP, HSTS y X-Frame-Options en todas las respuestas.
  app.use(helmet({ frameguard: { action: 'deny' }, hsts: { maxAge: 31_536_000, includeSubDomains: true } }));
  app.use(express.json({ limit: '4mb' }));

  const api = express.Router();
  api.get('/salud', (_req, res) => {
    res.json({ ok: true });
  });
  for (const r of [
    rutasAutenticacion,
    rutasUsuarios,
    rutasCaptores,
    rutasSolicitudes,
    rutasRutas,
    rutasTormenta,
    rutasDictamenes,
    rutasConsultas,
    rutasAuditoria,
    rutasSimulador,
  ])
    api.use(r);
  api.use((_req, res) => {
    res.status(404).json({ codigo: 'NO_ENCONTRADO', mensaje: 'Recurso inexistente.' });
  });

  app.use('/api', api);
  app.use(manejadorDeErrores);
  return app;
}

export default crearApp();

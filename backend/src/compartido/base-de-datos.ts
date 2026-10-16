// Cliente único de la base de datos (una instancia por proceso, reutilizada entre invocaciones).
import { PrismaClient } from '@prisma/client';
import { conEsquema } from './configuracion';

const global = globalThis as unknown as { prisma?: PrismaClient };

export const db = global.prisma ?? new PrismaClient({ datasourceUrl: conEsquema(process.env.DATABASE_URL) });
global.prisma = db;

export type Transaccion = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

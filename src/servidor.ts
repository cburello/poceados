import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';

import { JUEGOS, getJuego } from './config/juegos.ts';
import { controlarJugada, validarJugada, type Jugada, type Sorteo } from './dominio/control.ts';
import { iniciarProgramador } from './ingesta/programador.ts';
import { guardarSorteo } from './ingesta/ingestar.ts';
import { parsearExtracto } from './proveedores/santafe.ts';

const prisma = new PrismaClient();
const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } });

await app.register(cors, { origin: true });

/** Arma el Sorteo de dominio a partir de las filas de la base. */
function aDominio(fila: any): Sorteo {
  return {
    juegoCodigo: fila.juegoCodigo,
    nroConcurso: fila.nroConcurso,
    fecha: fila.fecha.toISOString().slice(0, 10),
    resultados: fila.resultados.map((r: any) => ({
      modalidadCodigo: r.modalidadCodigo,
      numeros: r.numeros,
      plus: r.plus ?? undefined,
      nivelGanador: r.nivelGanador,
      escalones: r.escalones
        .filter((e: any) => e.aciertos !== null)
        .map((e: any) => ({
          aciertos: e.aciertos,
          ganadores: e.ganadores,
          premioUnitario: e.premioUnitario,
          vacante: e.vacante,
        })),
    })),
  };
}

// --- Catálogo -------------------------------------------------------------
// La PWA lo baja una vez y lo cachea. Le sirve para armar la grilla de
// números y la lista de modalidades sin hardcodear nada.

app.get('/juegos', async () => ({
  juegos: Object.values(JUEGOS).map((j) => ({
    codigo: j.codigo,
    nombre: j.nombre,
    rangoMin: j.rangoMin,
    rangoMax: j.rangoMax,
    cantidadNumeros: j.cantidadNumeros,
    diasSorteo: j.diasSorteo,
    horaSorteo: j.horaSorteo,
    plus: j.plus,
    verificado: j.verificado,
    modalidades: j.modalidades,
  })),
}));

// --- Sorteos --------------------------------------------------------------

app.get<{ Querystring: { juego?: string; limite?: string } }>(
  '/sorteos',
  async (req) => {
    const filas = await prisma.sorteo.findMany({
      where: req.query.juego ? { juegoCodigo: req.query.juego } : undefined,
      orderBy: { fecha: 'desc' },
      take: Math.min(Number.parseInt(req.query.limite ?? '20', 10), 100),
      include: { resultados: { include: { escalones: true } } },
    });
    return { sorteos: filas.map(aDominio) };
  },
);

app.get<{ Params: { juego: string; nro: string } }>(
  '/sorteos/:juego/:nro',
  async (req, reply) => {
    const fila = await prisma.sorteo.findUnique({
      where: {
        juegoCodigo_nroConcurso: {
          juegoCodigo: req.params.juego,
          nroConcurso: Number.parseInt(req.params.nro, 10),
        },
      },
      include: { resultados: { include: { escalones: true } } },
    });
    if (!fila) return reply.code(404).send({ error: 'No tenemos ese concurso' });
    if (fila.estado === 'DISCREPANCIA') {
      return reply.code(409).send({
        error: 'Las fuentes no coinciden para este concurso. No lo publicamos.',
        estado: fila.estado,
      });
    }
    return { ...aDominio(fila), estado: fila.estado, urlExtracto: fila.urlExtracto };
  },
);

// --- Control --------------------------------------------------------------
// La PWA también puede controlar sola con el mismo módulo de dominio, así
// funciona sin conexión. Este endpoint es para clientes que no quieran
// embeber la lógica.

app.post<{ Body: { jugada: Jugada; nroConcurso?: number } }>(
  '/control',
  async (req, reply) => {
    const { jugada, nroConcurso } = req.body;

    const errores = validarJugada(jugada);
    if (errores.length) return reply.code(400).send({ errores });

    const fila = await prisma.sorteo.findFirst({
      where: {
        juegoCodigo: jugada.juegoCodigo,
        ...(nroConcurso ? { nroConcurso } : { estado: { in: ['CONFIRMADO', 'PARCIAL'] } }),
      },
      orderBy: { fecha: 'desc' },
      include: { resultados: { include: { escalones: true } } },
    });
    if (!fila) return reply.code(404).send({ error: 'Todavía no hay sorteo para controlar' });

    return controlarJugada(jugada, aDominio(fila));
  },
);

// --- Ingesta manual (bookmarklet) ------------------------------------------
// Lotería Santa Fe bloquea las conexiones salientes desde Railway. Como
// paliativo, el bookmarklet de Ajustes manda el HTML de la página ya
// cargada en el celular (que nunca está bloqueado, es tráfico normal de
// navegador) y acá lo procesamos con el mismo parser de siempre.

app.post<{ Body: { juegoCodigo: string; html: string } }>(
  '/ingesta/relay',
  async (req, reply) => {
    const token = req.headers['x-ingesta-token'];
    if (!process.env.INGESTA_TOKEN || token !== process.env.INGESTA_TOKEN) {
      // TEMPORAL: diagnóstico para ver por qué no matchea, sin exponer el valor real.
      return reply.code(401).send({
        error: 'Token inválido',
        diag: {
          hayEnv: !!process.env.INGESTA_TOKEN,
          largoEnv: process.env.INGESTA_TOKEN?.length ?? 0,
          largoRecibido: typeof token === 'string' ? token.length : null,
          tipoRecibido: typeof token,
          totalVarsEnv: Object.keys(process.env).length,
          clavesParecidas: Object.keys(process.env).filter((k) =>
            k.toUpperCase().includes('INGESTA'),
          ),
          tieneDatabaseUrl: !!process.env.DATABASE_URL,
        },
      });
    }

    const { juegoCodigo, html } = req.body;
    if (!juegoCodigo || !html) {
      return reply.code(400).send({ error: 'Falta juegoCodigo o html' });
    }

    try {
      const sorteo = parsearExtracto(html, juegoCodigo, 6);
      await guardarSorteo(prisma, juegoCodigo, sorteo, 'PARCIAL', 'SANTAFE_WEB');
      return {
        ok: true,
        nroConcurso: sorteo.nroConcurso,
        fecha: sorteo.fecha,
        modalidades: sorteo.resultados.map((r) => r.modalidadCodigo),
      };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  },
);

app.get('/salud', async () => ({ ok: true, hora: new Date().toISOString() }));

iniciarProgramador(prisma);

const puerto = Number.parseInt(process.env.PORT ?? '3000', 10);
await app.listen({ port: puerto, host: '0.0.0.0' });

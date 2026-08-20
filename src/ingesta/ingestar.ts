/**
 * Ingesta de un juego: baja el último sorteo, lo concilia y lo guarda.
 *
 * Con un solo proveedor el sorteo queda en PARCIAL, que es lo correcto:
 * no decimos CONFIRMADO hasta que haya una segunda fuente que coincida.
 */

import type { PrismaClient } from '@prisma/client';
import { proveedorSantaFe } from '../proveedores/santafe.ts';
import { proveedorLotba } from '../proveedores/lotba.ts';
import { conciliar } from './conciliar.ts';
import { huellaDe, type SorteoCrudo } from '../proveedores/tipos.ts';

const PROVEEDORES = [proveedorSantaFe, proveedorLotba];

export async function ingestarJuego(prisma: PrismaClient, juegoCodigo: string) {
  process.stdout.write(`\n${juegoCodigo}: consultando fuentes...\n`);

  const c = await conciliar(juegoCodigo, 0, PROVEEDORES);

  for (const l of c.lecturas) {
    console.log(`  ${l.ok ? 'ok  ' : 'ERROR'} ${l.fuente}${l.error ? `: ${l.error}` : ''}`);
  }
  console.log(`  estado: ${c.estado} - ${c.detalle}`);

  // Tiramos error (en vez de volver en silencio) para que el scheduler
  // reintente: "todavía no publicó" es justo el caso que los reintentos
  // tienen que cubrir.
  if (!c.sorteo) throw new Error(c.detalle);

  await guardarSorteo(prisma, juegoCodigo, c.sorteo, c.estado, 'SANTAFE_WEB');
}

/**
 * Guarda un sorteo ya obtenido (por red o pasado a mano, ej. el bookmarklet
 * de Ajustes cuando Lotería Santa Fe bloquea la conexión desde el backend).
 * Mismo camino de guardado que usa ingestarJuego, para no duplicar lógica.
 */
export async function guardarSorteo(
  prisma: PrismaClient,
  juegoCodigo: string,
  s: SorteoCrudo,
  estado: string,
  fuente: string,
) {
  if (!s.nroConcurso) {
    throw new Error('no se pudo leer el número de concurso');
  }

  // Guardamos la lectura cruda siempre: sirve para auditar si algo no cierra.
  await prisma.lecturaFuente.create({
    data: {
      juegoCodigo,
      nroConcurso: s.nroConcurso,
      fuente,
      huella: huellaDe(s),
      payloadJson: JSON.stringify(s),
      ok: true,
    },
  });

  // Upsert del sorteo: si ya existe, se reemplazan los resultados. Los montos
  // se van completando durante la noche, así que reingestar es normal.
  const sorteo = await prisma.sorteo.upsert({
    where: { juegoCodigo_nroConcurso: { juegoCodigo, nroConcurso: s.nroConcurso } },
    create: {
      juegoCodigo,
      nroConcurso: s.nroConcurso,
      fecha: new Date(s.fecha),
      estado,
      verificadoEn: new Date(),
      urlExtracto: s.urlExtracto ?? null,
    },
    update: {
      estado,
      verificadoEn: new Date(),
      fecha: new Date(s.fecha),
      urlExtracto: s.urlExtracto ?? null,
    },
  });

  await prisma.resultadoModalidad.deleteMany({ where: { sorteoId: sorteo.id } });

  for (const r of s.resultados) {
    await prisma.resultadoModalidad.create({
      data: {
        sorteoId: sorteo.id,
        modalidadCodigo: r.modalidadCodigo,
        numeros: r.numeros,
        plus: r.plus ?? null,
        nivelGanador: r.nivelGanador ?? null,
        escalones: {
          create: r.escalones.map((e) => ({
            aciertos: e.aciertos,
            etiqueta: e.etiqueta,
            pozo: e.pozo,
            ganadores: e.ganadores,
            premioUnitario: e.premioUnitario,
            vacante: e.vacante,
          })),
        },
      },
    });
    const nums = r.numeros.map((n) => String(n).padStart(2, '0')).join(' ');
    console.log(`  ${r.modalidadCodigo.padEnd(14)} ${nums}`);
  }

  console.log(`  guardado: concurso ${s.nroConcurso} del ${s.fecha}`);
}

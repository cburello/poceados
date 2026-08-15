/**
 * Ingesta: baja el último sorteo, lo concilia y lo guarda.
 *
 * Correr con: npm run ingesta
 *
 * Con un solo proveedor el sorteo queda en PARCIAL, que es lo correcto:
 * no decimos CONFIRMADO hasta que haya una segunda fuente que coincida.
 */

import { PrismaClient } from '@prisma/client';
import { proveedorSantaFe } from '../proveedores/santafe.ts';
import { proveedorLotba } from '../proveedores/lotba.ts';
import { conciliar } from './conciliar.ts';
import { huellaDe } from '../proveedores/tipos.ts';

const prisma = new PrismaClient();
const PROVEEDORES = [proveedorSantaFe, proveedorLotba];

async function ingestar(juegoCodigo: string) {
  process.stdout.write(`\n${juegoCodigo}: consultando fuentes...\n`);

  const c = await conciliar(juegoCodigo, 0, PROVEEDORES);

  for (const l of c.lecturas) {
    console.log(`  ${l.ok ? 'ok  ' : 'ERROR'} ${l.fuente}${l.error ? `: ${l.error}` : ''}`);
  }
  console.log(`  estado: ${c.estado} - ${c.detalle}`);

  if (!c.sorteo) return;
  const s = c.sorteo;

  if (!s.nroConcurso) {
    console.log('  no se pudo leer el número de concurso, no se guarda');
    return;
  }

  // Guardamos la lectura cruda siempre: sirve para auditar si algo no cierra.
  await prisma.lecturaFuente.create({
    data: {
      juegoCodigo,
      nroConcurso: s.nroConcurso,
      fuente: 'SANTAFE_WEB',
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
      estado: c.estado,
      verificadoEn: new Date(),
      urlExtracto: s.urlExtracto ?? null,
    },
    update: {
      estado: c.estado,
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
        numerosJson: JSON.stringify(r.numeros),
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

for (const juego of ['QUINI6', 'LOTO_PLUS']) {
  try {
    await ingestar(juego);
  } catch (e) {
    console.error(`  falló ${juego}: ${(e as Error).message}`);
  }
}

await prisma.$disconnect();
console.log('\nlisto\n');

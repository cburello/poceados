# Control de Poceados - backend

API local para controlar jugadas de Quini 6, Loto Plus y demás juegos poceados.
Todo corre en tu máquina: base SQLite en un archivo, sin Docker ni servidor de base.

## Arrancar

```
npm install
npx prisma migrate dev --name inicial
npm run dev
```

Queda en http://127.0.0.1:3000

Verificar que anda:

```
curl http://127.0.0.1:3000/salud
curl http://127.0.0.1:3000/juegos
```

## Tests

```
npm test
```

Son 11 y no necesitan red ni base: el motor de control es una función pura.
El caso base usa datos reales del Quini 6 concurso 3399 del 12/08/2026.

## Cómo está armado

```
src/
  config/juegos.ts        Catálogo de juegos y modalidades. Configuración, no código.
  dominio/control.ts      Motor de control. Función pura, sin base ni red.
  dominio/control.test.ts Tests contra el concurso 3399 real.
  proveedores/tipos.ts    Contrato que toda fuente tiene que cumplir.
  proveedores/santafe.ts  Lector del sitio oficial de Lotería de Santa Fe.
  ingesta/conciliar.ts    Cruce de fuentes antes de publicar un resultado.
  servidor.ts             Fastify con las rutas.
prisma/schema.prisma      Base SQLite.
```

## Las tres decisiones que explican el resto

**Los juegos son datos.** Agregar Brinco o Telekino es editar `juegos.ts`, no tocar
el motor. Cada modalidad declara su `tipo` y el motor sabe qué hacer con cada uno.
Si algún día hay que tocar el motor para sumar un juego, falta un tipo.

**El control es una función pura.** No consulta base ni red, así que corre igual en
el servidor y en el navegador. La PWA importa el mismo archivo y controla sin conexión.

**Nada se publica con una sola fuente.** `conciliar.ts` pide el mismo concurso a
varias fuentes y compara sólo los números, no los montos (que se actualizan a
distinto ritmo). Si no coinciden, el sorteo queda en `DISCREPANCIA` y la API
responde 409 en vez de un resultado posiblemente falso.

## Los tres estados del premio

- `GANADOR` - cobrás, con el monto
- `SIN_PREMIO` - no cobrás, con el motivo
- `PENDIENTE_EXTRACTO` - no se puede saber todavía
- `NO_JUGADA` - no pagaste esa modalidad en el cupón

El tercero existe por Siempre Sale y Sale o Sale: ahí el pozo va a quien tenga
**más** aciertos del país, no a un umbral fijo. Con 5 aciertos cobrás sólo si nadie
hizo 6. Sin el dato del extracto no hay forma de resolverlo, y adivinar sería peor
que esperar.

## Pendientes antes de usarlo en serio

1. **Verificar los selectores de `santafe.ts` contra la página real.** Están armados
   leyendo el maquetado, no probados contra el sitio en vivo. Es el primer trabajo.
2. **Verificar rangos y modalidades** de Loto Plus, Brinco y Telekino contra los
   reglamentos oficiales. En `juegos.ts` están marcados `verificado: false` porque
   salen de fuentes secundarias, que ya demostraron equivocarse.
3. **Guardar fixtures de HTML** en `test/fixtures/` para que un cambio del sitio se
   detecte con los tests en vez de en producción.
4. Segundo proveedor (el PDF del extracto) para que la conciliación tenga con qué comparar.
5. Scheduler post sorteo: Quini 6 miércoles y domingos 21:15, Loto Plus miércoles y
   sábados 22:00. Arrancar 40 minutos después con reintentos.

## Aviso

Aplicación no oficial. Los datos son informativos. El extracto oficial impreso de cada
lotería es el único documento válido para el cobro de premios.

---

## Frontend (web/)

PWA en React + Vite. Sin Tailwind: el diseño es CSS a medida, el mismo del prototipo aprobado.

```
cd web
npm install
npm run dev
```

Abre en http://localhost:5173

**El backend tiene que estar corriendo en otra terminal** (`npm run dev` desde la raíz).
Vite redirige `/api/*` al puerto 3000, así que no hay problemas de CORS.

### Lo importante del frontend

**No duplica la lógica de control.** El alias `@dominio` de `vite.config.ts` apunta a
`../src`, así que `App.tsx` importa exactamente el mismo `control.ts` que testeamos en el
backend. Una sola implementación. Si mañana cambia una regla, cambia en los dos lados sola.

**Las jugadas viven en IndexedDB**, no en el servidor. No hay cuenta ni login. El
exportar/importar de Ajustes no es un extra: es la única red de seguridad que tenés.

**Funciona sin conexión.** Los sorteos que baja quedan cacheados en IndexedDB. Si el backend
está apagado, la app muestra el aviso ámbar arriba y sigue controlando con lo último que tenía.

### Estructura

```
web/src/
  App.tsx                  Navegación y las pantallas raíz
  estilos.css              Una sola hoja, tokens del prototipo
  datos/almacen.ts         IndexedDB: jugadas y cache
  datos/api.ts             Cliente del backend con fallback a cache
  componentes/ui.tsx       Bola, Talon, FichaModalidad, Nota
  pantallas/NuevaJugada.tsx  Alta en 3 pasos
```

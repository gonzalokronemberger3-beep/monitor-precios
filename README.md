# monitor-precios

Vigila una lista de productos y avisa cuando el precio cambia más de un umbral. Guarda historial y no se cae si un sitio falla.

**Sin dependencias.** Node 22+.

---

## Problema que resuelve

Un comercio revisa a mano los precios de la competencia. Son 20 minutos por día de abrir pestañas y anotar números, y siempre se olvida de uno.

Esto lo hace solo, cada 15 minutos, y solo te habla cuando algo se movió de verdad.

---

## Demo

```bash
npm run demo
```

Levanta una tienda falsa, hace tres pasadas y muestra el resultado:

```
  ── Pasada 3 ──
  ▲ Cemento 50 kg              $ 10.450,00 (+6.63%)
  ▼ Pintura látex 20 L         $ 41.800,00 (-7.52%)
  · Hierro del 8               $ 7.300,00 (0.0%)

  2 alerta(s). Estado guardado en estado.json
```

El hierro no se movió, así que no genera alerta: para eso está el umbral.

---

## Uso real

1. Editá `config.json`:

```json
{
  "umbralPct": 5,
  "intervaloMin": 15,
  "productos": [
    { "nombre": "Cemento 50 kg", "url": "https://tu-proveedor.com/api/productos/1" }
  ]
}
```

2. Corré una pasada o dejalo vigilando:

```bash
npm start          # una pasada
npm run vigilar    # queda corriendo
```

---

## Qué espera del otro lado

Un endpoint que devuelva **JSON**, no HTML:

```json
{ "precio": 10450, "moneda": "ARS" }
```

Acepta los campos `precio`, `price`, `valor`, `amount` o `pvp`, como número o como texto (`"$ 10.450,00"` también funciona, en formato argentino o inglés).

### Por qué no hace scraping de HTML

Porque el scraping se rompe cada vez que el sitio cambia un `<div>`, y un monitor que se rompe en silencio es peor que no tener monitor. Si el proveedor no tiene API, hay dos caminos honestos: pedirle acceso, o aceptar que el scraping va a requerir mantenimiento y presupuestarlo como tal.

---

## Cómo decide que algo cambió

| Situación | Resultado |
|---|---|
| Primera vez que ve el producto | `inicial` — no alerta |
| Variación menor al umbral | `sin_cambio` — no alerta |
| Suba ≥ umbral | `subio` — alerta |
| Baja ≥ umbral | `bajo` — alerta |
| Error de red o HTTP | `error` — alerta, conserva el último precio |

El umbral por defecto es 5%. Un precio que se mueve 4% todos los días es ruido; uno que se mueve 15% es una decisión.

---

## Decisiones técnicas

**El error de un producto no tumba la corrida.** Si 1 de 20 sitios está caído, los otros 19 siguen dando información válida. Cada producto se evalúa aislado y los errores se reportan como alertas.

**Escritura atómica del estado.** Se escribe un `.tmp` y se renombra. Si el proceso muere a mitad, el archivo anterior queda intacto en vez de truncado. Un JSON corrupto se detecta y se arranca de cero en lugar de explotar.

**Historial acotado a 50 lecturas por producto.** Sin tope, el archivo crece para siempre y en un año son cientos de MB.

**Reintentos con backoff, pero solo para errores transitorios.** Dos intentos, 300 ms y 600 ms. Un 404 no se reintenta: no va a mejorar.

**Timeout con `AbortController` y `clearTimeout`, no con `AbortSignal.timeout`.** El segundo deja un temporizador vivo y en Windows hace crashear el proceso al salir (aserción de libuv). Costó encontrarlo, y está comentado en el código para que no vuelva.

**Sin `process.exit()` al terminar.** Mismo motivo: si quedan sockets cerrándose, salir a la fuerza rompe libuv. Se usa `process.exitCode` y el proceso termina solo.

---

## Tests

```bash
npm test     # 25 tests
```

Cubren: umbral exacto, precio anterior en cero, primera lectura, historial recortado, error aislado sin romper la corrida, estado corrupto, escritura atómica, parsing de precios en texto, 404 con reintentos y timeout.

Ninguno toca internet: la tienda falsa se levanta en un puerto efímero dentro del mismo test.

---

## Limitaciones

- **No notifica por mail ni Telegram.** Escribe en consola y guarda estado. Conectar un webhook son 10 líneas, pero requiere credenciales y no las invento.
- **No corre como servicio.** `npm run vigilar` vive mientras la terminal está abierta. Para producción: `pm2`, `systemd` o una tarea programada.
- **Estado en un solo archivo.** Con decenas de productos está bien; con miles conviene SQLite.
- **Sin autenticación ni rate limiting.** Es una herramienta local, no un servicio expuesto.

---

## Estructura

```
src/
  cli.js        argumentos, una pasada o modo vigilancia
  monitor.js    evaluación de cambios y orquestación (testeable sin red)
  fuente.js     fetch con timeout, reintentos y extracción del precio
  estado.js     persistencia JSON con escritura atómica
demo/
  tienda.js     tienda falsa con precios que cambian (determinística)
scripts/
  demo.js       demo autocontenida en un comando
test/
  monitor.test.js  20 tests
  fuente.test.js    5 tests
```

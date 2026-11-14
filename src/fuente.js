/**
 * Trae el precio de una URL que devuelve JSON.
 *
 * Se asume una API o un endpoint de datos, NO HTML con scraping:
 * el scraping se rompe cada vez que el sitio cambia un div, y meterlo
 * en un monitor de producción es garantizar que falle un martes.
 */

const CAMPOS_PRECIO = ["precio", "price", "valor", "amount", "pvp"];
const CAMPOS_MONEDA = ["moneda", "currency", "divisa"];

/**
 * Convierte "1.234,50" o "1,234.50" a número.
 * Un precio que llega como texto puede venir en cualquiera de los dos
 * formatos, y `Number()` sobre "1.234,50" devuelve NaN.
 */
function aNumero(texto) {
  let s = texto.trim().replace(/[^\d.,-]/g, "");
  if (s === "") return NaN;

  const tienePunto = s.includes(".");
  const tieneComa = s.includes(",");

  if (tienePunto && tieneComa) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (tieneComa) {
    const partes = s.split(",");
    s = partes.length === 2 && partes[1].length !== 3 ? partes.join(".") : s.replace(/,/g, "");
  } else if (tienePunto) {
    const partes = s.split(".");
    if (partes.length > 2 || (partes[1].length === 3 && partes[0].length <= 3)) {
      s = s.replace(/\./g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function extraerPrecio(datos) {
  if (datos === null || typeof datos !== "object") {
    throw new Error("la respuesta no es un objeto JSON");
  }

  for (const campo of CAMPOS_PRECIO) {
    const valor = datos[campo];
    if (typeof valor === "number") return { precio: valor, moneda: buscarMoneda(datos) };
    if (typeof valor === "string") {
      const n = aNumero(valor);
      if (Number.isFinite(n)) return { precio: n, moneda: buscarMoneda(datos) };
    }
  }

  throw new Error(`no encontré un precio en la respuesta (campos: ${Object.keys(datos).join(", ")})`);
}

function buscarMoneda(datos) {
  for (const campo of CAMPOS_MONEDA) {
    if (typeof datos[campo] === "string") return datos[campo];
  }
  return "ARS";
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, reintentos?: number }} opciones
 */
export async function obtenerPrecioHttp(url, { timeoutMs = 5000, reintentos = 2 } = {}) {
  let ultimoError;

  for (let intento = 1; intento <= reintentos; intento++) {
    // AbortSignal.timeout() deja un temporizador vivo hasta que vence,
    // y en Windows eso hace explotar el proceso al salir (aserción de libuv).
    // Con AbortController + clearTimeout el timer se cancela apenas termina.
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: control.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return extraerPrecio(await res.json());
    } catch (error) {
      ultimoError = error;

      // Reintentar solo tiene sentido si quedan intentos y el error
      // puede ser transitorio (red, timeout, 5xx). Un 404 no mejora.
      if (intento < reintentos) {
        await new Promise((listo) => setTimeout(listo, 300 * intento));
      }
    } finally {
      clearTimeout(temporizador);
    }
  }

  throw new Error(`${url}: ${ultimoError.message}`);
}

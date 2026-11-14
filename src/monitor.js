const redondear = (n) => Math.round(n * 1000000) / 1000000;

/**
 * Decide qué pasó con el precio de un producto.
 * Función pura: la misma entrada da siempre la misma salida.
 *
 * @param {number|null} anterior  precio guardado en la corrida anterior
 * @param {number} actual         precio leído ahora
 * @param {number} umbralPct      variación mínima para considerar que "cambió"
 * @returns {{ tipo: "inicial"|"sin_cambio"|"subio"|"bajo", cambio: number|null, porcentaje: number|null }}
 */
export function evaluar(anterior, actual, umbralPct = 5) {
  if (anterior === null || anterior === undefined) {
    return { tipo: "inicial", cambio: null, porcentaje: null };
  }

  const cambio = redondear(actual - anterior);

  // Sin precio anterior no hay porcentaje posible: dividir por cero da Infinity
  // y un "subió ∞%" no le sirve a nadie.
  if (anterior === 0) {
    return cambio === 0
      ? { tipo: "sin_cambio", cambio: 0, porcentaje: null }
      : { tipo: cambio > 0 ? "subio" : "bajo", cambio, porcentaje: null };
  }

  const porcentaje = redondear(((actual - anterior) / anterior) * 100);

  if (Math.abs(porcentaje) < umbralPct) {
    return { tipo: "sin_cambio", cambio, porcentaje };
  }

  return { tipo: cambio > 0 ? "subio" : "bajo", cambio, porcentaje };
}

/**
 * Revisa todos los productos y devuelve el resultado de cada uno
 * más el estado actualizado (para guardar).
 *
 * `obtenerPrecio` se inyecta para poder testear sin red.
 */
export async function revisar(productos, { obtenerPrecio, estado = {}, umbralPct = 5, ahora = new Date() } = {}) {
  if (typeof obtenerPrecio !== "function") {
    throw new TypeError("revisar() necesita una función obtenerPrecio");
  }

  const resultados = [];
  const nuevoEstado = { ...estado };

  for (const producto of productos) {
    const previo = estado[producto.url] ?? null;

    try {
      const { precio, moneda = "ARS" } = await obtenerPrecio(producto.url);

      if (!Number.isFinite(precio)) {
        throw new Error("el precio leído no es un número");
      }

      const evaluacion = evaluar(previo?.precio ?? null, precio, umbralPct);

      const historial = [...(previo?.historial ?? []), { precio, fecha: ahora.toISOString() }].slice(-50);

      nuevoEstado[producto.url] = {
        nombre: producto.nombre,
        precio,
        moneda,
        actualizado: ahora.toISOString(),
        historial,
      };

      resultados.push({ producto: producto.nombre, url: producto.url, precio, moneda, ...evaluacion });
    } catch (error) {
      // Un producto que falla no debe tumbar la corrida entera:
      // el resto de los precios sigue siendo información válida.
      resultados.push({
        producto: producto.nombre,
        url: producto.url,
        tipo: "error",
        mensaje: error.message,
        precio: previo?.precio ?? null,
        cambio: null,
        porcentaje: null,
      });
    }
  }

  return { resultados, estado: nuevoEstado };
}

/** Los resultados que merecen interrumpirte. */
export function soloAlertas(resultados) {
  return resultados.filter((r) => r.tipo === "subio" || r.tipo === "bajo" || r.tipo === "error");
}

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Estado persistido en JSON.
 *
 * Se escribe con archivo temporal + rename: si el proceso muere a mitad
 * de escritura, el archivo anterior queda intacto en vez de quedar
 * truncado y sin precios.
 */
export function cargarEstado(ruta) {
  if (!existsSync(ruta)) return {};

  try {
    const crudo = readFileSync(ruta, "utf8");
    const datos = JSON.parse(crudo);
    return datos && typeof datos === "object" ? datos : {};
  } catch {
    // Archivo corrupto: mejor arrancar de cero que no arrancar.
    return {};
  }
}

export function guardarEstado(ruta, estado) {
  mkdirSync(dirname(ruta), { recursive: true });

  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, JSON.stringify(estado, null, 2), "utf8");
  renameSync(temporal, ruta);
}

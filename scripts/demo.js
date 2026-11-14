#!/usr/bin/env node
import { execFile } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { crearTienda, PRODUCTOS } from "../demo/tienda.js";

const ejecutar = promisify(execFile);
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const tienda = await crearTienda();
const config = join(tmpdir(), `monitor-config-${process.pid}.json`);
const estado = join(tmpdir(), `monitor-estado-${process.pid}.json`);

writeFileSync(
  config,
  JSON.stringify(
    {
      umbralPct: 5,
      productos: PRODUCTOS.map((p) => ({
        nombre: p.nombre,
        url: `http://127.0.0.1:${tienda.puerto}/productos/${p.id}`,
      })),
    },
    null,
    2
  ),
  "utf8"
);

console.log("\n  1 opinión, 2 opiniones, 3 opiniones...");
console.log("  Cada pasada consulta la tienda y compara con la anterior.");
console.log("  Umbral: 5%. Los cambios más chicos no generan alerta.\n");

try {
  for (const vuelta of [1, 2, 3]) {
    const { stdout } = await ejecutar(
      process.execPath,
      ["src/cli.js", "--config", config, "--estado", estado, "--todas"],
      { cwd: raiz, env: { ...process.env, NO_COLOR: "1" } }
    );

    console.log(stdout.replace(/^\s*Revisión .*$/m, `  ── Pasada ${vuelta} ──`));
  }

  console.log("  Fin de la demo. En uso real:  npm run vigilar\n");
} finally {
  rmSync(config, { force: true });
  rmSync(estado, { force: true });
  await tienda.cerrar();
}

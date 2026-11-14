#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { revisar, soloAlertas } from "./monitor.js";
import { obtenerPrecioHttp } from "./fuente.js";
import { cargarEstado, guardarEstado } from "./estado.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AYUDA = `
Monitor de precios.

  node src/cli.js             una pasada
  node src/cli.js --vigilar   queda corriendo según el intervalo del config

Opciones:
  --config <ruta>   archivo de configuración (por defecto ./config.json)
  --estado <ruta>   archivo de historial     (por defecto ./estado.json)
  --todas           mostrar también los que no cambiaron
`;

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--ayuda")) {
  console.log(AYUDA);
  process.exit(0);
}

let rutaConfig = join(__dirname, "..", "config.json");
let rutaEstado = join(__dirname, "..", "estado.json");
let mostrarTodas = false;
let vigilar = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--config") rutaConfig = args[++i];
  else if (args[i] === "--estado") rutaEstado = args[++i];
  else if (args[i] === "--todas") mostrarTodas = true;
  else if (args[i] === "--vigilar") vigilar = true;
  else {
    console.error(`Opción desconocida: ${args[i]}\n${AYUDA}`);
    process.exit(1);
  }
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const rojo = (s) => (color ? `\x1b[31m${s}\x1b[0m` : s);
const verde = (s) => (color ? `\x1b[32m${s}\x1b[0m` : s);
const gris = (s) => (color ? `\x1b[90m${s}\x1b[0m` : s);
const negrita = (s) => (color ? `\x1b[1m${s}\x1b[0m` : s);

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 2,
});

function cargarConfig() {
  let crudo;
  try {
    crudo = readFileSync(rutaConfig, "utf8");
  } catch {
    console.error(`No pude leer la configuración: ${rutaConfig}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(crudo);
  } catch (e) {
    console.error(`La configuración no es JSON válido: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(config.productos) || config.productos.length === 0) {
    console.error(`La configuración necesita una lista "productos" con al menos un elemento.`);
    process.exit(1);
  }

  for (const [i, p] of config.productos.entries()) {
    if (!p.nombre || !p.url) {
      console.error(`producto #${i + 1}: faltan "nombre" o "url"`);
      process.exit(1);
    }
  }

  return config;
}

async function pasada(config) {
  const estadoPrevio = cargarEstado(rutaEstado);

  const { resultados, estado } = await revisar(config.productos, {
    obtenerPrecio: (url) => obtenerPrecioHttp(url, { timeoutMs: config.timeoutMs ?? 5000 }),
    estado: estadoPrevio,
    umbralPct: config.umbralPct ?? 5,
  });

  guardarEstado(rutaEstado, estado);

  const aMostrar = mostrarTodas ? resultados : soloAlertas(resultados);
  const hora = new Date().toLocaleTimeString("es-AR");

  console.log("");
  console.log(negrita(`  Revisión ${hora}`));

  if (aMostrar.length === 0) {
    console.log(gris(`  ${resultados.length} productos sin cambios por encima del ${config.umbralPct ?? 5}%.`));
    return;
  }

  for (const r of aMostrar) {
    if (r.tipo === "error") {
      console.log(`  ${rojo("!")} ${r.producto.padEnd(26)} ${gris("error: " + r.mensaje)}`);
      continue;
    }

    if (r.tipo === "inicial") {
      console.log(`  ${gris("·")} ${r.producto.padEnd(26)} ${pesos.format(r.precio)} ${gris("(primera lectura)")}`);
      continue;
    }

    if (r.tipo === "sin_cambio") {
      console.log(`  ${gris("·")} ${r.producto.padEnd(26)} ${pesos.format(r.precio)} ${gris(`(${r.porcentaje.toFixed(1)}%)`)}`);
      continue;
    }

    const flecha = r.tipo === "subio" ? "▲" : "▼";
    const pintar = r.tipo === "subio" ? rojo : verde;
    const signo = r.cambio > 0 ? "+" : "";
    console.log(
      `  ${pintar(flecha)} ${r.producto.padEnd(26)} ${pesos.format(r.precio)} ` +
        pintar(`(${signo}${r.porcentaje.toFixed(2)}%)`)
    );
  }

  const alertas = soloAlertas(resultados).length;
  if (alertas > 0) {
    console.log(gris(`\n  ${alertas} alerta(s). Estado guardado en ${rutaEstado}`));
  }
}

const config = cargarConfig();

if (!vigilar) {
  await pasada(config);
  console.log("");
  // Sin process.exit(): si quedan handles de red cerrándose, salir a la
  // fuerza rompe libuv en Windows. Que el proceso termine solo.
  process.exitCode = 0;
} else {
  const intervalo = Math.max(1, config.intervaloMin ?? 15) * 60_000;
  console.log(`Vigilando ${config.productos.length} productos cada ${intervalo / 60_000} min. Ctrl+C para cortar.`);

  await pasada(config);
  setInterval(() => {
    pasada(config).catch((e) => console.error("Error en la pasada:", e.message));
  }, intervalo);
}

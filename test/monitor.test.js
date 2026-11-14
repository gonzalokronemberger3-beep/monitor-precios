import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { evaluar, revisar, soloAlertas } from "../src/monitor.js";
import { cargarEstado, guardarEstado } from "../src/estado.js";

// ------------------------------------------------------------------
// evaluar
// ------------------------------------------------------------------
test("evaluar: primera lectura se marca como inicial", () => {
  const r = evaluar(null, 1000, 5);
  assert.equal(r.tipo, "inicial");
  assert.equal(r.cambio, null);
});

test("evaluar: variación menor al umbral no es alerta", () => {
  const r = evaluar(1000, 1040, 5); // +4%
  assert.equal(r.tipo, "sin_cambio");
  assert.equal(r.porcentaje, 4);
});

test("evaluar: justo en el umbral sí es alerta", () => {
  const r = evaluar(1000, 1050, 5); // +5%
  assert.equal(r.tipo, "subio");
  assert.equal(r.porcentaje, 5);
});

test("evaluar: detecta subas y bajas", () => {
  assert.equal(evaluar(1000, 1200, 5).tipo, "subio");
  assert.equal(evaluar(1000, 800, 5).tipo, "bajo");
  assert.equal(evaluar(1000, 1200, 5).porcentaje, 20);
  assert.equal(evaluar(1000, 800, 5).porcentaje, -20);
});

test("evaluar: no divide por cero si el precio anterior era 0", () => {
  const r = evaluar(0, 500, 5);
  assert.equal(r.tipo, "subio");
  assert.equal(r.porcentaje, null);
});

test("evaluar: precio idéntico no alerta", () => {
  const r = evaluar(1000, 1000, 0.01);
  assert.equal(r.tipo, "sin_cambio");
  assert.equal(r.cambio, 0);
});

// ------------------------------------------------------------------
// revisar
// ------------------------------------------------------------------
function preciosFijos(mapa) {
  return async (url) => {
    if (!(url in mapa)) throw new Error("sin datos");
    return { precio: mapa[url], moneda: "ARS" };
  };
}

test("revisar: guarda estado y arma historial", async () => {
  const productos = [{ nombre: "A", url: "u1" }];

  const { resultados, estado } = await revisar(productos, {
    obtenerPrecio: preciosFijos({ u1: 1000 }),
    umbralPct: 5,
  });

  assert.equal(resultados[0].tipo, "inicial");
  assert.equal(estado.u1.precio, 1000);
  assert.equal(estado.u1.historial.length, 1);
});

test("revisar: la segunda pasada detecta el cambio", async () => {
  const productos = [{ nombre: "A", url: "u1" }];
  const estadoPrevio = { u1: { precio: 1000, historial: [{ precio: 1000, fecha: "2026-01-01T00:00:00.000Z" }] } };

  const { resultados, estado } = await revisar(productos, {
    obtenerPrecio: preciosFijos({ u1: 1200 }),
    estado: estadoPrevio,
    umbralPct: 5,
  });

  assert.equal(resultados[0].tipo, "subio");
  assert.equal(resultados[0].porcentaje, 20);
  assert.equal(estado.u1.historial.length, 2);
});

test("revisar: no muta el estado que recibe", async () => {
  const estadoPrevio = { u1: { precio: 1000, historial: [] } };

  await revisar([{ nombre: "A", url: "u1" }], {
    obtenerPrecio: preciosFijos({ u1: 1500 }),
    estado: estadoPrevio,
  });

  assert.equal(estadoPrevio.u1.precio, 1000);
});

test("revisar: un producto que falla no rompe toda la corrida", async () => {
  const productos = [
    { nombre: "Bien", url: "ok" },
    { nombre: "Mal", url: "roto" },
  ];

  const { resultados } = await revisar(productos, {
    obtenerPrecio: preciosFijos({ ok: 500 }),
  });

  assert.equal(resultados[0].tipo, "inicial");
  assert.equal(resultados[1].tipo, "error");
  assert.match(resultados[1].mensaje, /sin datos/);
  // conserva el último precio conocido
  assert.equal(resultados[1].precio, null);
});

test("revisar: el historial se recorta a 50 entradas", async () => {
  const historial = Array.from({ length: 50 }, (_, i) => ({ precio: 100 + i, fecha: "2026-01-01T00:00:00.000Z" }));

  const { estado } = await revisar([{ nombre: "A", url: "u1" }], {
    obtenerPrecio: preciosFijos({ u1: 999 }),
    estado: { u1: { precio: 149, historial } },
  });

  assert.equal(estado.u1.historial.length, 50);
  assert.equal(estado.u1.historial.at(-1).precio, 999);
});

test("revisar: exige una función obtenerPrecio", async () => {
  await assert.rejects(() => revisar([], {}), TypeError);
});

test("soloAlertas deja afuera los iniciales y los sin cambio", () => {
  const resultados = [
    { tipo: "inicial" },
    { tipo: "sin_cambio" },
    { tipo: "subio" },
    { tipo: "bajo" },
    { tipo: "error" },
  ];

  assert.equal(soloAlertas(resultados).length, 3);
});

// ------------------------------------------------------------------
// estado
// ------------------------------------------------------------------
test("estado: guarda y vuelve a cargar igual", () => {
  const dir = mkdtempSync(join(tmpdir(), "monitor-"));
  const ruta = join(dir, "estado.json");

  const estado = { u1: { precio: 1234.56, moneda: "ARS", historial: [] } };
  guardarEstado(ruta, estado);

  assert.deepEqual(cargarEstado(ruta), estado);
  // no quedan archivos temporales
  assert.ok(!readFileSync(ruta, "utf8").includes("tmp"));
});

test("estado: archivo inexistente devuelve objeto vacío", () => {
  assert.deepEqual(cargarEstado(join(tmpdir(), "no-existe-jamas.json")), {});
});

test("estado: JSON corrupto devuelve objeto vacío en vez de explotar", () => {
  const dir = mkdtempSync(join(tmpdir(), "monitor-"));
  const ruta = join(dir, "roto.json");
  writeFileSync(ruta, "{ esto no es json", "utf8");

  assert.deepEqual(cargarEstado(ruta), {});
});

test("estado: escribe con rename atómico (no deja temporales)", () => {
  const dir = mkdtempSync(join(tmpdir(), "monitor-"));
  const ruta = join(dir, "e.json");

  guardarEstado(ruta, { a: 1 });
  guardarEstado(ruta, { a: 2 });

  assert.equal(JSON.parse(readFileSync(ruta, "utf8")).a, 2);
});

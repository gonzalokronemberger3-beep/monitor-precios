import test from "node:test";
import assert from "node:assert/strict";

import { extraerPrecio, obtenerPrecioHttp } from "../src/fuente.js";
import { crearTienda } from "../demo/tienda.js";

test("extraerPrecio toma el campo precio numérico", () => {
  assert.deepEqual(extraerPrecio({ precio: 1500 }), { precio: 1500, moneda: "ARS" });
});

test("extraerPrecio acepta otros nombres de campo", () => {
  assert.equal(extraerPrecio({ price: 99 }).precio, 99);
  assert.equal(extraerPrecio({ valor: 42 }).precio, 42);
  assert.equal(extraerPrecio({ amount: 7 }).precio, 7);
});

test("extraerPrecio limpia strings con símbolos", () => {
  assert.equal(extraerPrecio({ precio: "$ 1.234,50" }).precio, 1234.5);
});

test("extraerPrecio respeta la moneda si viene", () => {
  assert.equal(extraerPrecio({ precio: 10, moneda: "USD" }).moneda, "USD");
});

test("extraerPrecio falla claro si no hay precio", () => {
  assert.throws(() => extraerPrecio({ stock: 3 }), /no encontré un precio/);
  assert.throws(() => extraerPrecio(null), /no es un objeto/);
});

test("obtenerPrecioHttp lee un endpoint real", async () => {
  const tienda = await crearTienda();
  try {
    const { precio, moneda } = await obtenerPrecioHttp(`http://127.0.0.1:${tienda.puerto}/productos/1`);
    assert.equal(precio, 9800);
    assert.equal(moneda, "ARS");
  } finally {
    await tienda.cerrar();
  }
});

test("obtenerPrecioHttp reintenta y falla con un 404", async () => {
  const tienda = await crearTienda();
  try {
    await assert.rejects(
      () => obtenerPrecioHttp(`http://127.0.0.1:${tienda.puerto}/productos/99`, { reintentos: 2 }),
      /HTTP 404/
    );
  } finally {
    await tienda.cerrar();
  }
});

test("obtenerPrecioHttp corta por timeout contra un puerto muerto", async () => {
  await assert.rejects(
    () => obtenerPrecioHttp("http://127.0.0.1:9/nada", { timeoutMs: 300, reintentos: 1 })
  );
});

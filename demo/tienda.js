import { createServer } from "node:http";

/**
 * Tienda falsa para la demo.
 *
 * Devuelve JSON con precios que cambian en cada consulta, siguiendo una
 * secuencia fija por producto. Determinística a propósito: una demo que
 * a veces muestra un cambio y a veces no sirve para nada.
 */

export const PRODUCTOS = [
  { id: 1, nombre: "Cemento 50 kg", precios: [9800, 9800, 10450] },
  { id: 2, nombre: "Pintura látex 20 L", precios: [45200, 45200, 41800] },
  // Este no se mueve nunca: sirve para ver que el umbral filtra el ruido.
  { id: 3, nombre: "Hierro del 8", precios: [7300, 7300, 7300] },
];

export function crearTienda({ puerto = 0 } = {}) {
  const consultas = new Map();

  const server = createServer((req, res) => {
    const m = req.url.match(/^\/productos\/(\d+)$/);

    if (!m) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "no_encontrado" }));
    }

    const producto = PRODUCTOS.find((p) => p.id === Number(m[1]));
    if (!producto) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "producto_inexistente" }));
    }

    const n = consultas.get(producto.id) ?? 0;
    consultas.set(producto.id, n + 1);

    const precio = producto.precios[Math.min(n, producto.precios.length - 1)];

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ producto: producto.nombre, precio, moneda: "ARS" }));
  });

  return new Promise((listo, fallo) => {
    server.once("error", fallo);
    server.listen(puerto, "127.0.0.1", () => {
      listo({
        puerto: server.address().port,
        cerrar: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

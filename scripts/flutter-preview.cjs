const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../mobile-flutter/build/web");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
if (!fs.existsSync(path.join(root, "index.html"))) {
  console.error("Primero compilá Flutter web.");
  process.exit(1);
}
const server = http.createServer((request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      ),
      file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400).end();
  }
});
server.listen(5174, "127.0.0.1", () =>
  console.log("Vista Flutter: http://127.0.0.1:5174"),
);
server.on("error", () => {
  console.error("No se pudo abrir el puerto 5174.");
  process.exitCode = 1;
});

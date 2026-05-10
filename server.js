const fs = require("fs");
const path = require("path");
const net = require("net");
const { createServer } = require("http");
const next = require("next");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const requestedPort = parseInt(process.env.PORT || "3000", 10);
const dev = !process.argv.includes("--prod");

const routeMap = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/about", "about.html"],
  ["/about.html", "about.html"],
  ["/books", "books.html"],
  ["/books.html", "books.html"],
  ["/projects", "projects.html"],
  ["/projects.html", "projects.html"],
  ["/screen", "screen.html"],
  ["/screen.html", "screen.html"],
  ["/posts/whats-behind-the-glass", "posts/whats-behind-the-glass.html"],
  ["/posts/whats-behind-the-glass.html", "posts/whats-behind-the-glass.html"]
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

function getContentType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isSafePath(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === publicDir || resolved.startsWith(publicDir + path.sep);
}

function tryFile(filePath) {
  if (!isSafePath(filePath)) {
    return null;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      return filePath;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveStaticFile(urlPath) {
  const mappedFile = routeMap.get(urlPath);
  if (mappedFile) {
    return tryFile(path.join(publicDir, mappedFile));
  }

  const cleanPath = decodeURIComponent(urlPath);
  const relativePath = cleanPath.replace(/^\/+/, "");
  if (!relativePath) {
    return null;
  }

  const segments = relativePath.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return null;
  }

  const ext = path.extname(relativePath).toLowerCase();
  if (!mimeTypes[ext] && relativePath !== "CNAME") {
    return null;
  }

  const publicFile = tryFile(path.join(publicDir, relativePath));
  return publicFile || null;
}

function sendFile(res, filePath) {
  res.writeHead(200, {
    "Content-Type": getContentType(filePath),
    "Cache-Control": "no-cache"
  });

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal Server Error");
  });
  stream.pipe(res);
}

function getAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const tester = net.createServer();

      tester.once("error", (error) => {
        tester.close();
        if (error.code === "EADDRINUSE" || error.code === "EACCES") {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });

      tester.once("listening", () => {
        tester.close(() => resolve(port));
      });

      tester.listen(port, "0.0.0.0");
    };

    tryPort(startPort);
  });
}

async function main() {
  const port = await getAvailablePort(requestedPort);
  const app = next({ dev, dir: rootDir });
  const handle = app.getRequestHandler();

  await app.prepare();

  createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const staticFile = resolveStaticFile(requestUrl.pathname);

    if (staticFile) {
      sendFile(res, staticFile);
      return;
    }

    handle(req, res, requestUrl);
  }).listen(port, () => {
    const mode = dev ? "development" : "production";
    const fallbackNote = port !== requestedPort ? ` (requested ${requestedPort})` : "";
    console.log(`> Server listening at http://localhost:${port} in ${mode}${fallbackNote}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

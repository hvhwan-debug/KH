// Máy chủ chạy thử trên máy (KHÔNG dùng cho production): phục vụ giao diện và mô phỏng /api của Azure Static Web Apps.
// Chạy:  node dev/server.js   rồi mở http://localhost:7071
// Dữ liệu và email chỉ nằm trong bộ nhớ; xem email đã "gửi" tại http://localhost:7071/__mailbox
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 7071;
const D = {
  STORAGE_MODE: "memory", MAIL_MODE: "memory", COOKIE_INSECURE: "1",
  SESSION_SECRET: "dev-session-secret-dev-session-secret-1234",
  CRON_SECRET: "dev-cron-secret-1234567890",
  ALLOWED_EMAIL_DOMAINS: "livotec.vn", APP_URL: "http://localhost:" + PORT
};
Object.keys(D).forEach((k) => { if (!process.env[k]) process.env[k] = D[k]; });

const root = path.join(__dirname, "..");
const apiDir = path.join(root, "api");
const routes = [];
fs.readdirSync(apiDir).forEach((n) => {
  const fj = path.join(apiDir, n, "function.json");
  if (!fs.existsSync(fj)) return;
  const b = JSON.parse(fs.readFileSync(fj, "utf8")).bindings.find((x) => x.type === "httpTrigger");
  routes.push({ route: "/api/" + b.route, methods: b.methods.map((m) => m.toUpperCase()), fn: require(path.join(apiDir, n, "index.js")) });
});
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".css": "text/css" };

http.createServer(async (rq, rs) => {
  const url = new URL(rq.url, "http://localhost");
  let raw = "";
  for await (const c of rq) raw += c;
  if (url.pathname === "/__mailbox") { rs.writeHead(200, { "Content-Type": "application/json" }); return rs.end(JSON.stringify(global.__mailbox || [])); }
  const r = routes.find((x) => x.route === url.pathname && x.methods.includes(rq.method));
  if (url.pathname.indexOf("/api/") === 0) {
    if (!r) { rs.writeHead(404); return rs.end("not found"); }
    let body = raw;
    if (/json/.test(rq.headers["content-type"] || "") && raw) { try { body = JSON.parse(raw); } catch (e) { body = undefined; } }
    const ctx = { log: Object.assign((...a) => console.log(...a), { error: console.error, warn: console.warn }), res: null };
    const req = { method: rq.method, headers: rq.headers, query: Object.fromEntries(url.searchParams), body, params: {} };
    try { await r.fn(ctx, req); } catch (e) { console.error(e); ctx.res = { status: 500, body: "error" }; }
    const res = ctx.res || { status: 204 };
    const headers = Object.assign({}, res.headers);
    const out = typeof res.body === "object" && res.body !== null ? JSON.stringify(res.body) : String(res.body == null ? "" : res.body);
    rs.writeHead(res.status || 200, headers);
    return rs.end(out);
  }
  const f = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
  if (f.indexOf(root) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("not found"); }
  rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(rs);
}).listen(PORT, () => console.log("Dev server: http://localhost:" + PORT));

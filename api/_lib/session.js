// Phiên đăng nhập dạng cookie có chữ ký HMAC (không lưu mật khẩu).
const crypto = require("crypto");
const { cfg } = require("./config");

const b64 = (s) => Buffer.from(s).toString("base64url");

function hmac(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEq(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return body + "." + hmac(body, cfg().secret);
}

function verify(token) {
  const secret = cfg().secret;
  if (!token || !secret) return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i), mac = token.slice(i + 1);
  if (!safeEq(mac, hmac(body, secret))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}

function parseCookies(h) {
  const out = {};
  String(h || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

const MAX_AGE = 30 * 24 * 3600;

function sessionValue(email) {
  return sign({ uid: uidOf(email), email: email.toLowerCase(), exp: Date.now() + MAX_AGE * 1000 });
}

function sessionCookie(email) {
  const v = sessionValue(email);
  return "sr_session=" + v + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + MAX_AGE + (cfg().cookieInsecure ? "" : "; Secure");
}

function clearCookie() {
  return "sr_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (cfg().cookieInsecure ? "" : "; Secure");
}

function uidOf(email) {
  return crypto.createHash("sha256").update(String(email).toLowerCase()).digest("hex").slice(0, 32);
}

// Phiên có thể đến từ header X-SR-Token (đáng tin cậy qua proxy của Azure) hoặc cookie.
function userFromReq(req) {
  const h = req.headers || {};
  const t = h["x-sr-token"];
  if (t) { const p = verify(String(t)); if (p) return p; }
  const c = parseCookies(h.cookie || h.Cookie);
  return verify(c.sr_session);
}

function unsubToken(uid) { return sign({ u: uid, k: "unsub" }); }
function unsubVerify(t) { const p = verify(t); return p && p.k === "unsub" ? p.u : null; }

module.exports = { sign, verify, safeEq, sessionValue, sessionCookie, clearCookie, uidOf, userFromReq, unsubToken, unsubVerify };

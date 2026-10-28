// Lưu file lên Google Drive. Hai cách kết nối (ưu tiên cách 1 nếu cả hai đều có):
//  1) TÀI KHOẢN DỊCH VỤ (service account): GOOGLE_SERVICE_ACCOUNT_JSON + GDRIVE_FOLDER_ID (thư mục/Drive chung đã chia sẻ cho tài khoản dịch vụ).
//  2) ĐĂNG NHẬP GOOGLE CỦA QUẢN TRỊ (như nút "Lưu vào Drive" thông thường): GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET,
//     quản trị bấm "Kết nối Google Drive" một lần để cấp quyền; file lưu vào Drive của chính tài khoản đó (thư mục "Kết quả kiểm tra" do hệ thống tự tạo).
//     Quyền xin: drive.file (chỉ thấy file/thư mục do chính ứng dụng tạo) + email (để hiện đang kết nối tài khoản nào).
const crypto = require("crypto");
const store = require("./store");
const { cfg } = require("./config");

const SCOPE_SA = "https://www.googleapis.com/auth/drive";
const SCOPE_OA = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OA_KEY = "kt/gdrive-oauth.json";
const FOLDER_NAME = "Kết quả kiểm tra";
let cached = { key: "", token: "", exp: 0 };

// ---------- cấu hình ----------
function loadKey() {
  const raw = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  let txt = raw;
  if (raw[0] !== "{") { try { txt = Buffer.from(raw, "base64").toString("utf8"); } catch (e) { return null; } }
  try {
    const k = JSON.parse(txt);
    if (!k.client_email || !k.private_key) return null;
    return { email: k.client_email, key: String(k.private_key).replace(/\\n/g, "\n"), tokenUri: k.token_uri || "https://oauth2.googleapis.com/token" };
  } catch (e) { return null; }
}
function folderId() { return String(process.env.GDRIVE_FOLDER_ID || "").trim(); }
function saReady() { return !!(loadKey() && folderId()); }
function oauthClient() {
  const id = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim(), secret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  return id && secret ? { id, secret } : null;
}
function redirectUri() { return cfg().appUrl + "/api/gdrive-oauth"; }
async function getOauth() { try { const o = await store.get(OA_KEY); return o && o.refresh_token ? o : null; } catch (e) { return null; } }

function missingText() {
  if (oauthClient()) return "Chưa kết nối Google Drive. Bấm “Kết nối Google Drive” để cấp quyền.";
  return "Chưa cấu hình Google Drive trên máy chủ. Cần GOOGLE_OAUTH_CLIENT_ID và GOOGLE_OAUTH_CLIENT_SECRET (đăng nhập Google để cấp quyền), hoặc GOOGLE_SERVICE_ACCOUNT_JSON và GDRIVE_FOLDER_ID (tài khoản dịch vụ).";
}
// "service" | "oauth" | "" (chưa kết nối)
async function mode() {
  if (saReady()) return "service";
  if (oauthClient() && await getOauth()) return "oauth";
  return "";
}
async function ready() { return !!(await mode()); }

// ---------- token ----------
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function tokenService() {
  const now = Math.floor(Date.now() / 1000);
  if (cached.key === "sa" && cached.token && cached.exp - 60 > now) return cached.token;
  const k = loadKey();
  if (!k) throw new Error(missingText());
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: k.email, scope: SCOPE_SA, aud: k.tokenUri, iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign("RSA-SHA256").update(head + "." + claim).sign(k.key));
  const r = await fetch(k.tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + sig });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Không xác thực được với Google (" + (j.error_description || j.error || r.status) + "). Kiểm tra lại khoá tài khoản dịch vụ.");
  cached = { key: "sa", token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cached.token;
}
async function tokenOauth() {
  const now = Math.floor(Date.now() / 1000);
  if (cached.key === "oa" && cached.token && cached.exp - 60 > now) return cached.token;
  const c = oauthClient(), o = await getOauth();
  if (!c || !o) throw new Error(missingText());
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(o.refresh_token) + "&client_id=" + encodeURIComponent(c.id) + "&client_secret=" + encodeURIComponent(c.secret) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") { try { await store.put(OA_KEY, null); } catch (e) {} cached = { key: "", token: "", exp: 0 }; throw new Error("Kết nối Google Drive đã hết hạn hoặc bị thu hồi. Hãy bấm “Kết nối Google Drive” để cấp quyền lại."); }
    throw new Error("Không làm mới được quyền Google Drive (" + (j.error_description || j.error || r.status) + ").");
  }
  cached = { key: "oa", token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cached.token;
}
async function getToken(m) { return (m || await mode()) === "oauth" ? tokenOauth() : tokenService(); }

async function apiErr(r) {
  const j = await r.json().catch(() => ({}));
  const e = j && j.error || {}, msg = e.message || ("HTTP " + r.status), reason = e.errors && e.errors[0] && e.errors[0].reason || "";
  if (reason === "storageQuotaExceeded") return "Không còn dung lượng để lưu. Với tài khoản dịch vụ hãy dùng Drive chung (Shared drive); với đăng nhập Google hãy giải phóng dung lượng Drive.";
  if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") return "Google đang giới hạn tốc độ, hãy thử lại sau ít phút.";
  if (r.status === 404) return "Không thấy thư mục Drive. Kiểm tra lại cấu hình / kết nối.";
  if (r.status === 403) return "Chưa có quyền ghi vào Drive (" + msg + ").";
  return msg;
}

// ---------- đăng nhập Google (OAuth) ----------
function authUrl(state) {
  const c = oauthClient();
  if (!c) throw new Error(missingText());
  return "https://accounts.google.com/o/oauth2/v2/auth?" + [
    "client_id=" + encodeURIComponent(c.id), "redirect_uri=" + encodeURIComponent(redirectUri()), "response_type=code",
    "scope=" + encodeURIComponent(SCOPE_OA), "access_type=offline", "prompt=consent", "include_granted_scopes=true", "state=" + encodeURIComponent(state)
  ].join("&");
}
// Đổi mã Google trả về lấy quyền truy cập dài hạn và lưu lại
async function completeOAuth(code, byEmail) {
  const c = oauthClient();
  if (!c) throw new Error(missingText());
  if (!code) throw new Error("Thiếu mã xác nhận từ Google.");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=authorization_code&code=" + encodeURIComponent(code) + "&client_id=" + encodeURIComponent(c.id) + "&client_secret=" + encodeURIComponent(c.secret) + "&redirect_uri=" + encodeURIComponent(redirectUri()) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google từ chối mã xác nhận (" + (j.error_description || j.error || r.status) + ").");
  const prev = await getOauth();
  const refresh = j.refresh_token || (prev && prev.refresh_token);
  if (!refresh) throw new Error("Google không trả về quyền dài hạn. Hãy thử kết nối lại.");
  let account = "";
  try { const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + j.access_token } }); const uj = await u.json(); account = String(uj.email || ""); } catch (e) {}
  await store.put(OA_KEY, { refresh_token: refresh, account, folderId: "", connectedAt: Date.now(), by: String(byEmail || "") });
  cached = { key: "oa", token: j.access_token, exp: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
  return { account };
}
async function disconnect() {
  const o = await getOauth();
  if (o && o.refresh_token) { try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(o.refresh_token), { method: "POST" }); } catch (e) {} }
  await store.put(OA_KEY, null);
  cached = { key: "", token: "", exp: 0 };
}

// Thư mục đích: tài khoản dịch vụ dùng GDRIVE_FOLDER_ID; đăng nhập Google thì tự tạo "Kết quả kiểm tra" trong Drive của người đó
async function targetFolder(m, t) {
  if (m === "service") return folderId();
  const o = await getOauth();
  if (o && o.folderId) {
    const r = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(o.folderId) + "?fields=id,trashed", { headers: { Authorization: "Bearer " + t } });
    if (r.ok) { const f = await r.json(); if (!f.trashed) return o.folderId; }
  }
  const r = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }) });
  if (!r.ok) throw new Error(await apiErr(r));
  const f = await r.json();
  await store.put(OA_KEY, Object.assign({}, o, { folderId: f.id }));
  return f.id;
}

async function status() {
  const oa = !!oauthClient(), m = await mode();
  if (!m) return { configured: false, oauthAvailable: oa, error: missingText() };
  try {
    const t = await getToken(m);
    if (m === "oauth") {
      const o = await getOauth();
      let folder = null;
      if (o && o.folderId) { const r = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(o.folderId) + "?fields=id,name,webViewLink,trashed", { headers: { Authorization: "Bearer " + t } }); if (r.ok) { const f = await r.json(); if (!f.trashed) folder = { name: f.name, link: f.webViewLink || "" }; } }
      return { configured: true, ok: true, mode: "oauth", oauthAvailable: oa, account: o && o.account || "", folder: folder || { name: FOLDER_NAME + " (sẽ tạo khi lưu lần đầu)", link: "" } };
    }
    const r = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(folderId()) + "?fields=id,name,webViewLink,mimeType&supportsAllDrives=true", { headers: { Authorization: "Bearer " + t } });
    if (!r.ok) return { configured: true, ok: false, mode: "service", oauthAvailable: oa, error: await apiErr(r), serviceAccount: loadKey().email };
    const f = await r.json();
    return { configured: true, ok: true, mode: "service", oauthAvailable: oa, folder: { name: f.name, link: f.webViewLink || "" }, serviceAccount: loadKey().email };
  } catch (e) { return { configured: !!(await mode()), ok: false, oauthAvailable: oa, error: String(e && e.message || e), needConnect: oa && !(await mode()) }; }
}

// Tải một file lên thư mục đích. convert=true: file Excel được đổi thành Google Sheets.
async function upload({ name, buffer, mime, convert }) {
  const m = await mode();
  if (!m) throw new Error(missingText());
  const t = await getToken(m);
  const parent = await targetFolder(m, t);
  const meta = { name: String(name || "file").slice(0, 150), parents: [parent] };
  if (convert) meta.mimeType = SHEET_MIME;
  const bd = "kt" + crypto.randomBytes(8).toString("hex");
  const body = Buffer.concat([
    Buffer.from("--" + bd + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + bd + "\r\nContent-Type: " + (mime || XLSX_MIME) + "\r\n\r\n"),
    buffer, Buffer.from("\r\n--" + bd + "--")
  ]);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink", {
    method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "multipart/related; boundary=" + bd }, body });
  if (!r.ok) throw new Error(await apiErr(r));
  const f = await r.json();
  return { id: f.id, name: f.name, link: f.webViewLink || ("https://drive.google.com/file/d/" + f.id + "/view") };
}

module.exports = { ready, mode, status, upload, authUrl, completeOAuth, disconnect, oauthClient, redirectUri, XLSX_MIME, _reset: () => { cached = { key: "", token: "", exp: 0 }; } };

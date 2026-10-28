// Lưu file lên Google Drive bằng TÀI KHOẢN DỊCH VỤ (service account), không cần người dùng đăng nhập Google.
// Cấu hình trên Azure (Application settings):
//   GOOGLE_SERVICE_ACCOUNT_JSON : nội dung file khoá JSON của tài khoản dịch vụ (dán nguyên JSON, hoặc mã hoá base64)
//   GDRIVE_FOLDER_ID            : ID thư mục Drive nhận file (đã chia sẻ quyền "Người chỉnh sửa" cho email của tài khoản dịch vụ)
// Khuyến nghị dùng Drive chung (Shared drive) vì tài khoản dịch vụ không có dung lượng Drive riêng.
const crypto = require("crypto");

const SCOPE = "https://www.googleapis.com/auth/drive";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
let cached = { token: "", exp: 0 };

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
function configured() { return !!(loadKey() && folderId()); }
function missingText() {
  const m = [];
  if (!loadKey()) m.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!folderId()) m.push("GDRIVE_FOLDER_ID");
  return m.length ? "Chưa cấu hình Google Drive trên máy chủ (thiếu " + m.join(", ") + ")." : "";
}
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;
  const k = loadKey();
  if (!k) throw new Error(missingText());
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: k.email, scope: SCOPE, aud: k.tokenUri, iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign("RSA-SHA256").update(head + "." + claim).sign(k.key));
  const r = await fetch(k.tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + sig });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Không xác thực được với Google (" + (j.error_description || j.error || r.status) + "). Kiểm tra lại khoá tài khoản dịch vụ.");
  cached = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cached.token;
}

async function apiErr(r) {
  const j = await r.json().catch(() => ({}));
  const e = j && j.error || {}, msg = e.message || ("HTTP " + r.status), reason = e.errors && e.errors[0] && e.errors[0].reason || "";
  if (reason === "storageQuotaExceeded") return "Tài khoản dịch vụ không có dung lượng Drive. Hãy dùng thư mục trong Drive chung (Shared drive) và thêm email tài khoản dịch vụ làm thành viên.";
  if (r.status === 404) return "Không thấy thư mục Drive. Kiểm tra GDRIVE_FOLDER_ID và đã chia sẻ thư mục cho email của tài khoản dịch vụ chưa.";
  if (r.status === 403) return "Tài khoản dịch vụ chưa có quyền ghi vào thư mục (" + msg + "). Hãy chia sẻ thư mục với quyền Người chỉnh sửa.";
  return msg;
}

// Thông tin thư mục đích (để quản trị kiểm tra cấu hình đúng chưa)
async function status() {
  if (!configured()) return { configured: false, error: missingText() };
  try {
    const t = await getToken();
    const r = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(folderId()) + "?fields=id,name,webViewLink,mimeType&supportsAllDrives=true", { headers: { Authorization: "Bearer " + t } });
    if (!r.ok) return { configured: true, ok: false, error: await apiErr(r), serviceAccount: loadKey().email };
    const f = await r.json();
    return { configured: true, ok: true, folder: { name: f.name, link: f.webViewLink || "" }, serviceAccount: loadKey().email };
  } catch (e) { return { configured: true, ok: false, error: String(e && e.message || e) }; }
}

// Tải một file lên thư mục đích. convert=true: file Excel được đổi thành Google Sheets.
async function upload({ name, buffer, mime, convert }) {
  if (!configured()) throw new Error(missingText());
  const t = await getToken();
  const meta = { name: String(name || "file").slice(0, 150), parents: [folderId()] };
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

module.exports = { configured, status, upload, XLSX_MIME, _reset: () => { cached = { token: "", exp: 0 }; } };

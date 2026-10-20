// Nhật ký thao tác của QUẢN TRỊ VIÊN và QUẢN LÍ trên hệ thống kiểm tra.
// - Chỉ thêm, không sửa/xoá: mỗi thao tác là MỘT bản ghi riêng (kt/audit/YYYY/MM/DD/<thời điểm>-<ngẫu nhiên>.json),
//   nên nhiều người thao tác cùng lúc không ghi đè mất dòng nào. Không có API xoá nhật ký.
// - Không bao giờ ghi mật khẩu, ảnh chụp hay nội dung đáp án vào nhật ký.
// - Lỗi khi ghi nhật ký không được làm hỏng thao tác chính.
const crypto = require("crypto");
const store = require("./store");
const { isAdmin } = require("./config");
const { userFromReq } = require("./session");
const quiz = require("./quiz");
const device = require("./device");

const PREFIX = "kt/audit/";
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n || 120);
const vnDay = (ts) => new Date(ts + 7 * 3600e3).toISOString().slice(0, 10);

async function write(entry) {
  try {
    const ts = Date.now();
    const key = PREFIX + vnDay(ts).replace(/-/g, "/") + "/" + String(ts).padStart(14, "0") + "-" + crypto.randomBytes(4).toString("hex") + ".json";
    await store.put(key, Object.assign({ ts }, entry));
  } catch (e) { /* bỏ qua: nhật ký lỗi không chặn thao tác chính */ }
}

async function readDay(day, max) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return { items: [], total: 0 };
  const names = (await store.list(PREFIX + day.replace(/-/g, "/") + "/")).sort().reverse();
  const pick = names.slice(0, max || 3000), out = [];
  for (let i = 0; i < pick.length; i += 25) {
    const part = await Promise.all(pick.slice(i, i + 25).map((n) => store.get(n).catch(() => null)));
    part.forEach((x) => { if (x) out.push(x); });
  }
  return { items: out, total: names.length };
}

function client(req) {
  const ua = s(((req && req.headers) || {})["user-agent"], 400);
  const d = device.capture({ headers: { "user-agent": ua } }, {}, "");
  return { ip: device.ipOf(req), dev: [d.type, d.os, d.browser].filter(Boolean).join(" · ") };
}

// ---------- Danh mục thao tác: nhãn tiếng Việt + loại ----------
// kind: change (thay đổi dữ liệu) | read (xem dữ liệu) | auth (đăng nhập/đăng xuất) | export (xuất file, in, AI) | denied (bị từ chối)
const A = {
  admin: {
    GET: {
      questions: ["Xem ngân hàng đề", "read"], questionsBackup: ["Xem bản sao lưu ngân hàng đề", "read"], deleteAllPreview: ["Mở bước xoá toàn bộ ngân hàng đề", "read"],
      viewers: ["Xem danh sách quản lí", "read"], candidates: ["Xem danh sách thí sinh", "read"], settings: ["Xem cài đặt", "read"],
      results: ["Xem bảng kết quả", "read"], result: ["Xem chi tiết bài làm (ảnh, thiết bị, vị trí)", "read"], dashboard: ["Xem dashboard đánh giá", "read"],
      audit: ["Xem nhật ký thao tác", "read"]
    },
    POST: {
      saveQuestion: ["Lưu câu hỏi", "change"], addQuestions: ["Thêm câu hỏi hàng loạt", "change"], deleteQuestion: ["Xoá câu hỏi", "change"],
      deleteAllQuestions: ["XOÁ TOÀN BỘ ngân hàng đề của kỳ", "change"], copyQuestions: ["Sao chép đề sang kỳ khác", "change"], moveQuestions: ["Chuyển câu hỏi sang kỳ khác", "change"], restoreQuestions: ["Khôi phục ngân hàng đề", "change"],
      saveViewer: ["Cấp / sửa quyền quản lí", "change"], setViewerPassword: ["Đặt mật khẩu cho quản lí", "change"], deleteViewer: ["Thu hồi quyền quản lí", "change"],
      addCandidates: ["Thêm / cập nhật thí sinh", "change"], deleteCandidate: ["Xoá thí sinh", "change"], resetAttempt: ["Cho làm lại (xoá kết quả kỳ)", "change"],
      saveSettings: ["Đổi cài đặt", "change"], assignPeriod: ["Gắn kỳ cho bài chưa có kỳ", "change"]
    }
  },
  viewer: {
    GET: {
      me: ["Mở trang quản lí", "read"], employees: ["Xem danh sách nhân viên", "read"], employee: ["Xem lịch sử sửa thông tin", "read"],
      paper: ["Xem bài làm", "read"], photo: ["Xem ảnh xác nhận", "read"], profile: ["Xem hồ sơ kiểm tra", "read"]
    },
    POST: {
      addEmployee: ["Thêm nhân viên", "change"], updateEmployee: ["Sửa thông tin nhân viên", "change"],
      confirmEmployee: ["Xác nhận thông tin nhân viên", "change"], deleteEmployee: ["Xoá nhân viên", "change"]
    }
  }
};
// Sự kiện phía trình duyệt (không đi qua API dữ liệu) được phép ghi
const EVENTS = {
  exportExcel: "Tải file Excel", exportCsv: "Tải file CSV", printPaper: "In / lưu PDF bài làm",
  aiProfile: "Dùng AI phân tích hồ sơ nhân viên", aiAsk: "Hỏi trợ lí AI tìm dữ liệu", copyList: "Sao chép danh sách chưa làm bài"
};

const SEGN = { both: "Cả hai ngành", gia_dung: "Gia dụng", may_loc: "Máy lọc nước" };
const SKEYS = ["examTitle", "shareTitle", "examPeriod", "questionCount", "bothGiaDungCount", "secondsPerQuestion", "passEnabled", "passScore", "allowRetake",
  "complianceEnabled", "complianceHighMin", "complianceMidMin", "complianceLowMin"];
const SLABEL = { examTitle: "tên bài", shareTitle: "tiêu đề chia sẻ", examPeriod: "kỳ hiện tại", questionCount: "số câu", bothGiaDungCount: "số câu gia dụng (cả hai ngành)",
  secondsPerQuestion: "giây mỗi câu", passEnabled: "bật ngưỡng đạt", passScore: "ngưỡng đạt", allowRetake: "cho làm lại", complianceEnabled: "bật điểm tuân thủ",
  complianceHighMin: "mốc 20 điểm", complianceMidMin: "mốc 15 điểm", complianceLowMin: "mốc 10 điểm" };

// Đọc trạng thái TRƯỚC khi thao tác (để ghi được "từ ... thành ...")
async function before(area, op, b) {
  try {
    const code = quiz.normCode(b.code);
    if (op === "saveSettings") return { settings: await quiz.getSettings() };
    if (["updateEmployee", "deleteEmployee", "confirmEmployee", "resetAttempt", "deleteCandidate"].indexOf(op) >= 0) {
      const c = (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === code);
      return { cand: c ? { code: c.code, name: c.name || "", email: c.email || "", segment: c.segment || "", manager: c.manager || "" } : null };
    }
    if (op === "deleteQuestion") { const q = (await quiz.getQuestions()).find((x) => x.id === b.id); return { q: q ? s(q.text, 100) : "" }; }
    if (op === "deleteAllQuestions") return { n: (await quiz.getQuestions()).length };
    if (op === "saveViewer" || op === "deleteViewer") { const v = await quiz.findViewer(b.email); return { viewer: v ? { scopes: v.scopes || [] } : null }; }
  } catch (e) { /* bỏ qua */ }
  return {};
}

function details(area, op, q, b, res, pre) {
  const r = (res && res.body) || {}, d = {};
  const cand = pre.cand;
  switch (op) {
    case "employees": d.period = r.period != null ? r.period : q.period; d.count = Array.isArray(r.employees) ? r.employees.length : undefined; break;
    case "results": case "dashboard": d.period = q.period || (r.period || "tất cả các kỳ"); if (Array.isArray(r.results)) d.count = r.results.length; break;
    case "paper": case "photo": case "profile": case "employee": d.code = q.code; if (q.id) d.attempt = q.id; if (q.period != null && op === "photo") d.period = q.period; break;
    case "result": d.attempt = q.id; if (r.attempt) { d.code = r.attempt.code; d.name = r.attempt.name; d.period = r.attempt.period || ""; } break;
    case "audit": d.day = q.day; break;
    case "saveQuestion": { const qq = b.question || {}; d.question = s(qq.text, 100); if (qq.id) d.id = qq.id; if (typeof qq.period === "string") d.period = qq.period || "chưa gắn kỳ"; break; }
    case "addQuestions": d.period = b.period; d.added = r.added; d.skipped = r.skipped; break;
    case "copyQuestions": case "moveQuestions": d.from = b.from || "chưa gắn kỳ"; d.to = b.to; d.added = r.added; d.skipped = r.skipped; d.moved = r.moved; break;
    case "deleteQuestion": d.id = b.id; d.question = pre.q; break;
    case "deleteAllQuestions": d.period = typeof b.period === "string" ? (b.period || "chưa gắn kỳ") : "mọi kỳ"; d.count = r.deleted != null ? r.deleted : pre.n; break;
    case "restoreQuestions": d.restored = r.restored; break;
    case "saveViewer": d.email = s(b.email, 80); d.scopes = s(Array.isArray(b.scopes) ? b.scopes.join("; ") : b.scopes, 200); if (pre.viewer) d.before = s((pre.viewer.scopes || []).join("; "), 200); d.created = !!r.created; break;
    case "setViewerPassword": d.email = s(b.email, 80); break; // KHÔNG ghi mật khẩu
    case "deleteViewer": d.email = s(b.email, 80); if (pre.viewer) d.scopes = s((pre.viewer.scopes || []).join("; "), 200); break;
    case "addCandidates": d.rows = Array.isArray(b.rows) && b.rows.length ? b.rows.length : (typeof b.text === "string" ? b.text.split("\n").filter(Boolean).length : undefined); d.added = r.added; d.updated = r.updated; break;
    case "deleteCandidate": case "deleteEmployee": d.code = b.code; if (cand) { d.name = cand.name; d.email = cand.email; d.manager = cand.manager; } break;
    case "resetAttempt": d.code = b.code; d.period = typeof b.period === "string" ? (b.period || "chưa gắn kỳ") : "mọi kỳ"; d.removed = r.removed; if (cand) d.name = cand.name; break;
    case "assignPeriod": d.period = b.period; d.assigned = r.assigned; break;
    case "saveSettings": {
      const a = pre.settings || {}, n = r.settings || {}, ch = [];
      SKEYS.forEach((k) => { if (n[k] !== undefined && String(a[k]) !== String(n[k])) ch.push(SLABEL[k] + ": " + s(a[k], 40) + " → " + s(n[k], 40)); });
      d.changes = ch.length ? ch.join("; ") : "không đổi"; break;
    }
    case "addEmployee": d.code = s(b.code, 40); d.name = s(b.name, 80); d.email = s(b.email, 80); if (b.scope) d.manager = s(b.scope, 80); break;
    case "updateEmployee": {
      d.code = b.code; if (cand) d.name = cand.name;
      const ch = [];
      if (cand) {
        if (b.name != null && s(b.name, 80) !== cand.name) ch.push("họ tên: " + cand.name + " → " + s(b.name, 80));
        if (b.email != null && s(b.email, 80).toLowerCase() !== String(cand.email).toLowerCase()) ch.push("email: " + cand.email + " → " + s(b.email, 80));
        if (b.segment != null && quiz.normSegment(b.segment) !== quiz.normSegment(cand.segment)) ch.push("nhóm ngành: " + (SEGN[quiz.normSegment(cand.segment)] || cand.segment) + " → " + (SEGN[quiz.normSegment(b.segment)] || b.segment));
      }
      d.changes = r.unchanged ? "không đổi" : ch.join("; "); break;
    }
    case "confirmEmployee": d.code = b.code; if (cand) { d.name = cand.name; d.email = cand.email; } break;
  }
  Object.keys(d).forEach((k) => { if (d[k] === undefined || d[k] === "") delete d[k]; else if (typeof d[k] === "string") d[k] = s(d[k], 300); });
  return d;
}

// Tên hiển thị của người thao tác (tra theo danh sách quản lí, nhớ tạm 5 phút)
const _names = new Map();
async function nameOf(email, fallback) {
  const k = String(email || "").toLowerCase(), hit = _names.get(k);
  if (hit && Date.now() - hit.at < 300000) return hit.name;
  let n = s(fallback, 80);
  try { const v = await quiz.findViewer(k); if (v && v.name) n = s(v.name, 80); } catch (e) {}
  if (!n && isAdmin(k)) n = "Quản trị viên";
  _names.set(k, { name: n, at: Date.now() }); return n;
}

// Bọc một hàm API: chạy thao tác, rồi ghi nhật ký theo kết quả thực tế.
function wrap(handler, area) {
  return async function (context, req) {
    const method = String(req.method || "GET").toUpperCase();
    const q = req.query || {}, b = (req.body && typeof req.body === "object") ? req.body : {};
    const op = method === "GET" ? String(q.op || "") : String(b.op || "");
    const u = (() => { try { return userFromReq(req); } catch (e) { return null; } })();
    // Sự kiện phía trình duyệt: chỉ ghi, không chạy thao tác nào
    if (method === "POST" && op === "logEvent") {
      if (!u || !u.email) { context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: { ok: false } }; return; }
      const viewer = isAdmin(u.email) ? null : await quiz.findViewer(u.email).catch(() => null);
      if (!isAdmin(u.email) && !viewer) { context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { ok: false } }; return; }
      const ev = String(b.event || "");
      if (EVENTS[ev]) {
        const det = {}; ["period", "code", "count", "attempt"].forEach((k) => { if (b[k] != null && b[k] !== "") det[k] = s(b[k], 60); });
        await write(Object.assign({ area, role: isAdmin(u.email) ? "admin" : "manager", by: s(u.email, 120).toLowerCase(), name: await nameOf(u.email, u.name),
          op: ev, label: EVENTS[ev], kind: "export", status: 200, ok: true, details: det }, client(req)));
      }
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true } }; return;
    }
    const meta = (A[area] && A[area][method] && A[area][method][op]) || null;
    const pre = meta && meta[1] === "change" ? await before(area, op, b) : {};
    await handler(context, req);
    try {
      if (!u || !u.email || !op) return;           // chưa đăng nhập: không có người để ghi
      const res = context.res || {}, status = res.status || 200;
      if (status === 401) return;
      const admin = isAdmin(u.email);
      const label = meta ? meta[0] : (method === "GET" ? "Xem: " : "Thao tác: ") + s(op, 40);
      const kind = status === 403 ? "denied" : (meta ? meta[1] : (method === "GET" ? "read" : "change"));
      const err = status >= 400 && res.body && res.body.error ? s(res.body.error, 200) : undefined;
      await write(Object.assign({ area, role: admin ? "admin" : "manager", by: s(u.email, 120).toLowerCase(), name: await nameOf(u.email, u.name),
        op: s(op, 40), label, kind, status, ok: status < 400, error: err, details: details(area, op, q, b, res, pre) }, client(req)));
    } catch (e) { /* bỏ qua */ }
  };
}

// Đăng nhập / đăng xuất: chỉ ghi cho quản trị viên và quản lí của hệ thống kiểm tra
async function isStaff(email) {
  if (!email) return null;
  if (isAdmin(email)) return "admin";
  try { return (await quiz.findViewer(email)) ? "manager" : null; } catch (e) { return null; }
}
async function auth(req, email, op, ok, extra) {
  const role = await isStaff(email); if (!role) return;
  const L = { login: "Đăng nhập", login_fail: "Đăng nhập thất bại", logout: "Đăng xuất" };
  await write(Object.assign({ area: "auth", role, by: s(email, 120).toLowerCase(), name: await nameOf(email, ""), op, label: L[op] || op, kind: ok ? "auth" : "denied", status: ok ? 200 : 401, ok, details: extra || {} }, client(req)));
}

module.exports = { wrap, write, readDay, auth, vnDay, EVENTS };

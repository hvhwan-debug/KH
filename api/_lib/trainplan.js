// KẾ HOẠCH ĐÀO TẠO THEO THÁNG (AI lập kế hoạch đào tạo hàng tháng).
// Quy trình: DỮ LIỆU ĐẦU VÀO → PHÂN TÍCH NĂNG LỰC → KHOẢNG CÁCH → ƯU TIÊN → GIẢI PHÁP → KẾ HOẠCH → ĐÁNH GIÁ HIỆU QUẢ (trainstat.js).
//  - Dữ liệu năng lực: hồ sơ năng lực toàn hệ thống (hrcompetency.js) — kết quả mọi bài kiểm tra theo mảng năng lực, theo vị trí.
//  - KHUNG NĂNG LỰC yêu cầu theo vị trí do QUẢN TRỊ VIÊN khai báo (kt/trainplan-framework.json). Hệ thống KHÔNG tự đặt điểm yêu cầu:
//    vị trí chưa có khung thì chỉ hiển thị năng lực thực tế và báo "chưa có yêu cầu" (không kết luận đạt / chưa đạt). SUGGESTED chỉ là gợi ý để điền sẵn vào ô nhập.
//  - Khoảng cách = yêu cầu − thực tế → 4 mức: Đáp ứng tốt / Cần cải thiện / Thiếu hụt đáng kể / Ưu tiên đào tạo.
//  - Ưu tiên chấm theo 5 yếu tố: mức thiếu hụt, ảnh hưởng kinh doanh (kết quả bán), tính cấp thiết (mục tiêu / chiến lược / khuyến mại / sản phẩm trọng tâm),
//    số người bị ảnh hưởng, khả năng tổ chức (nguồn lực). Yếu tố chưa có dữ liệu thì bỏ khỏi điểm chứ không giả định.
//  - Lịch: rải theo tuần (không dồn cuối tháng), không trùng ngày, tôn trọng ngày không tổ chức / số buổi tối đa mỗi tuần do quản trị viên khai báo.
//  - AI chỉ nhận số liệu tổng hợp ẩn danh theo vị trí (không tên, không mã nhân viên, không tên giảng viên); kết quả được kiểm lại ở máy chủ.
//  - Không tự lưu: lập xong chỉ trả về để quản trị viên xem / sửa / lưu nháp / lưu chính thức. Mỗi lần lưu giữ lại phiên bản cũ (khôi phục được).
//  - Mỗi tháng một tệp kt/trainplan/YYYY-MM.json trong kho lưu trữ (KHÔNG để số liệu nhân sự trong repo vì repo công khai).
const crypto = require("crypto");
const store = require("./store");
const CTX = require("./hrcontext");
const llm = require("./llm");

const PREFIX = "kt/trainplan/", BIZ = "kt/trainbiz/", FW_KEY = "kt/trainplan-framework.json", MONTH = /^\d{4}-(0[1-9]|1[0-2])$/, MAX_ROWS = 60, MAX_HISTORY = 10;
const DEFAULT_OWNER = "ĐTKDGT", DEFAULT_FREQ = "1 lần/tháng hoặc khi có yêu cầu", DEFAULT_METHOD = "Đào tạo trực tuyến + Giải case", DEFAULT_DURATION = "90 phút";
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 200);
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const uniq = (v, i, a) => a.indexOf(v) === i;

// Mảng năng lực (khớp hrcompetency.js): mk thị trường & đối thủ · po chính sách/quy trình · sk kỹ năng bán & tư vấn · n1 sản phẩm ngành 1 · n2 sản phẩm ngành 2 · sp sản phẩm chung
const AREA_NAME = { mk: "Thị trường & đối thủ", po: "Chính sách, quy trình & tiêu chuẩn", sk: "Kỹ năng bán hàng & tư vấn", n1: "Sản phẩm ngành 1 · Máy lọc nước", n2: "Sản phẩm ngành 2 · Điện gia dụng", sp: "Kiến thức sản phẩm (chung)" };
// GỢI Ý điền sẵn cho ô nhập khung năng lực — KHÔNG phải chuẩn của công ty và KHÔNG được áp dụng cho tới khi quản trị viên lưu.
const SUGGESTED = {
  GT1: { n1: 75, sk: 70, po: 65, mk: 65 }, GT2: { n2: 75, sk: 70, po: 65, mk: 65 }, SR: { sp: 70, sk: 70, po: 65 },
  PC: { sp: 75, sk: 75, po: 65, n1: 70, n2: 70 }, PG: { sp: 65, sk: 60, po: 60, n1: 60, n2: 60 }, ASM: { po: 75, mk: 70, sk: 70 }, RSM: { mk: 75, po: 75 }, OTHER: { sp: 65 }
};
const SHORT = { GT1: "SR 1", GT2: "SR 2", SR: "SR", PC: "PC", PG: "PG", ASM: "ASM", RSM: "RSM", OTHER: "Khác" };
const NGANH = { GT1: "1", GT2: "2", SR: "Chung", PC: "Gia dụng & Thiết bị gia đình", PG: "Chung", ASM: "Chung", RSM: "Chung", OTHER: "Chung" };
const FORMATS = ["Đào tạo trực tuyến", "Đào tạo trực tiếp", "Micro-learning", "Coaching tại điểm bán", "Đào tạo bởi quản lý trực tiếp", "Kiểm tra củng cố kiến thức", "Tự học trên hệ thống"];
const STATUSES = ["Dự kiến", "Đã duyệt", "Đang triển khai", "Hoàn thành", "Hoãn / huỷ"];
const PRIO = ["Ưu tiên rất cao", "Ưu tiên cao", "Ưu tiên trung bình", "Theo dõi và bổ sung sau"];
const prevMonthOf = (m) => { const y = +m.slice(0, 4), mo = +m.slice(5); return mo === 1 ? (y - 1) + "-12" : y + "-" + pad(mo - 1); };
const keyOfLabel = (label) => Object.keys(CTX.AUD).find((k) => CTX.AUD[k] === label) || "OTHER";

// ---------- giờ học: không làm gián đoạn giờ bán của SR, PC ----------
// Chỉ xếp đầu ngày (bắt đầu từ 08:00, kết thúc trước 09:30) hoặc cuối ngày (bắt đầu từ 17:00) — theo ý kiến người phê duyệt.
function durMin(v) { const m = /(\d+(?:[.,]\d+)?)/.exec(String(v || "")); if (!m) return 90; const n = parseFloat(m[1].replace(",", ".")); return /giờ|gio|\d\s*h\b/i.test(String(v)) ? Math.round(n * 60) : Math.round(n); }
function hm(g) { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(g || "")); return m ? +m[1] * 60 + +m[2] : null; }
function timeOk(gio, dur) { const a = hm(gio); if (a == null) return null; return a >= 17 * 60 || (a >= 8 * 60 && a + dur <= 9 * 60 + 30); }
function slotFor(dur) { return dur <= 90 ? "08:00" : "17:15"; }
function fixTimes(rows) { rows.forEach((r) => { if (timeOk(r.gio, durMin(r.thoiLuong)) !== true) r.gio = slotFor(durMin(r.thoiLuong)); }); return rows; }

// ---------- sản phẩm trọng tâm / sản phẩm mới theo vị trí ("PC: M25, BNN") ----------
const PRODUCT_AREAS = ["n1", "n2", "sp"];
function parseFocus(v) {
  const a = Array.isArray(v) ? v : String(v || "").split(/\n+/), by = {};
  a.forEach((x) => {
    let label, prods;
    if (x && typeof x === "object") { label = x.audience || x.short || x.key || ""; prods = Array.isArray(x.products) ? x.products : String(x.products || "").split(/[,;，、]/); }
    else { const m = /^\s*([^:：]+)[:：]\s*(.+)$/.exec(String(x).replace(/^[\s•\-–*]+/, "")); if (!m) return; label = m[1]; prods = m[2].split(/[,;，、]/); }
    const key = Object.keys(SHORT).indexOf(String(label)) >= 0 ? String(label) : CTX.audienceKey(s(label, 40), ""); if (!key || key === "OTHER") return;
    const list = prods.map((p) => s(p, 40)).filter(Boolean), o = by[key] = by[key] || { key, short: SHORT[key], products: [] };
    list.forEach((p) => { if (o.products.map((z) => z.toLowerCase()).indexOf(p.toLowerCase()) < 0 && o.products.length < 6) o.products.push(p); });
  });
  return Object.values(by).filter((f) => f.products.length).slice(0, 8);
}

// ---------- KHUNG NĂNG LỰC yêu cầu theo vị trí: do quản trị viên khai báo ----------
function cleanFramework(min) {
  const out = {};
  Object.keys(min || {}).forEach((k) => { if (!SHORT[k]) return; const m = {}; Object.keys(min[k] || {}).forEach((a) => { if (!AREA_NAME[a]) return; const v = Math.round(Number(min[k][a])); if (isFinite(v) && v >= 1 && v <= 100) m[a] = v; }); if (Object.keys(m).length) out[k] = m; });
  return out;
}
async function getFramework() { const d = await store.get(FW_KEY).catch(() => null); return { min: cleanFramework(d && d.min), updatedAt: (d && d.updatedAt) || 0, by: (d && d.by) || "" }; }
async function saveFramework(min, by) { const d = { v: 1, min: cleanFramework(min), updatedAt: Date.now(), by: String(by || "").toLowerCase() }; await store.put(FW_KEY, d); return d; }

// ---------- mục tiêu kinh doanh, chiến lược, nguồn lực của tháng + kết quả bán ----------
function cleanList(v, max) { const a = Array.isArray(v) ? v : String(v || "").split(/\n+/); return a.map((x) => s(String(x).replace(/^[\s•\-–*]+/, ""), 240)).filter(Boolean).slice(0, max || 8); }
function isoOf(x) { x = String(x || "").trim(); let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x); if (!m && (m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(x))) m = [x, m[3], pad(+m[2]), pad(+m[1])]; if (!m) return ""; const iso = m[1] + "-" + m[2] + "-" + m[3]; return isNaN(Date.parse(iso)) ? "" : iso; }
function cleanResources(r) {
  r = r || {}; const split = (v) => (Array.isArray(v) ? v : String(v || "").split(/[\n,;]+/)), int = (v, lo, hi) => { const n = Math.round(Number(v)); return isFinite(n) && n >= lo && n <= hi ? n : 0; };
  return { trainers: split(r.trainers).map((x) => s(x, 60)).filter(Boolean).filter(uniq).slice(0, 8), formats: split(r.formats).map((x) => s(x, 60)).filter((x) => FORMATS.indexOf(x) >= 0).filter(uniq),
    maxMinutes: int(r.maxMinutes, 30, 240), sessionsPerWeek: int(r.sessionsPerWeek, 1, 20), blockedDates: split(r.blockedDates).map(isoOf).filter(Boolean).filter(uniq).slice(0, 31),
    weekdays: split(r.weekdays).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 6).filter(uniq), budget: s(r.budget, 80) };
}
const hasRes = (r) => !!(r && ((r.trainers || []).length || (r.formats || []).length || r.maxMinutes || r.sessionsPerWeek || (r.blockedDates || []).length || (r.weekdays || []).length || r.budget));
async function getBiz(month) {
  month = s(month, 7); const d = MONTH.test(month) ? await store.get(BIZ + month + ".json").catch(() => null) : null;
  return { month, goals: (d && d.goals) || [], strategy: (d && d.strategy) || [], focus: (d && d.focus) || [], newProducts: (d && d.newProducts) || [], promos: (d && d.promos) || [], difficulties: (d && d.difficulties) || [],
    direction: (d && d.direction) || [], resources: cleanResources(d && d.resources), updatedAt: (d && d.updatedAt) || 0, by: (d && d.by) || "" };
}
async function saveBiz(month, body, by) {
  month = s(month, 7); if (!MONTH.test(month)) throw new Error("Tháng không hợp lệ."); body = body || {};
  const d = { v: 2, month, goals: cleanList(body.goals), strategy: cleanList(body.strategy), focus: parseFocus(body.focus), newProducts: parseFocus(body.newProducts), promos: cleanList(body.promos), difficulties: cleanList(body.difficulties),
    direction: cleanList(body.direction), resources: cleanResources(body.resources), updatedAt: Date.now(), by: String(by || "").toLowerCase() };
  await store.put(BIZ + month + ".json", d); return d;
}
const hasBiz = (b) => !!(b && ((b.goals || []).length || (b.strategy || []).length || (b.focus || []).length || (b.newProducts || []).length || (b.promos || []).length || (b.direction || []).length));
// Kết quả bán toàn đội của tháng gần nhất có dữ liệu (không sau tháng lập kế hoạch nếu có), dùng làm bối cảnh mục tiêu kinh doanh
async function salesContext(month) {
  const names = (await store.list("kt/sales/").catch(() => [])).filter((x) => /\d{4}-\d{2}\.json$/.test(x));
  const docs = (await Promise.all(names.map((x) => store.get(x).catch(() => null)))).filter((d) => d && !d.deleted && Array.isArray(d.rows) && MONTH.test(d.month || "")).sort((a, b) => (a.month < b.month ? -1 : 1));
  if (!docs.length) return null;
  const d = docs.filter((x) => x.month <= month).pop() || docs[docs.length - 1]; let tg = 0, ac = 0; d.rows.forEach((r) => { tg += r.target || 0; ac += r.actual || 0; });
  return { month: d.month, target: Math.round(tg), actual: Math.round(ac), pct: tg > 0 ? r1(100 * ac / tg) : null, elapsed: d.elapsed == null ? null : d.elapsed, people: d.rows.length, sameMonth: d.month === month };
}
const areaOfText = (x) => require("./hrcompetency").areaOf(x);
function bizLink(biz, areaId) { const items = (biz.strategy || []).concat(biz.goals || [], biz.promos || []); return items.find((x) => areaOfText(x) === areaId) || (biz.goals || [])[0] || (biz.strategy || [])[0] || (biz.direction || [])[0] || (biz.promos || [])[0] || ""; }

// ---------- lịch: ngày tổ chức rải theo tuần ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function weekOf(iso) { if (!DATE.test(iso || "")) return 0; const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8), off = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; return Math.floor((d - 1 + off) / 7) + 1; }
// Ngày có thể tổ chức: mặc định T2–T6 (chưa khai báo ngày nghỉ), trừ các ngày quản trị viên khai báo không tổ chức; thứ trong tuần có thể đổi ở nguồn lực
function daysOf(month, res) {
  const y = +month.slice(0, 4), m = +month.slice(5), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), wd = res && res.weekdays && res.weekdays.length ? res.weekdays : [1, 2, 3, 4, 5], blocked = (res && res.blockedDates) || [], out = [];
  for (let d = 1; d <= n; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(), iso = month + "-" + pad(d); if (wd.indexOf(w === 0 ? 7 : w) >= 0 && blocked.indexOf(iso) < 0) out.push(iso); }
  return out;
}
function workdays(month) { return daysOf(month, null); }
// Xếp lịch theo thứ tự ưu tiên (rows đã sắp): tuần sớm trước, mỗi tuần tối đa `cap` buổi, mỗi buổi một ngày riêng. keepValid: giữ ngày đã có nếu hợp lệ và còn chỗ.
function schedule(month, rows, res, keepValid) {
  const days = daysOf(month, res), byWeek = {}; days.forEach((d) => (byWeek[weekOf(d)] = byWeek[weekOf(d)] || []).push(d));
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b), cap = Math.max(1, Math.min((res && res.sessionsPerWeek) || 99, Math.ceil(rows.length / Math.max(1, weeks.length)))), used = {}, count = {}, overflow = [];
  rows.forEach((r) => { r._keep = false; const wk = weekOf(r.thoiGian); if (keepValid && r.thoiGian && days.indexOf(r.thoiGian) >= 0 && !used[r.thoiGian] && (count[wk] || 0) < cap) { used[r.thoiGian] = 1; count[wk] = (count[wk] || 0) + 1; r._keep = true; } });
  rows.forEach((r) => {
    if (r._keep) { delete r._keep; return; } delete r._keep; r.thoiGian = "";
    for (const wk of weeks) { if ((count[wk] || 0) >= cap) continue; const d = byWeek[wk].find((x) => !used[x]); if (!d) continue; r.thoiGian = d; used[d] = 1; count[wk] = (count[wk] || 0) + 1; break; }
    if (!r.thoiGian) overflow.push(r);
  });
  return overflow;
}

// ---------- chấm ưu tiên (5 yếu tố; yếu tố thiếu dữ liệu thì bỏ khỏi điểm) ----------
const WEIGHT = { gap: 0.35, biz: 0.2, urg: 0.2, ppl: 0.15, feas: 0.1 };
function scoreOf(f) { let sum = 0, w = 0; Object.keys(WEIGHT).forEach((k) => { if (f[k] != null) { sum += WEIGHT[k] * f[k]; w += WEIGHT[k]; } }); return w ? Math.round(100 * sum / w) : 0; }
const prioLabel = (sc) => (sc >= 60 ? PRIO[0] : sc >= 40 ? PRIO[1] : sc >= 20 ? PRIO[2] : PRIO[3]);

// ---------- phân tích khoảng cách năng lực ----------
function analyse(data, month, ctx) {
  ctx = ctx || {}; const biz = ctx.biz || {}, res = biz.resources || {}, FW = (ctx.framework && ctx.framework.min) || {}, pick = Array.isArray(ctx.audiences) && ctx.audiences.length ? ctx.audiences : null;
  const fmap = Object.fromEntries((biz.focus || []).map((f) => [f.key, f.products])), nmap = Object.fromEntries((biz.newProducts || []).map((f) => [f.key, f.products]));
  const items = (biz.strategy || []).concat(biz.goals || [], biz.promos || [], biz.direction || []), by = {};
  data.people.forEach((p) => {
    const k = keyOfLabel(p.audience); if (pick && pick.indexOf(k) < 0) return;
    const A = by[k] = by[k] || { key: k, label: CTX.AUD[k], short: SHORT[k], people: 0, tested: 0, idx: [], req: {}, topics: {} };
    A.people++; if (!p.tests) return;
    A.tested++; if (p.index != null) A.idx.push(p.index);
    (p.areas || []).forEach((a) => {
      if (a.offScope || a.n < 4) return;
      (A.req[a.id] = A.req[a.id] || { pcts: [] }).pcts.push(a.pct);
      (a.topics || []).forEach((t) => { const key = a.id + "|" + t.name, T = A.topics[key] = A.topics[key] || { area: a.id, name: t.name, sum: 0, n: 0 }; T.sum += t.pct; T.n++; });
    });
  });
  const cover = {}; ((data.system && data.system.coverage) || []).forEach((c) => { cover[c.area] = c; });
  const audiences = Object.keys(by).map((k) => {
    const A = by[k], grp = (data.audiences || []).find((g) => g.name === A.label) || {}, fw = FW[k] || {}, hasFw = Object.keys(fw).length > 0, ids = hasFw ? Object.keys(fw) : Object.keys(A.req);
    const fp = fmap[k] || [], np = nmap[k] || [], salesAvg = grp.salesAvg == null ? null : grp.salesAvg, bizF = salesAvg == null ? null : Math.min(1, Math.max(0, 100 - salesAvg) / 40);
    const reqs = ids.map((id) => {
      const R = A.req[id], assessed = R ? R.pcts.length : 0, avg = R ? r1(mean(R.pcts)) : null, min = fw[id] == null ? null : fw[id];
      let status, level, gap = null, gapPeople = 0, share = 0;
      if (min == null) { status = "chưa có yêu cầu"; level = "Chưa có yêu cầu"; }
      else if (assessed < 3) { status = "thiếu dữ liệu"; level = "Thiếu dữ liệu"; }
      else {
        gap = r1(min - avg); gapPeople = R.pcts.filter((v) => v < min).length; share = gapPeople / assessed;
        level = gap <= 0 ? "Đáp ứng tốt" : gap <= 10 ? "Cần cải thiện" : gap <= 20 ? "Thiếu hụt đáng kể" : "Ưu tiên đào tạo";
        if (level === "Đáp ứng tốt" && share >= 0.4) level = "Cần cải thiện"; // trung bình đạt nhưng nhiều người dưới ngưỡng
        status = level === "Đáp ứng tốt" ? "đạt" : "cần đào tạo";
      }
      const topics = Object.values(A.topics).filter((t) => t.area === id && t.n >= Math.min(2, assessed || 1)).map((t) => ({ name: t.name, pct: Math.round(t.sum / t.n), people: t.n })).filter((t) => t.pct < 65).sort((a, b) => a.pct - b.pct).slice(0, 3);
      const cv = cover[AREA_NAME[id]] || {}, hits = items.filter((x) => areaOfText(x) === id).concat(PRODUCT_AREAS.indexOf(id) >= 0 && fp.length ? ["Sản phẩm trọng tâm: " + fp.join(", ")] : [], PRODUCT_AREAS.indexOf(id) >= 0 && np.length ? ["Sản phẩm mới: " + np.join(", ")] : []);
      let factors = null, priority = 0, priorityLabel = "";
      if (status === "cần đào tạo") {
        const dur = durMin(DEFAULT_DURATION);
        factors = { gap: r1(Math.max(Math.min(1, gap / 30), share * 0.4)), biz: bizF == null ? null : r1(bizF), urg: hits.length ? 1 : 0, ppl: r1(Math.min(1, 0.5 * Math.min(1, gapPeople / 20) + 0.5 * share)), feas: hasRes(res) ? (res.maxMinutes && dur > res.maxMinutes ? 0.5 : 1) : null };
        priority = scoreOf(factors); priorityLabel = prioLabel(priority);
      }
      return { area: id, areaName: AREA_NAME[id], min, avg, assessed, gap, share: r1(share), gapPeople, level, status, topics, materials: cv.materials == null ? null : cv.materials, questions: cv.questions == null ? null : cv.questions, priority, priorityLabel, factors, strategyHits: hits };
    }).sort((a, b) => b.priority - a.priority);
    return { key: k, label: A.label, short: A.short, nganh: NGANH[k], people: A.people, tested: A.tested, index: r1(mean(A.idx)), salesAvg, below60: grp.below60 || 0, framework: hasFw, bizImpact: bizF == null ? null : r1(bizF),
      needs: CTX.NEEDS[k] || [], reqs, missing: reqs.filter((x) => x.status === "thiếu dữ liệu").length, noReq: reqs.filter((x) => x.status === "chưa có yêu cầu").length,
      categories: (((data.system && data.system.catMap) || {})[A.label] || []).map((c) => ({ name: c.name, n: c.n, area: c.area, areaName: AREA_NAME[c.area] || "Kiến thức chung (không dùng)", manual: !!(ctx.areaMap && ctx.areaMap[CTX.fold(c.name)]) })),
      hard: (ctx.hard && ctx.hard[A.label]) || [], gaps: reqs.filter((x) => x.status === "cần đào tạo").length, reliable: A.tested >= 10, focus: fp, newProducts: np,
      note: hasFw && !reqs.some((x) => x.status === "cần đào tạo") && salesAvg != null && salesAvg < 85 ? "Năng lực đạt yêu cầu nhưng bán TB 3 tháng chỉ " + salesAvg + "%: đào tạo kiến thức chưa phải đòn bẩy chính; nên rà yếu tố ngoài đào tạo (hàng, giá, điểm bán) và coaching tại điểm bán." : "" };
  }).sort((a, b) => b.gaps - a.gaps || b.people - a.people);
  return { month, generatedAt: Date.now(), scope: ctx.months ? Number(ctx.months) : 0, meta: { population: (data.meta && data.meta.population) || data.people.length, tested: (data.meta && data.meta.tested) || 0, catMissing: (data.meta && data.meta.catMissing) || 0 },
    missingTotal: audiences.reduce((n, a) => n + a.missing, 0), noFramework: audiences.filter((a) => !a.framework).map((a) => a.short),
    biz: { goals: biz.goals || [], strategy: biz.strategy || [], focus: biz.focus || [], newProducts: biz.newProducts || [], promos: biz.promos || [], difficulties: biz.difficulties || [], direction: biz.direction || [], resources: res }, sales: ctx.sales || null, prev: ctx.prev || null, audiences };
}

// ---------- chuẩn hoá một dòng kế hoạch ----------
function cleanRow(r, month) {
  r = r || {};
  const nd = Array.isArray(r.noiDung) ? r.noiDung : String(r.noiDung || "").split(/\n+/);
  let date = DATE.test(r.thoiGian || "") ? r.thoiGian : "";
  if (date && (!MONTH.test(date.slice(0, 7)) || isNaN(Date.parse(date)))) date = "";
  const sh = Math.round(Number(r.soHocVien));
  return {
    stt: 0, tuan: weekOf(date), doiTuong: s(r.doiTuong, 40), nganh: s(r.nganh, 60), tenChuongTrinh: s(r.tenChuongTrinh, 160),
    noiDung: nd.map((x) => s(String(x).replace(/^[\s•\-–*]+/, ""), 240)).filter(Boolean).slice(0, 8),
    mucTieu: s(r.mucTieu, 400), soHocVien: isFinite(sh) && sh > 0 ? Math.min(sh, 100000) : 0, hinhThuc: s(r.hinhThuc, 140), phuongPhap: s(r.phuongPhap, 120), thoiLuong: s(r.thoiLuong, 40), phuTrach: s(r.phuTrach, 60),
    uuTien: PRIO.indexOf(r.uuTien) >= 0 ? r.uuTien : "", trangThai: STATUSES.indexOf(r.trangThai) >= 0 ? r.trangThai : "Dự kiến",
    thoiGian: date, gio: hm(r.gio) == null ? "" : String(r.gio), tanSuat: s(r.tanSuat, 100), ghiChu: s(r.ghiChu, 500), coSo: s(r.coSo, 600), mucTieuKd: s(r.mucTieuKd, 300), chiSoDo: s(r.chiSoDo, 500)
  };
}
function cleanRows(rows, month) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Chưa có dòng kế hoạch nào.");
  if (rows.length > MAX_ROWS) throw new Error("Quá nhiều dòng (tối đa " + MAX_ROWS + ").");
  const out = rows.map((r) => cleanRow(r, month)).filter((r) => r.tenChuongTrinh);
  if (!out.length) throw new Error("Mỗi dòng cần có tên chương trình.");
  out.forEach((r, i) => { r.stt = i + 1; });
  return out;
}

// ---------- giải pháp: hình thức & nội dung đào tạo ----------
function restrict(f, allowed) { if (!allowed || !allowed.length) return f; const parts = f.split(" + ").filter((p) => allowed.indexOf(p) >= 0); return parts.length ? parts.join(" + ") : allowed[0]; }
// Chọn hình thức theo bản chất khoảng cách (kiến thức / kỹ năng / chính sách / thị trường), mức thiếu hụt và số người; giới hạn trong các hình thức quản trị viên cho phép (nếu có khai báo)
function formatFor(area, key, gapPeople, level, res, kind) {
  let f;
  if (kind) f = "Đào tạo trực tuyến + Coaching tại điểm bán";
  else if (key === "ASM" || key === "RSM") f = "Đào tạo trực tiếp";
  else if (area === "sk") f = level === "Ưu tiên đào tạo" || level === "Thiếu hụt đáng kể" ? "Đào tạo trực tuyến + Coaching tại điểm bán" : "Đào tạo trực tuyến";
  else if (area === "po") f = "Micro-learning + Kiểm tra củng cố kiến thức";
  else if (area === "mk") f = "Micro-learning";
  else f = gapPeople > 0 && gapPeople <= 5 ? "Tự học trên hệ thống + Kiểm tra củng cố kiến thức" : "Đào tạo trực tuyến + Kiểm tra củng cố kiến thức";
  return restrict(f, res && res.formats);
}
const TPL = {
  sk: { ten: "Kỹ năng tư vấn & xử lý từ chối", nd: ["Khai thác nhu cầu và nhận diện cơ hội bán", "Kỹ thuật tư vấn lợi ích và thuyết phục", "Xử lý các tình huống từ chối thường gặp", "Thực hành chốt đơn qua tình huống thực tế"], pp: "Đào tạo trực tuyến + Giải case" },
  po: { ten: "Chính sách, quy trình & tiêu chuẩn bán hàng", nd: ["Chính sách bán hàng, khuyến mãi và chiết khấu hiện hành", "Quy trình đặt hàng, giao nhận và bảo hành", "Tiêu chuẩn trưng bày và báo cáo tại điểm bán", "Bài tập tình huống áp dụng chính sách"], pp: "Đào tạo trực tuyến + Kiểm tra nhanh" },
  mk: { ten: "Thị trường & đối thủ cạnh tranh", nd: ["Cập nhật tình hình thị trường kênh GT", "So sánh sản phẩm với đối thủ chính", "Cách trình bày lợi thế cạnh tranh với đại lý", "Thảo luận tình huống bị so sánh với đối thủ"], pp: "Đào tạo trực tuyến + Thảo luận nhóm" },
  n1: { ten: "Kiến thức sản phẩm ngành 1 · Máy lọc nước", nd: ["Công nghệ lọc và thông số các dòng máy lọc nước", "Lợi ích sản phẩm theo nhu cầu khách hàng", "Câu hỏi thường gặp và cách trả lời", "Kiểm tra nhanh sau buổi học"], pp: "Đào tạo trực tuyến + Kiểm tra nhanh" },
  n2: { ten: "Kiến thức sản phẩm ngành 2 · Điện gia dụng", nd: ["Tính năng và thông số các nhóm sản phẩm điện gia dụng", "Lợi ích sản phẩm theo nhu cầu khách hàng", "Câu hỏi thường gặp và cách trả lời", "Kiểm tra nhanh sau buổi học"], pp: "Đào tạo trực tuyến + Kiểm tra nhanh" },
  sp: { ten: "Kiến thức sản phẩm", nd: ["Đặc tính, tính năng và lợi ích của nhóm sản phẩm phụ trách", "Phân biệt các dòng máy / model", "Câu hỏi thường gặp và cách trả lời", "Kiểm tra nhanh sau buổi học"], pp: "Đào tạo trực tuyến" }
};
const basis = (a, g) => a.short + " · " + g.areaName + ": TB " + (g.avg == null ? "?" : g.avg) + "% (yêu cầu ≥ " + g.min + "%), " + g.gapPeople + "/" + g.assessed + " người dưới ngưỡng.";
const salesTxt = (a) => (a.salesAvg != null ? "; % hoàn thành chỉ tiêu bán của " + a.short + " (hiện " + a.salesAvg + "%)" : "");
function candidates(an) { const c = []; an.audiences.forEach((a) => a.reqs.forEach((g) => { if (g.status === "cần đào tạo") c.push({ a, g }); })); return c.sort((x, y) => y.g.priority - x.g.priority); }
function gapRow(an, c) {
  const a = c.a, g = c.g, t = TPL[g.area] || TPL.sp, res = an.biz.resources || {}, link = bizLink(an.biz, g.area);
  const hard = (a.hard || []).filter((h) => h.area === g.area).slice(0, 2).map((h) => "Ôn các câu hay sai: " + h.text), weak = g.topics.map((x) => "Củng cố chủ đề yếu: " + x.name + " (TB " + x.pct + "%)");
  return { doiTuong: a.short, nganh: a.nganh, tenChuongTrinh: t.ten + (a.key === "GT1" || a.key === "GT2" ? " · " + a.short : ""), noiDung: hard.concat(weak, t.nd).slice(0, 7),
    mucTieu: "Nâng điểm " + g.areaName.toLowerCase() + " của " + a.short + " từ " + (g.avg == null ? "?" : g.avg) + "% lên tối thiểu " + g.min + "% ở kỳ kiểm tra kế tiếp.",
    soHocVien: g.gapPeople || a.people, hinhThuc: formatFor(g.area, a.key, g.gapPeople, g.level, res), phuongPhap: t.pp, thoiLuong: DEFAULT_DURATION, phuTrach: "", thoiGian: "", tanSuat: DEFAULT_FREQ, uuTien: g.priorityLabel, trangThai: "Dự kiến",
    mucTieuKd: link ? "Góp phần vào: " + link : "",
    chiSoDo: "Điểm mảng " + g.areaName.toLowerCase() + " của " + a.short + " ≥ " + g.min + "% ở kỳ kiểm tra kế tiếp (hiện " + g.avg + "%); bài kiểm tra củng cố sau buổi học; quản lý xác nhận việc áp dụng tại điểm bán" + salesTxt(a),
    ghiChu: (g.strategyHits.length ? "Ưu tiên chiến lược. " : "") + (g.materials === 0 ? "Chưa có học liệu cho mảng này: cần bổ sung học liệu trước buổi học." : g.materials ? "Đã có " + g.materials + " học liệu liên quan để học viên ôn." : ""),
    coSo: basis(a, g) + " Mức: " + g.level + " (khoảng cách " + g.gap + " điểm). Điểm ưu tiên " + g.priority + "/100.", _score: g.priority, _area: g.area };
}
function focusScore(an, f) {
  const a = an.audiences.find((x) => x.key === f.key) || { people: 0, bizImpact: null }, res = an.biz.resources || {};
  const sc = scoreOf({ gap: null, biz: a.bizImpact == null ? null : a.bizImpact, urg: 1, ppl: Math.min(1, (a.people || 0) / 50), feas: hasRes(res) ? 1 : null });
  return { sc: Math.max(sc, 40), label: PRIO.indexOf(prioLabel(sc)) <= 1 ? prioLabel(sc) : PRIO[1], people: a.people || 0 }; // chỉ đạo của lãnh đạo: tối thiểu "Ưu tiên cao"
}
// Chương trình riêng cho sản phẩm trọng tâm / sản phẩm mới của một vị trí (dù chưa có khoảng cách năng lực): nội dung gắn thực tế bán hàng, không nêu thông số tự đặt
function focusRow(an, f, kind) {
  const a = an.audiences.find((x) => x.key === f.key) || { key: f.key, short: f.short, nganh: NGANH[f.key], salesAvg: null, people: 0, bizImpact: null }, P = f.products.join(", "), isNew = kind === "new", res = an.biz.resources || {};
  const fs = focusScore(an, f), sc = fs.sc, lb = fs.label;
  const goal = (an.biz.goals || [])[0] || (an.biz.strategy || [])[0] || (an.biz.direction || [])[0] || "";
  return { doiTuong: a.short, nganh: a.nganh, tenChuongTrinh: (isNew ? "Triển khai sản phẩm mới: " : "Sản phẩm trọng tâm tháng: ") + P + " · " + a.short,
    noiDung: isNew ? ["Giới thiệu " + P + ": đặc điểm, lợi ích chính và nhóm khách hàng phù hợp (theo tài liệu sản phẩm chính thức)", "Điểm khác biệt so với sản phẩm hiện có và giải pháp khách đang cân nhắc", "Chính sách, quy trình bán đi kèm (theo thông báo chính thức)", "Thực hành tư vấn và xử lý câu hỏi thường gặp tại điểm bán"]
      : ["Đặc điểm, lợi ích chính và nhóm khách hàng phù hợp của " + P + " (theo tài liệu sản phẩm chính thức)", "Kỹ thuật tư vấn và so sánh với giải pháp khách đang cân nhắc", "Xử lý các câu hỏi và từ chối thường gặp khi bán " + P, "Thực hành tình huống thực tế tại điểm bán; chia sẻ ca bán thành công trong tháng"],
    mucTieu: isNew ? a.short + " nắm vững và tư vấn được " + P + " ngay trong tháng triển khai." : a.short + " tư vấn và bán tốt " + P + " trong tháng, tăng số lượng bán nhóm sản phẩm trọng tâm.",
    soHocVien: a.people || 0, hinhThuc: formatFor("sp", f.key, 0, "", res, kind || "focus"), phuongPhap: "Đào tạo trực tuyến + Giải case thực tế", thoiLuong: DEFAULT_DURATION, phuTrach: "", thoiGian: "", tanSuat: DEFAULT_FREQ, uuTien: lb, trangThai: "Dự kiến",
    ghiChu: (isNew ? "Theo kế hoạch triển khai sản phẩm mới của tháng." : "Theo chỉ đạo sản phẩm trọng tâm của tháng.") + " Gửi nội dung cho người phê duyệt trước buổi học.",
    mucTieuKd: goal ? "Góp phần vào: " + goal : "", chiSoDo: "Số lượng và doanh số bán " + P + " của " + a.short + (a.salesAvg != null ? "; % hoàn thành chỉ tiêu bán (hiện " + a.salesAvg + "%)" : "") + " theo báo cáo bán hàng; bài kiểm tra củng cố sau buổi học",
    coSo: (isNew ? "Sản phẩm mới cần triển khai cho " : "Sản phẩm trọng tâm của ") + a.short + " do quản trị viên khai báo: " + P + ". Điểm ưu tiên " + sc + "/100.", _score: sc, _area: "" };
}
function rulePlan(an, opt) {
  opt = opt || {}; const max = Math.min(opt.max || 8, 12), cand = candidates(an), watch = [];
  const keep = cand.filter((c) => c.g.priorityLabel !== PRIO[3]), low = cand.filter((c) => c.g.priorityLabel === PRIO[3]);
  keep.slice(max).concat(low).forEach((c) => watch.push({ audience: c.a.short, program: (TPL[c.g.area] || TPL.sp).ten + " · " + c.a.short, reason: (c.g.priorityLabel === PRIO[3] ? "Mức ưu tiên thấp (" + c.g.priority + "/100)" : "Vượt số chương trình tối đa trong tháng") + " — " + basis(c.a, c.g), priority: c.g.priorityLabel }));
  const rows = keep.slice(0, max).map((c) => gapRow(an, c)).concat((an.biz.focus || []).map((f) => focusRow(an, f, "focus")), (an.biz.newProducts || []).map((f) => focusRow(an, f, "new")));
  return { rows: completeRows(an, rows, watch), watch };
}
// Đảm bảo mỗi vị trí có sản phẩm trọng tâm / sản phẩm mới đều có chương trình riêng; điền các cột còn thiếu; xếp lịch theo tuần; chương trình không xếp được lịch chuyển sang "theo dõi"
function completeRows(an, rows, watch) {
  const res = an.biz.resources || {};
  [["focus", "focus"], ["newProducts", "new"]].forEach((p) => (an.biz[p[0]] || []).forEach((f) => {
    const has = rows.some((r) => r.doiTuong === f.short && f.products.some((x) => (r.tenChuongTrinh + " " + (r.noiDung || []).join(" ")).toLowerCase().indexOf(x.toLowerCase()) >= 0));
    if (!has) rows.push(focusRow(an, f, p[1]));
  }));
  rows.forEach((r) => {
    const a = an.audiences.find((x) => x.short === r.doiTuong);
    if (r._score == null) { const g = a && (a.reqs.find((x) => x.status === "cần đào tạo" && x.area === r._area) || a.reqs.find((x) => x.status === "cần đào tạo")); r._score = g ? g.priority : 30; if (!r.uuTien) r.uuTien = g ? g.priorityLabel : PRIO[2]; if (!r.soHocVien) r.soHocVien = g ? (g.gapPeople || a.people) : (a ? a.people : 0); }
    if (!r.uuTien) r.uuTien = prioLabel(r._score);
    if (!r.hinhThuc) r.hinhThuc = formatFor(r._area || "sp", a ? a.key : "", r.soHocVien, "", res, "");
    if (!r.trangThai) r.trangThai = "Dự kiến";
  });
  rows.sort((x, y) => (y._score || 0) - (x._score || 0));
  const over = schedule(an.month, rows, res, true);
  over.forEach((r) => watch.push({ audience: r.doiTuong, program: r.tenChuongTrinh, reason: "Chưa xếp được lịch: vượt số buổi tối đa mỗi tuần hoặc số ngày có thể tổ chức trong tháng.", priority: r.uuTien }));
  const out = rows.filter((r) => over.indexOf(r) < 0); fixTimes(out);
  out.forEach((r, i) => { if (!r.phuTrach) r.phuTrach = res.trainers && res.trainers.length ? res.trainers[i % res.trainers.length] : DEFAULT_OWNER; delete r._score; delete r._area; });
  return out;
}

// ---------- giải thích đề xuất (A–E): sinh bằng luật từ số liệu, không phụ thuộc AI ----------
function explain(an, rows, watch, narrative, notes) {
  const bad = []; an.audiences.forEach((a) => a.reqs.forEach((g) => { if (g.status === "cần đào tạo") bad.push({ a, g }); })); bad.sort((x, y) => y.g.priority - x.g.priority);
  const good = []; an.audiences.forEach((a) => a.reqs.forEach((g) => { if (g.level === "Đáp ứng tốt") good.push(a.short + ": " + g.areaName + " (TB " + g.avg + "%, yêu cầu ≥ " + g.min + "%)"); }));
  const hardAll = []; an.audiences.forEach((a) => (a.hard || []).forEach((h) => hardAll.push(Object.assign({ audience: a.short }, h)))); hardAll.sort((x, y) => y.wrongPct - x.wrongPct);
  const pv = an.prev, pvLine = [];
  if (pv && pv.items.length) { const tk = pv.items.reduce((n, x) => n + (x.taken || 0), 0), au = pv.items.reduce((n, x) => n + (x.audienceSize || 0), 0), av = pv.items.filter((x) => x.avgPct != null).map((x) => x.avgPct), rg = pv.items.reduce((n, x) => n + (x.regs || 0), 0);
    pvLine.push("Đào tạo tháng " + pv.month.slice(5) + "/" + pv.month.slice(0, 4) + ": " + pv.items.length + " chương trình, " + rg + " lượt đăng ký, " + tk + "/" + au + " người đã làm bài kiểm tra củng cố" + (av.length ? ", điểm TB " + r1(mean(av)) + "%" : "") + " (số liệu tham khảo, không kết luận nhân quả)."); }
  const miss = [];
  if (an.noFramework.length) miss.push("Chưa có khung năng lực yêu cầu cho: " + an.noFramework.join(", ") + " (hệ thống không tự đặt điểm yêu cầu — khai báo ở mục Khung năng lực để phân tích các vị trí này).");
  an.audiences.forEach((a) => { if (a.missing) miss.push(a.short + ": " + a.missing + " mảng yêu cầu chưa có dữ liệu kiểm tra (xem “Vì sao thiếu dữ liệu”)."); });
  if (!an.sales) miss.push("Chưa có số bán trên hệ thống: chưa xét được mức ảnh hưởng đến kết quả kinh doanh."); 
  if (!hasRes(an.biz.resources || {})) miss.push("Chưa khai báo nguồn lực (giảng viên, hình thức, ngày không tổ chức, số buổi tối đa mỗi tuần): lịch xếp theo mặc định T2–T6, chưa xét khả năng tổ chức.");
  if (an.meta.catMissing) miss.push("Còn " + an.meta.catMissing + " bài chưa quét xong danh mục câu hỏi, số liệu có thể chưa đủ.");
  an.audiences.forEach((a) => { a.reqs.forEach((g) => { if (g.status === "cần đào tạo" && g.materials === 0) miss.push(a.short + ": mảng " + g.areaName + " chưa có học liệu — cần bổ sung trước buổi học."); }); });
  const byWeek = {}; rows.forEach((r) => { const k = weekOf(r.thoiGian) || 0; (byWeek[k] = byWeek[k] || []).push(r); });
  const mand = rows.filter((r) => r.uuTien === PRIO[0] || r.uuTien === PRIO[1]).map((r) => r.tenChuongTrinh), supp = rows.filter((r) => r.uuTien !== PRIO[0] && r.uuTien !== PRIO[1]).map((r) => r.tenChuongTrinh);
  const biz = an.biz, why = []; (biz.goals || []).forEach((x) => why.push("Mục tiêu kinh doanh: " + x)); (biz.strategy || []).forEach((x) => why.push("Chiến lược: " + x)); (biz.promos || []).forEach((x) => why.push("Chương trình bán hàng / khuyến mại: " + x));
  (biz.direction || []).forEach((x) => why.push("Định hướng của lãnh đạo: " + x)); (biz.difficulties || []).forEach((x) => why.push("Khó khăn thị trường: " + x));
  (biz.focus || []).forEach((f) => why.push("Sản phẩm trọng tâm " + f.short + ": " + f.products.join(", "))); (biz.newProducts || []).forEach((f) => why.push("Sản phẩm mới " + f.short + ": " + f.products.join(", ")));
  if (an.sales && an.sales.pct != null) why.push("Kết quả bán T" + an.sales.month.slice(5) + "/" + an.sales.month.slice(0, 4) + ": " + an.sales.pct + "% chỉ tiêu toàn đội.");
  return {
    overview: { lines: ["Đã phân tích " + an.meta.tested + "/" + an.meta.population + " nhân sự có bài kiểm tra" + (an.scope ? " trong " + an.scope + " tháng gần nhất" : "") + ", " + an.audiences.length + " vị trí.",
        good.length ? "Đáp ứng tốt: " + good.slice(0, 6).join("; ") + (good.length > 6 ? "…" : "") + "." : "Chưa có mảng nào được xác nhận là đáp ứng tốt.",
        bad.length ? "Thiếu hụt: " + bad.slice(0, 5).map((x) => x.a.short + " · " + x.g.areaName + " (" + x.g.level.toLowerCase() + ", cách " + x.g.gap + " điểm)").join("; ") + "." : "Chưa phát hiện khoảng cách năng lực so với khung đã khai báo.",
        pvLine.length ? pvLine[0] : "Chưa có kết quả đào tạo tháng trước để đối chiếu.", hardAll.length ? "Câu hỏi sai nhiều: " + hardAll.slice(0, 3).map((h) => "“" + h.text.slice(0, 80) + "” (" + h.audience + ", sai " + h.wrongPct + "%)").join("; ") + "." : "Chưa thống kê được câu hỏi sai nhiều (cần thêm dữ liệu bài làm)."].concat(notes || []),
      priorityAudiences: an.audiences.filter((a) => a.gaps).map((a) => a.short + " (" + a.gaps + " mảng cần đào tạo)") },
    gaps: bad.map((x) => ({ audience: x.a.short, area: x.g.areaName, avg: x.g.avg, min: x.g.min, gap: x.g.gap, level: x.g.level, share: x.g.share, people: x.g.gapPeople + "/" + x.g.assessed, priority: x.g.priorityLabel, evidence: basis(x.a, x.g), topics: x.g.topics.map((t) => t.name + " " + t.pct + "%") })),
    direction: { why, mandatory: mand, supplementary: supp, watch },
    rollout: Object.keys(byWeek).map(Number).sort((a, b) => a - b).map((w) => ({ week: w ? "Tuần " + w : "Chưa xếp lịch", items: byWeek[w].map((r) => (r.thoiGian ? r.thoiGian.slice(8) + "/" + r.thoiGian.slice(5, 7) + " " + (r.gio || "") + " · " : "") + r.tenChuongTrinh + " — " + r.doiTuong + " — " + (r.hinhThuc || r.phuongPhap) + " — " + r.thoiLuong) })),
    expected: rows.map((r) => ({ program: r.tenChuongTrinh, audience: r.doiTuong, target: r.mucTieu, indicator: r.chiSoDo, completion: "≥ 90% học viên hoàn thành bài kiểm tra củng cố (mục tiêu đề xuất, chỉnh được)", application: "Quản lý trực tiếp xác nhận việc áp dụng tại điểm bán trong 30 ngày sau buổi học" })),
    missingData: miss, narrative: narrative || null
  };
}

// ---------- AI ----------
const RULES = [
  "Bạn là chuyên gia kết hợp Learning & Development, Sales Training & Business Enablement và HR Analytics cho đội ngũ kinh doanh kênh GT Karofi – Livotec. Viết tiếng Việt chuyên nghiệp, ngắn gọn.",
  "Nhiệm vụ: từ bản phân tích khoảng cách năng lực theo từng vị trí (so với KHUNG NĂNG LỰC do quản trị viên khai báo) và dữ liệu kinh doanh của tháng, lập KẾ HOẠCH ĐÀO TẠO cho đúng một tháng. Không mặc định mọi vấn đề đều cần đào tạo.",
  "CHỈ tạo chương trình cho cặp (vị trí, mảng năng lực) có trạng thái \"cần đào tạo\"; sắp theo \"diem_uu_tien\" giảm dần; bỏ qua mảng có mức ưu tiên \"Theo dõi và bổ sung sau\"; tối đa 8 chương trình; gộp các mảng gần nhau của cùng vị trí nếu hợp lý. Mảng \"thiếu dữ liệu\" hoặc \"chưa có yêu cầu\" KHÔNG được suy diễn là yếu hay đạt.",
  "Nội dung phải bám vào mảng yếu, chủ đề yếu và câu hỏi sai nhiều trong dữ liệu; đúng vị trí và đúng ngành hàng (không dạy sản phẩm chuyên sâu ngành khác). KHÔNG bịa thông số sản phẩm, giá, chính sách hay số liệu; chỉ nêu tên nội dung/kỹ năng cần học.",
  "Mỗi chương trình: mục tiêu đo được (gắn với con số hiện trạng và ngưỡng yêu cầu), hình thức (chọn trong danh sách hinh_thuc_cho_phep, kết hợp bằng \" + \"), thời lượng thực tế (45–120 phút), \"mang\" (mã mảng năng lực: mk|po|sk|n1|n2|sp, để trống nếu là sản phẩm trọng tâm / sản phẩm mới), \"co_so\" ghi con số làm bằng chứng. Nếu mảng chưa có học liệu thì ghi chú cần bổ sung học liệu.",
  "BÁM SÁT MỤC TIÊU KINH DOANH: kế hoạch phải phục vụ \"muc_tieu_kinh_doanh\", \"chien_luoc\", \"chuong_trinh_ban_hang_khuyen_mai\", \"dinh_huong_lanh_dao\", \"kho_khan_thi_truong\" và kết quả bán (nếu có). Mỗi chương trình điền \"muc_tieu_kd\" (góp phần vào mục tiêu / ưu tiên nào, nêu đúng theo dữ liệu, không thêm mục tiêu mới) và \"chi_so_do\" (chỉ số đo hiệu quả: điểm mảng năng lực, điểm kiểm tra củng cố và chỉ số kinh doanh như % hoàn thành chỉ tiêu của vị trí đó).",
  "Nếu một vị trí năng lực đã đạt mà bán vẫn thấp (\"nhan_xet\"), KHÔNG tạo thêm chương trình kiến thức; nguyên nhân có thể nằm ngoài đào tạo. Không khẳng định đào tạo sẽ chắc chắn tăng doanh số: chỉ nói kỳ vọng góp phần.",
  "SẢN PHẨM TRỌNG TÂM / SẢN PHẨM MỚI THEO VỊ TRÍ: nếu một vị trí có \"san_pham_trong_tam\" hoặc \"san_pham_moi\" thì BẮT BUỘC có ít nhất một chương trình riêng về đúng các sản phẩm đó cho vị trí đó (dù chưa có khoảng cách năng lực): đặc điểm và lợi ích (chỉ nêu tên nội dung cần học, không bịa thông số), kỹ thuật tư vấn và so sánh, xử lý từ chối, thực hành tình huống thực tế tại điểm bán.",
  "LỊCH: rải đều theo tuần, không dồn cuối tháng, mỗi buổi một ngày riêng; điền \"ngay\" là ngày trong tháng và \"gio\" là giờ bắt đầu HH:MM. Không làm gián đoạn giờ bán của SR và PC: chỉ đầu ngày (bắt đầu từ 08:00 và kết thúc trước 09:30, tối đa 90 phút) hoặc cuối ngày (bắt đầu từ 17:00). Không tự tạo ngày nghỉ hay lịch làm việc ngoài dữ liệu \"ngay_khong_to_chuc\" / \"nguon_luc\". Nội dung gắn liền thực tế bán hàng và đủ cụ thể để gửi người phê duyệt đánh giá trước buổi học.",
  "Không đề xuất quyết định bất lợi về nhân sự. Nhóm dưới 10 người có bài chỉ là tín hiệu: nói rõ trong ghi chú."
].join(" ") + " " + CTX.CONTEXT;
const FMT = " Chỉ trả về MỘT JSON: {\"giai_thich\":{\"tong_quan\":string(2-3 câu đánh giá thực trạng, có con số),\"dinh_huong\":string(2-3 câu vì sao chọn các chủ đề, chủ đề nào bắt buộc / bổ sung)},\"chuong_trinh\":[{\"vi_tri\":string(khóa vị trí đúng như dữ liệu),\"mang\":string,\"ten\":string,\"noi_dung\":[string](3 đến 6 ý),\"muc_tieu\":string,\"hinh_thuc\":string,\"phuong_phap\":string,\"thoi_luong\":string,\"ngay\":number,\"gio\":string(HH:MM),\"tan_suat\":string,\"ghi_chu\":string,\"co_so\":string,\"muc_tieu_kd\":string,\"chi_so_do\":string}]}.";
function parseJson(text) { const t = String(text || ""), a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }

async function aiPlan(an) {
  const biz = an.biz, res = biz.resources || {}; // KHÔNG gửi tên giảng viên: chỉ gửi số lượng
  const payload = { thang: an.month, muc_tieu_kinh_doanh: biz.goals, chien_luoc: biz.strategy, chuong_trinh_ban_hang_khuyen_mai: biz.promos, dinh_huong_lanh_dao: biz.direction, kho_khan_thi_truong: biz.difficulties,
    ket_qua_ban_hang: an.sales ? { thang: an.sales.month, chi_tieu: an.sales.target, thuc_dat: an.sales.actual, ty_le_hoan_thanh: an.sales.pct, ty_le_thoi_gian_ban: an.sales.elapsed } : null,
    dao_tao_thang_truoc: an.prev && an.prev.items.length ? an.prev.items.map((x) => ({ vi_tri: x.audience, chuong_trinh: x.program, so_dang_ky: x.regs, so_lam_kiem_tra: x.taken, quy_mo_de: x.audienceSize, ty_le_lam_bai: x.takenPct, diem_tb: x.avgPct, ty_le_dat: x.passRate })) : undefined,
    nguon_luc: { so_giang_vien: res.trainers.length || undefined, hinh_thuc_cho_phep: res.formats.length ? res.formats : FORMATS, thoi_luong_toi_da_phut: res.maxMinutes || undefined, so_buoi_toi_da_moi_tuan: res.sessionsPerWeek || undefined, co_ngan_sach: res.budget ? true : undefined }, ngay_khong_to_chuc: res.blockedDates,
    quy_mo: { nhan_su: an.meta.population, co_bai: an.meta.tested, pham_vi_du_lieu: an.scope ? an.scope + " tháng gần nhất" : "tất cả" },
    vi_tri: an.audiences.filter((a) => a.tested > 0 || a.focus.length || a.newProducts.length).map((a) => ({ khoa: a.key, san_pham_trong_tam: a.focus.length ? a.focus : undefined, san_pham_moi: a.newProducts.length ? a.newProducts : undefined, ten: a.label, nganh: a.nganh, so_nguoi: a.people, co_bai: a.tested, chi_so_tb: a.index, ban_tb_3_thang: a.salesAvg,
      tin_cay: a.reliable ? "đủ" : "thấp (dưới 10 người có bài)", co_khung_nang_luc: a.framework, yeu_cau_cong_viec: a.needs, nhan_xet: a.note || undefined,
      cau_hoi_sai_nhieu: a.hard.slice(0, 5).map((h) => ({ noi_dung: h.text, ty_le_sai: h.wrongPct, so_luot: h.n })),
      nang_luc: a.reqs.map((g) => ({ ma_mang: g.area, mang: g.areaName, yeu_cau_toi_thieu: g.min, hien_trang_tb: g.avg, khoang_cach: g.gap, muc: g.level, so_nguoi_do: g.assessed, so_nguoi_duoi_nguong: g.gapPeople, trang_thai: g.status, diem_uu_tien: g.priority, muc_uu_tien: g.priorityLabel || undefined,
        chu_de_yeu: g.topics.map((t) => t.name + " " + t.pct + "%"), thuoc_chien_luoc: g.strategyHits, hoc_lieu_hien_co: g.materials, cau_hoi_kiem_tra: g.questions })) })) };
  const user = "Phân tích khoảng cách năng lực và dữ liệu kinh doanh (JSON, ẩn danh):\n" + JSON.stringify(payload) + "\n\nLập kế hoạch đào tạo tháng " + an.month.slice(5) + "/" + an.month.slice(0, 4) + ".";
  const text = await llm.chat([{ role: "system", content: RULES + FMT }, { role: "user", content: user }], { temperature: 0.3, max_tokens: 3600, task: "train-plan", json: true, timeoutMs: 28000 });
  const o = parseJson(text); if (!o || !Array.isArray(o.chuong_trinh)) throw new Error("AI trả về kết quả không đọc được.");
  const keys = Object.fromEntries(an.audiences.map((a) => [a.key, a])), inFocus = Object.fromEntries((biz.focus || []).concat(biz.newProducts || []).map((f) => [f.key, f]));
  const rows = o.chuong_trinh.slice(0, 12).map((x) => {
    const key = s(x && x.vi_tri, 10), a = keys[key] || (inFocus[key] ? { key, short: SHORT[key], nganh: NGANH[key] } : null); if (!a) return null;
    const area = AREA_NAME[s(x.mang, 4)] ? s(x.mang, 4) : "", d = Math.round(Number(x.ngay)), parts = s(x.hinh_thuc, 140).split(" + ").map((p) => p.trim()), okFmt = parts.length && parts.every((p) => FORMATS.indexOf(p) >= 0);
    return { doiTuong: a.short, nganh: a.nganh, tenChuongTrinh: s(x.ten, 160), noiDung: (Array.isArray(x.noi_dung) ? x.noi_dung : []).slice(0, 8), mucTieu: s(x.muc_tieu, 400), hinhThuc: okFmt ? restrict(parts.join(" + "), res.formats) : "", phuongPhap: s(x.phuong_phap, 120) || DEFAULT_METHOD,
      thoiLuong: s(x.thoi_luong, 40) || DEFAULT_DURATION, phuTrach: "", thoiGian: d >= 1 && d <= 31 ? an.month + "-" + pad(d) : "", gio: s(x.gio, 5), tanSuat: s(x.tan_suat, 100) || DEFAULT_FREQ, ghiChu: s(x.ghi_chu, 500), coSo: s(x.co_so, 600),
      mucTieuKd: s(x.muc_tieu_kd, 300) || (bizLink(biz, area) ? "Góp phần vào: " + bizLink(biz, area) : ""), chiSoDo: s(x.chi_so_do, 500) || "Điểm mảng năng lực ≥ ngưỡng yêu cầu ở kỳ kiểm tra kế tiếp; bài kiểm tra củng cố sau buổi học", _area: area };
  }).filter((r) => r && r.tenChuongTrinh && r.noiDung.length);
  if (!rows.length) throw new Error("AI chưa lập được chương trình nào.");
  const g = o.giai_thich && typeof o.giai_thich === "object" ? { tongQuan: s(o.giai_thich.tong_quan, 900), dinhHuong: s(o.giai_thich.dinh_huong, 900) } : null;
  return { rows, narrative: g && (g.tongQuan || g.dinhHuong) ? g : null };
}

// Lập kế hoạch: mode "ai" thử AI trước, lỗi thì dùng luật (kèm cảnh báo); mode "rules" chỉ dùng luật. KHÔNG ghi vào kho: người quản trị xem, sửa rồi mới lưu.
async function generate(opt) {
  opt = opt || {}; const month = s(opt.month, 7); if (!MONTH.test(month)) return { ok: false, error: "Tháng không hợp lệ." };
  const biz = await getBiz(month);
  if (!hasBiz(biz)) return { ok: false, code: "need_biz", error: "Hãy nhập mục tiêu kinh doanh, chiến lược hoặc sản phẩm trọng tâm của tháng trước khi lập kế hoạch đào tạo, để kế hoạch bám sát mục tiêu." };
  const HC = require("./hrcompetency"), fw = await getFramework(), months = [3, 6, 12].indexOf(Number(opt.months)) >= 0 ? Number(opt.months) : 0;
  let hard = {}; try { hard = (await require("./trainstat").hardQuestions({ budgetMs: 6000 })).byAudience; } catch (e) { hard = {}; }
  let prev = null; try { const pm = prevMonthOf(month), e = await require("./trainstat").effectiveness(pm); if (e.created && e.items.length) prev = { month: pm, items: e.items.map((x) => ({ audience: x.audience, program: x.title, regs: x.program && x.program.regs, taken: x.exam && x.exam.taken, audienceSize: x.exam && x.exam.audience, takenPct: x.exam && x.exam.takenPct, avgPct: x.exam && x.exam.avgPct, passRate: x.exam && x.exam.passRate })) }; } catch (e) { prev = null; }
  const an = analyse(await HC.build({ refresh: opt.refresh === true, months }), month, { prev, biz, sales: await salesContext(month), areaMap: await HC.getAreaMap(), framework: fw, audiences: Array.isArray(opt.audiences) ? opt.audiences.filter((k) => SHORT[k]) : null, hard, months });
  const products = an.biz.focus.length || an.biz.newProducts.length;
  if (!an.audiences.some((a) => a.framework) && !products) return { ok: false, code: "need_framework", analysis: an, error: "Chưa có khung năng lực yêu cầu theo vị trí. Hệ thống không tự đặt điểm yêu cầu: hãy khai báo ở mục “Khung năng lực theo vị trí” (có nút điền sẵn gợi ý để bạn chỉnh) rồi lập lại." };
  const notes = an.audiences.filter((a) => a.note).map((a) => a.short + ": " + a.note);
  if (!an.audiences.some((a) => a.gaps > 0) && !products) {
    const ex = explain(an, [], [], null, notes);
    return { ok: true, source: "rules", rows: [], watch: [], analysis: an, explanation: ex, notes, warning: "Chưa phát hiện khoảng cách năng lực cần đào tạo so với khung đã khai báo" + (an.missingTotal ? ", nhưng " + an.missingTotal + " mảng yêu cầu CHƯA CÓ dữ liệu kiểm tra nên chưa thể kết luận là đạt (xem mục “Vì sao thiếu dữ liệu” ở phần phân tích)." : ".") + (an.noFramework.length ? " Vị trí chưa có khung năng lực: " + an.noFramework.join(", ") + "." : "") };
  }
  let rows = null, watch = [], source = "rules", warning = "", narrative = null;
  if (opt.mode !== "rules") {
    try {
      const r = await aiPlan(an); source = "ai"; narrative = r.narrative;
      const cand = candidates(an), fl = (an.biz.focus || []).map((f) => ({ f, kind: "focus" })).concat((an.biz.newProducts || []).map((f) => ({ f, kind: "new" })));
      r.rows.forEach((x) => { // ưu tiên / số học viên do máy chủ tính, không tin AI
        const text = (x.tenChuongTrinh + " " + x.noiDung.join(" ")).toLowerCase(), fm = fl.find((z) => z.f.short === x.doiTuong && z.f.products.some((p) => text.indexOf(p.toLowerCase()) >= 0));
        if (fm) { const fs = focusScore(an, fm.f); x._score = fs.sc; x.uuTien = fs.label; x.soHocVien = fs.people; return; }
        const c = cand.find((k) => k.a.short === x.doiTuong && k.g.area === x._area); if (c) { x._score = c.g.priority; x.uuTien = c.g.priorityLabel; x.soHocVien = c.g.gapPeople || c.a.people; }
      });
      rows = completeRows(an, r.rows, watch);
    }
    catch (e) { warning = "AI tạm thời không khả dụng nên kế hoạch được lập theo luật từ bản phân tích."; rows = null; watch = []; }
  }
  if (!rows) { const r = rulePlan(an); rows = r.rows; watch = r.watch; }
  try { rows = cleanRows(rows, month); } catch (e) { return { ok: false, error: e.message }; }
  if (an.noFramework.length) warning = (warning ? warning + " " : "") + "Vị trí chưa có khung năng lực nên không xét khoảng cách: " + an.noFramework.join(", ") + ".";
  return { ok: true, source, rows, watch, analysis: an, explanation: explain(an, rows, watch, narrative, notes), notes, warning };
}

// Mã băm nội dung kế hoạch tại thời điểm duyệt: sửa nội dung SAU khi đã duyệt thì mã đổi → phải duyệt lại mới được gửi thư
function rowsHash(rows) {
  return crypto.createHash("sha1").update(JSON.stringify((rows || []).map((r) => [r.doiTuong, r.tenChuongTrinh, r.noiDung, r.mucTieu, r.hinhThuc, r.phuongPhap, r.thoiLuong, r.thoiGian, r.gio]))).digest("hex").slice(0, 16);
}

// ---------- lưu trữ theo tháng (mỗi tháng độc lập) + phiên bản ----------
async function get(month) { month = s(month, 7); if (!MONTH.test(month)) return null; const d = await store.get(PREFIX + month + ".json").catch(() => null); return d && !d.deleted ? d : null; }
async function list() {
  const names = await store.list(PREFIX), docs = await Promise.all(names.filter((x) => /\d{4}-\d{2}\.json$/.test(x)).map((x) => store.get(x).catch(() => null)));
  return docs.filter((d) => d && !d.deleted && MONTH.test(d.month || "")).map((d) => ({ month: d.month, count: d.rows.length, status: d.status, approval: (d.approval && d.approval.status) || "draft", source: d.source, updatedAt: d.updatedAt || 0, by: d.by || "" })).sort((a, b) => (a.month < b.month ? 1 : -1));
}
// Số liệu nền (trước đào tạo) để so sánh hiệu quả sau này: dùng bản năng lực đã tính sẵn, không tính lại (không làm chậm việc lưu)
async function baselineOf(month) {
  try {
    const HC = require("./hrcompetency"), data = await HC.peek(); if (!data) return null;
    const an = analyse(data, month, { framework: await getFramework(), areaMap: await HC.getAreaMap() });
    return { at: Date.now(), items: [].concat.apply([], an.audiences.map((a) => a.reqs.filter((g) => g.avg != null).map((g) => ({ audience: a.short, key: a.key, area: g.area, areaName: g.areaName, avg: g.avg, min: g.min, level: g.level })))) };
  } catch (e) { return null; }
}
function cleanExplanation(x) { if (!x || typeof x !== "object") return null; try { const j = JSON.stringify(x); return j.length <= 60000 ? JSON.parse(j) : null; } catch (e) { return null; } }
async function save(month, body, by) {
  month = s(month, 7); if (!MONTH.test(month)) throw new Error("Tháng không hợp lệ."); body = body || {};
  const prev = await get(month), rows = cleanRows(body.rows, month), hash = rowsHash(rows);
  const doc = { v: 2, month, status: body.status === "final" ? "final" : "draft", source: ["ai", "rules", "manual"].indexOf(body.source) >= 0 ? body.source : "manual", rows, updatedAt: Date.now(), by: String(by || "").toLowerCase() };
  const biz = await getBiz(month); doc.biz = { goals: biz.goals, strategy: biz.strategy, focus: biz.focus, newProducts: biz.newProducts, promos: biz.promos, difficulties: biz.difficulties, direction: biz.direction, resources: biz.resources };
  const A = body.approval || {}, prevOk = !!(prev && prev.approval && prev.approval.status === "approved");
  let st = ["draft", "pending", "approved", "rejected"].indexOf(A.status) >= 0 ? A.status : "draft";
  if (st === "approved" && prevOk && prev.approval.hash !== hash) st = "pending"; // đã duyệt mà nội dung đổi: không tự coi là còn được duyệt
  const decided = st === "approved" || st === "rejected";
  doc.approval = { status: st, approver: s(A.approver, 80), note: s(A.note, 1500), recordedBy: doc.by, hash: st === "approved" ? hash : null,
    decidedAt: decided ? (prev && prev.approval && prev.approval.status === st && prev.approval.decidedAt ? prev.approval.decidedAt : Date.now()) : null };
  const sb = Math.round(Number(body.sendBefore)); doc.sendBefore = isFinite(sb) ? Math.min(15, Math.max(0, sb)) : 3; // gửi nội dung cho người phê duyệt trước buổi học N ngày làm việc
  doc.explanation = cleanExplanation(body.explanation) || (prev && prev.explanation) || null;
  doc.baseline = (prev && prev.baseline) || (await baselineOf(month));
  const hist = prev && Array.isArray(prev.history) ? prev.history.slice() : [];
  if (prev && !(rowsHash(prev.rows) === hash && prev.status === doc.status)) hist.unshift({ at: prev.updatedAt || 0, by: prev.by || "", status: prev.status, approvalStatus: (prev.approval && prev.approval.status) || "draft", count: prev.rows.length, rows: prev.rows });
  doc.history = hist.slice(0, MAX_HISTORY); // giữ tối đa 10 phiên bản trước
  await store.put(PREFIX + month + ".json", doc); return doc;
}
async function history(month) { const d = await get(month); return ((d && d.history) || []).map((h) => ({ at: h.at, by: h.by, status: h.status, approvalStatus: h.approvalStatus, count: h.count })); }
// Khôi phục = nạp phiên bản cũ vào bảng để quản trị viên xem / sửa; KHÔNG tự lưu
async function restore(month, at) { const d = await get(month), h = d && (d.history || []).find((x) => x.at === Number(at)); return h ? { ok: true, rows: h.rows, status: h.status, at: h.at } : { ok: false, error: "Không tìm thấy phiên bản này." }; }
async function remove(month, by) { month = s(month, 7); if (!MONTH.test(month)) throw new Error("Tháng không hợp lệ."); await store.put(PREFIX + month + ".json", { v: 1, month, deleted: true, updatedAt: Date.now(), by: String(by || "").toLowerCase() }); }

module.exports = { SHORT, rowsHash, parseFocus, durMin, timeOk, slotFor, getBiz, saveBiz, hasBiz, salesContext, getFramework, saveFramework, SUGGESTED, REQ: SUGGESTED, FORMATS, STATUSES, PRIO,
  analyse, rulePlan, generate, explain, formatFor, weekOf, daysOf, schedule, get, list, save, history, restore, remove, cleanRows, workdays, AREA_NAME };

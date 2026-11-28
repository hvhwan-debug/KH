// Ước tính thu nhập của nhân viên tư vấn sản phẩm (PC) theo "Chính sách thu nhập Phòng Kinh doanh GT".
// CHỈ áp dụng chức danh PC. Số liệu lấy từ: file Salerep (doanh số thực đạt / chỉ tiêu, kt/sales/YYYY-MM.json),
// điểm kiến thức tháng (đợt "Điểm tuân thủ học tập" của chức năng Xác nhận điểm), và phần quản trị viên nhập tay
// (điểm tuân thủ 50, model định hướng, thưởng đánh giá tháng, nhóm điểm bán) lưu ở kt/pcincome/inputs.json.
// Đây là ƯỚC TÍNH (gộp, chưa trừ BHXH/thuế), không phải bảng lương. Mọi con số chính sách nằm trong POLICY để sửa một chỗ.
const store = require("./store");
const quiz = require("./quiz");

const INPUTS_KEY = "kt/pcincome/inputs.json";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const POLICY = {
  // Q1: lương cơ bản (lương đóng BHXH) + phụ cấp cố định hằng tháng
  base: 5310000, lunch: 780000, phone: 100000,
  // Q2dt: tỷ lệ hoa hồng theo phân loại điểm bán (doanh thu CHỈ TIÊU tháng) và mức hoàn thành. rates = [>=60%, >=80%, >=100%]
  groups: [
    { key: "A++", label: "Nhóm A++", min: 300e6, max: Infinity, rates: [1.6, 2.0, 2.4] },
    { key: "A+", label: "Nhóm A+", min: 250e6, max: 300e6, rates: [1.8, 2.2, 2.6] },
    { key: "A", label: "Nhóm A", min: 200e6, max: 250e6, rates: [2.0, 2.4, 2.8] },
    { key: "B", label: "Nhóm B", min: 160e6, max: 200e6, rates: [2.2, 2.6, 3.0] },
    { key: "C", label: "Nhóm C", min: 100e6, max: 160e6, rates: [2.4, 2.8, 3.2] }
  ],
  tiers: [60, 80, 100],            // mốc hoàn thành doanh thu (%)
  minCompletion: 60,               // dưới mốc này: không có thưởng hoàn thành doanh thu
  // Định mức hưởng thưởng tháng theo điểm tuân thủ (tổng 100)
  factors: [{ min: 90, pct: 100 }, { min: 80, pct: 90 }, { min: 70, pct: 80 }, { min: 60, pct: 70 }],   // dưới 60: không thưởng
  warnBelow: 30,                   // dưới 30 điểm: cảnh cáo bằng văn bản và xem xét chấm dứt hợp đồng
  // Điểm tuân thủ = Tuân thủ (50) + Kiến thức (20) + Model định hướng (30)
  work: [
    { key: "time", label: "Tuân thủ thời gian làm việc", max: 10 },
    { key: "look", label: "Diện mạo & đồng phục", max: 10 },
    { key: "display", label: "Hình ảnh tại cửa hàng (Display & POP)", max: 20 },
    { key: "report", label: "Báo cáo", max: 10 }
  ],
  knowledgeMax: 20, modelMax: 30,
  // Q3: thưởng vượt mục tiêu quý = (SO thực đạt quý − 87% × SO chỉ tiêu quý) × 5% × hệ số thời gian
  q3: { rate: 0.05, baseline: 0.87, minAvgScore: 80, minRatio: 0.87, minMonths: 2,
    // Chính sách ghi "Hệ số thời gian là số tháng PCs làm việc và có nhận chỉ tiêu trong quý" (chưa nói rõ có chia 3 hay không).
    // Mặc định hiểu là số tháng ÷ 3 (đủ quý = 1). Đổi thành "months" nếu hiểu là nhân thẳng số tháng (1 đến 3).
    timeFactor: "months_over_3" }
};

const num = (v) => { const x = Number(v); return v == null || v === "" || !isFinite(x) ? null : x; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = (x) => Math.round(x * 100) / 100;
const vnn = (x) => String(x).replace(".", ",");   // số kiểu Việt Nam (dấu phẩy thập phân) trong các câu chữ
const up = (s) => String(s || "").trim().toUpperCase();

function groupOf(target, override) {
  const o = override && POLICY.groups.find((g) => g.key === override);
  if (o) return { g: o, below: target < o.min, byInput: true };
  for (const g of POLICY.groups) if (target >= g.min) return { g, below: false, byInput: false };
  return { g: POLICY.groups[POLICY.groups.length - 1], below: true, byInput: false };   // chỉ tiêu dưới 100tr: tính theo nhóm C với mức tối thiểu 100tr
}
function factorOf(score) { const f = POLICY.factors.find((x) => score >= x.min); return f ? f.pct : 0; }

// Chức danh PC: theo chức danh trong hồ sơ (hoặc cột chức vụ của file Salerep). Không đoán khi hồ sơ chưa có chức danh.
function isPC(cand, salesPos) {
  const t = String((cand && cand.title) || ""), p = String(salesPos || "");
  const hit = (x) => /(^|[^a-z])pcs?([^a-z]|$)|product consultant|tu van san pham|tư vấn sản phẩm|nhân viên tư vấn/i.test(String(x).normalize("NFC"));
  return hit(t) || (!t.trim() && hit(p));
}

async function detect(cand) {   // dùng cho hồ sơ: có áp dụng chính sách PC không
  if (!cand) return false;
  if (String(cand.title || "").trim()) return isPC(cand, "");
  const sales = await loadSales(cand.code).catch(() => []);
  return isPC(cand, sales.length ? sales[sales.length - 1].pos : "");
}

// ---- dữ liệu đầu vào ----
async function loadSales(code) {
  const k = up(code), out = [];
  const names = await store.list("kt/sales/");
  const docs = await Promise.all(names.filter((x) => /\d{4}-\d{2}\.json$/.test(x)).map((x) => store.get(x).catch(() => null)));
  docs.forEach((d) => {
    if (!d || d.deleted || !MONTH.test(d.month || "")) return;
    const r = (d.rows || []).find((x) => up(x.code) === k); if (!r) return;
    out.push({ month: d.month, target: num(r.target), actual: num(r.actual) || 0, pos: r.pos || "", kv: r.kv || "", npp: r.nppName || "", asm: r.asmName || "", joinDate: r.joinDate || "", probation: r.probation || "", elapsed: d.elapsed });
  });
  return out.sort((a, b) => a.month.localeCompare(b.month));
}
async function loadInputs(code) { const d = (await store.get(INPUTS_KEY)) || {}; return d[up(code)] || {}; }
function cleanInputs(b) {
  b = b && typeof b === "object" ? b : {};
  const o = {}, w = {};
  POLICY.work.forEach((it) => { const v = num(b.work && b.work[it.key]); if (v != null) w[it.key] = clamp(r2(v), 0, it.max); });
  if (Object.keys(w).length) o.work = w;
  const kn = num(b.knowledge); if (kn != null) o.knowledge = clamp(r2(kn), 0, POLICY.knowledgeMax);
  const ma = num(b.modelAch), mt = num(b.modelTarget);
  if (ma != null && ma >= 0) o.modelAch = Math.min(ma, 1e6);
  if (mt != null && mt > 0) o.modelTarget = Math.min(mt, 1e6);
  const rv = num(b.review); if (rv != null && rv > 0) o.review = Math.min(Math.round(rv), 1e9);
  if (POLICY.groups.some((g) => g.key === b.group)) o.group = b.group;
  return o;
}
async function saveInputs(code, month, b) {
  if (!MONTH.test(month || "")) return { ok: false, error: "Tháng không hợp lệ." };
  const c = cleanInputs(b), k = up(code); if (!k) return { ok: false, error: "Thiếu mã nhân viên." };
  await store.update(INPUTS_KEY, (cur) => {
    const d = cur && typeof cur === "object" ? cur : {};
    d[k] = d[k] || {};
    if (Object.keys(c).length) d[k][month] = Object.assign({}, c, { at: Date.now() }); else delete d[k][month];
    if (!Object.keys(d[k]).length) delete d[k];
    return d;
  });
  return { ok: true, inputs: c };
}

// ---- tính toán MỘT tháng. assume: "max" (mục chưa có dữ liệu = đủ điểm) | "min" (mục chưa có dữ liệu = 0) ----
function scoreParts(inp, knowSys, assume) {
  const full = assume !== "min", parts = [];
  const wItems = POLICY.work.map((it) => {
    const v = inp.work && inp.work[it.key]; const has = v != null;
    return { key: it.key, label: it.label, max: it.max, points: has ? v : (full ? it.max : 0), source: has ? "input" : "unknown" };
  });
  const wSum = wItems.reduce((a, x) => a + x.points, 0);
  parts.push({ key: "work", label: "Tuân thủ", max: 50, points: r2(wSum), source: wItems.every((x) => x.source === "input") ? "input" : wItems.some((x) => x.source === "input") ? "partial" : "unknown", items: wItems });
  const kHas = inp.knowledge != null || knowSys != null;
  const kVal = inp.knowledge != null ? inp.knowledge : knowSys != null ? knowSys.points : null;
  parts.push({ key: "knowledge", label: "Kiến thức", max: POLICY.knowledgeMax, points: kHas ? kVal : (full ? POLICY.knowledgeMax : 0), source: inp.knowledge != null ? "input" : knowSys != null ? "system" : "unknown", note: inp.knowledge == null && knowSys ? "Đợt “" + knowSys.title + "” · " + (knowSys.state === "confirmed" ? "nhân viên đã xác nhận" : "chưa xác nhận") : "" });
  const mHas = inp.modelAch != null && inp.modelTarget > 0;
  const mPts = mHas ? clamp(r2(inp.modelAch / inp.modelTarget * POLICY.modelMax), 0, POLICY.modelMax) : (full ? POLICY.modelMax : 0);
  parts.push({ key: "model", label: "Model định hướng", max: POLICY.modelMax, points: mPts, source: mHas ? "input" : "unknown", detail: mHas ? inp.modelAch + " / " + inp.modelTarget + " model" : "" });
  const total = r2(parts.reduce((a, p) => a + p.points, 0));
  const unknown = parts.some((p) => p.source === "unknown" || p.source === "partial");
  return { parts, total, unknown };
}
function calcMonth(sale, inp, knowSys, assume) {
  const T = sale.target, A = sale.actual || 0, base = POLICY.base, allow = POLICY.lunch + POLICY.phone, review = inp.review || 0;
  const sc = scoreParts(inp, knowSys, assume), factor = factorOf(sc.total), warns = [];
  const res = { month: sale.month, actual: A, target: T, noTarget: !(T > 0), score: sc, factor, base, review, allowances: { lunch: POLICY.lunch, phone: POLICY.phone, total: allow }, warns };
  if (sc.total < POLICY.warnBelow) warns.push("Điểm tuân thủ dưới " + POLICY.warnBelow + ": cảnh cáo bằng văn bản và xem xét chấm dứt hợp đồng.");
  if (sale.probation) warns.push("Đang ở diện “" + sale.probation + "”: chính sách cho nhân sự thử việc có thể khác (chưa tính).");
  if (!(T > 0)) {
    warns.push("Tháng này chưa có chỉ tiêu doanh số nên chưa tính được thưởng hoàn thành doanh thu.");
    Object.assign(res, { group: null, effTarget: null, completion: null, tier: -1, rate: 0, counted: 0, q2dt: 0, bonus: 0 });
  } else {
    const gi = groupOf(T, inp.group), g = gi.g, Te = Math.max(T, g.min), comp = A / Te * 100;
    const tier = comp >= 100 ? 2 : comp >= 80 ? 1 : comp >= POLICY.minCompletion ? 0 : -1, rate = tier >= 0 ? g.rates[tier] : 0, counted = Math.min(A, Te);
    const q2dt = tier >= 0 ? Math.round(counted * rate / 100) : 0;
    if (Te > T) warns.push("Chỉ tiêu được giao (" + Math.round(T / 1e6) + " triệu) thấp hơn mức tối thiểu của " + g.label + " (" + Math.round(g.min / 1e6) + " triệu): tính theo mức tối thiểu.");
    if (tier < 0) warns.push("Hoàn thành " + vnn(r2(comp)) + "% (< " + POLICY.minCompletion + "%): chưa đủ điều kiện nhận thưởng hoàn thành doanh thu.");
    Object.assign(res, { group: { key: g.key, label: g.label, min: g.min, rates: g.rates, byInput: gi.byInput, below: gi.below }, effTarget: Te, completion: r2(comp), tier, rate, counted, q2dt, bonus: Math.round(q2dt * factor / 100) });
  }
  res.total = res.base + res.review + (res.bonus || 0) + res.allowances.total;   // chưa gồm thưởng quý
  return res;
}

// ---- thưởng quý (Q3) cho quý chứa tháng `month` ----
function calcQuarter(month, sales, inputs, knowByMonth, assume) {
  const y = +month.slice(0, 4), q = Math.ceil(+month.slice(5) / 3), ms = [1, 2, 3].map((i) => y + "-" + String((q - 1) * 3 + i).padStart(2, "0"));
  const rows = ms.map((m) => { const s = sales.find((x) => x.month === m); return s ? calcMonth(s, inputs[m] || {}, knowByMonth[m] || null, assume) : { month: m, none: true }; });
  const have = rows.filter((r) => !r.none), withT = have.filter((r) => !r.noTarget);
  const Aq = withT.reduce((a, r) => a + r.actual, 0), Tq = withT.reduce((a, r) => a + r.effTarget, 0);
  const avg = withT.length ? r2(withT.reduce((a, r) => a + r.score.total, 0) / withT.length) : null, ratio = Tq > 0 ? Aq / Tq : null, rev = Math.max(0, Aq - POLICY.q3.baseline * Tq);
  const tf = POLICY.q3.timeFactor === "months" ? withT.length : withT.length / 3;
  const conds = [
    { ok: avg != null && avg >= POLICY.q3.minAvgScore, label: "Điểm tuân thủ trung bình quý từ " + POLICY.q3.minAvgScore + " điểm", detail: avg == null ? "chưa có" : "đang " + vnn(avg) + " điểm" },
    { ok: ratio != null && ratio >= POLICY.q3.minRatio, label: "Doanh thu SO quý đạt từ " + Math.round(POLICY.q3.minRatio * 100) + "% chỉ tiêu", detail: ratio == null ? "chưa có chỉ tiêu" : "đang " + vnn(r2(ratio * 100)) + "%" },
    { ok: withT.length >= POLICY.q3.minMonths, label: "Làm việc và có nhận chỉ tiêu từ " + POLICY.q3.minMonths + " tháng trở lên trong quý", detail: "đang có " + withT.length + " tháng" }
  ];
  const eligible = conds.every((c) => c.ok), q3 = eligible ? Math.round(rev * POLICY.q3.rate * tf) : 0;
  return { label: "Quý " + q + "/" + y, months: rows, monthsWithTarget: withT.length, complete: have.length === 3, actual: Aq, target: Tq, ratio: ratio == null ? null : r2(ratio * 100), baselineTarget: Math.round(POLICY.q3.baseline * Tq), rewardBase: Math.round(rev), rate: POLICY.q3.rate * 100, timeFactor: r2(tf), timeFactorMode: POLICY.q3.timeFactor, avgScore: avg, conditions: conds, eligible, q3 };
}

// ---- gộp toàn bộ cho một nhân viên + tháng ----
async function build(code, opt) {
  opt = opt || {};
  const k = up(code), cands = await quiz.getCandidates(), cand = cands.find((c) => up(c.code) === k);
  if (!cand) return { ok: false, error: "Không tìm thấy nhân viên." };
  const sales = await loadSales(k);
  if (!isPC(cand, sales.length ? sales[sales.length - 1].pos : "")) return { ok: true, isPC: false, code: cand.code, name: cand.name || "", title: cand.title || "", reason: "Chính sách thu nhập này chỉ áp dụng chức danh PC (nhân viên tư vấn sản phẩm)." };
  const inputs = await loadInputs(k);
  Object.keys(opt.override || {}).forEach((m) => { if (MONTH.test(m)) inputs[m] = cleanInputs(opt.override[m]); });   // xem thử số nhập chưa lưu
  const knowByMonth = {};
  try {
    const H = await require("./scoreconfirm").historyOf(k);
    H.forEach((x) => { const m = String(Math.floor(x.key / 100)) + "-" + String(x.key % 100).padStart(2, "0"); const v = num(String(x.final == null ? "" : x.final).replace(",", ".")); if (v != null && v >= 0 && v <= POLICY.knowledgeMax) knowByMonth[m] = { points: v, title: x.title, state: x.state }; });
  } catch (e) { /* chưa có đợt điểm tuân thủ nào */ }
  const months = sales.map((s) => s.month);
  const out = { ok: true, isPC: true, code: cand.code, name: cand.name || "", title: cand.title || "", months, policy: POLICY, inputs, knowledge: knowByMonth, note: "Ước tính gộp, chưa trừ BHXH và thuế; không phải bảng lương." };
  if (!months.length) { out.empty = true; return out; }
  const month = months.indexOf(opt.month) >= 0 ? opt.month : months[months.length - 1];
  out.month = month;
  const sale = sales.find((s) => s.month === month), inp = inputs[month] || {}, kn = knowByMonth[month] || null;
  const max = calcMonth(sale, inp, kn, "max"), min = calcMonth(sale, inp, kn, "min");
  out.sale = { month, target: sale.target, actual: sale.actual, kv: sale.kv, npp: sale.npp, asm: sale.asm, joinDate: sale.joinDate, probation: sale.probation, elapsed: sale.elapsed };
  out.unknown = max.score.unknown;
  out.high = max; out.low = min;
  out.quarterHigh = calcQuarter(month, sales, inputs, knowByMonth, "max"); out.quarterLow = calcQuarter(month, sales, inputs, knowByMonth, "min");
  // bảng nhạy: thưởng tháng theo từng mức điểm tuân thủ (cho thấy điểm tuân thủ ảnh hưởng thế nào)
  const q2 = max.q2dt || 0;
  out.sensitivity = [100, 90, 80, 70, 60, 59].map((sc) => { const f = factorOf(sc); return { score: sc, factor: f, bonus: Math.round(q2 * f / 100), total: max.base + max.review + Math.round(q2 * f / 100) + max.allowances.total }; });
  out.history = sales.map((s) => { const h = calcMonth(s, inputs[s.month] || {}, knowByMonth[s.month] || null, "max"), l = calcMonth(s, inputs[s.month] || {}, knowByMonth[s.month] || null, "min"); return { month: s.month, actual: s.actual, target: s.target, completion: h.completion, score: h.score.total, scoreMin: l.score.total, totalHigh: h.total, totalLow: l.total, unknown: h.score.unknown }; });
  return out;
}

module.exports = { POLICY, isPC, detect, groupOf, factorOf, calcMonth, calcQuarter, cleanInputs, saveInputs, loadSales, build };

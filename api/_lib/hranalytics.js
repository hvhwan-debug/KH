// PHÂN TÍCH NHÂN LỰC (Workforce Intelligence, giai đoạn 3): từ điểm kiểm tra chính thức + hồ sơ nhân sự + số bán, tính
//  - bản đồ khoảng cách năng lực (mảng kiến thức × chức danh) và ưu tiên đào tạo,
//  - quan hệ giữa các biến (hệ số Spearman, trung vị theo nhóm) KÈM cỡ mẫu và mức tin cậy; KHÔNG kết luận nhân quả,
//  - phân nhóm nhân sự theo luật minh bạch, và ma trận đào tạo gợi ý (theo luật, cần quản lí xác nhận).
// Nguyên tắc: chỉ số TỔNG HỢP; không trả tên / mã / email; ô dưới 5 người bị ẩn; kết luận khi nhóm từ 30 người; tuổi chỉ để quản trị xem thống kê,
// KHÔNG đưa cho AI và không dùng để xếp hạng hay quyết định nhân sự.
const quiz = require("./quiz");
const profile = require("./profile");
const CTX = require("./hrcontext");

const MIN_SHOW = 5, MIN_RELIABLE = 10, MIN_CONCLUDE = 30;
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function rank(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
  return r;
}
function pearson(x, y) { const n = x.length, mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; }
function normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
// Hệ số tương quan hạng Spearman; p-value gần đúng (xấp xỉ chuẩn, chỉ dùng khi n >= 30)
function spearman(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const rho = pearson(rank(xs), rank(ys)); if (rho == null) return { n, rho: null, p: null };
  let p = null; if (n >= MIN_CONCLUDE) { const t = rho * Math.sqrt((n - 2) / Math.max(1e-9, 1 - rho * rho)); p = 2 * (1 - normCdf(Math.abs(t))); }
  return { n, rho: Math.round(rho * 1000) / 1000, p: p == null ? null : Math.round(p * 10000) / 10000 };
}
const strength = (rho) => { const a = Math.abs(rho); return a < 0.1 ? "không đáng kể" : a < 0.3 ? "yếu" : a < 0.5 ? "vừa" : "mạnh"; };
const status = (n) => (n >= MIN_CONCLUDE ? "ok" : n >= MIN_RELIABLE ? "low" : "no");

function eduOf(p) {
  const t = fold([p && p.trinhDo, p && p.bangCap].filter(Boolean).join(" ")); if (!t.trim()) return "";
  if (/tien si|thac si|sau dai hoc|master/.test(t)) return "Sau đại học";
  if (/dai hoc|cu nhan|ky su|bachelor/.test(t)) return "Đại học";
  if (/cao dang/.test(t)) return "Cao đẳng";
  if (/trung cap|so cap|nghe/.test(t)) return "Trung cấp / nghề";
  if (/thpt|pho thong|12\/12|tot nghiep/.test(t)) return "Phổ thông";
  return "Khác";
}
const REGION = { bac: "Miền Bắc", nam: "Miền Nam" };
const BANDS = [["Dưới 6 tháng", 0, 6], ["6 đến dưới 12 tháng", 6, 12], ["1 đến dưới 2 năm", 12, 24], ["2 đến dưới 5 năm", 24, 60], ["Từ 5 năm", 60, 1e9]];

// Gom dữ liệu: mỗi nhân sự đang làm việc lấy bài tốt nhất của kỳ được chọn
async function gather(opt) {
  opt = opt || {}; const now = opt.now || Date.now(), budget = opt.budgetMs || 18000, t0 = Date.now(), yr = new Date(now).getFullYear();
  const cands = (await quiz.getCandidates()).filter((c) => !quiz.isLeft(c)), byCode = new Map(cands.map((c) => [quiz.normCode(c.code), c]));
  const index = (await quiz.getIndex()).filter((r) => r && r.status === "submitted" && r.pct != null && isFinite(Number(r.pct)));
  const periodCount = {}; index.forEach((r) => { const p = r.period || ""; periodCount[p] = (periodCount[p] || 0) + 1; });
  const periods = Object.keys(periodCount).map((p) => ({ period: p, n: periodCount[p] })).sort((a, b) => b.n - a.n);
  const period = opt.period != null && periodCount[opt.period] != null ? opt.period : (periods.find((x) => x.n >= MIN_RELIABLE) || periods[0] || { period: "" }).period;
  const best = new Map();
  index.filter((r) => (r.period || "") === period).forEach((r) => { const k = quiz.normCode(r.code); if (!byCode.has(k)) return; const b = best.get(k); if (!b || quiz.betterResult(r, b)) best.set(k, r); });
  let settings = {}; try { settings = await quiz.getExamSettings(period); } catch (e) { settings = {}; }
  const passScore = quiz.passScoreOf(settings) || 60;
  // số bán: % hoàn thành chỉ tiêu của tháng gần nhất có chỉ tiêu
  const sales = new Map();
  try {
    const store = require("./store"), names = (await store.list("kt/sales/").catch(() => [])).filter((x) => /\d{4}-\d{2}\.json$/.test(x)).sort();
    const docs = (await Promise.all(names.map((x) => store.get(x).catch(() => null)))).filter((d) => d && !d.deleted && Array.isArray(d.rows));
    docs.forEach((d) => d.rows.forEach((r) => { if (r.code && r.target > 0) sales.set(quiz.normCode(r.code), Math.round(((r.actual || 0) / r.target) * 1000) / 10); }));
  } catch (e) { /* không có số bán */ }
  const rows = Array.from(best.entries()).map(([k, r]) => {
    const c = byCode.get(k), p = c.profile || {}, since = p.vaoLanDau || p.vaoCongTy;
    return { key: k, id: r.id, title: quiz.titleOf(c) || "PC", aud: CTX.audienceOf({ title: c.title, segment: quiz.normSegment(c.segment) }), region: REGION[quiz.normRegion(c.region || "")] || REGION[quiz.normRegion(p.mien || "")] || "Chưa rõ", pct: Number(r.pct), leaves: (r.flags && r.flags.blur) || 0,
      tenure: since ? profile.monthsSince(since, now) : null, age: Number.isInteger(p.namSinh) ? yr - p.namSinh : null, edu: eduOf(p), sales: sales.has(k) ? sales.get(k) : null, cats: null };
  });
  // điểm theo mảng kiến thức: đọc từng bài (có giới hạn thời gian; bài chưa đọc được thì bỏ khỏi bản đồ năng lực, vẫn tính ở các phần khác)
  let read = 0, i = 0;
  async function worker() { while (i < rows.length && Date.now() - t0 < budget) { const row = rows[i++]; try { const a = await quiz.getAttempt(row.id); if (a && Array.isArray(a.paper)) { const cats = {}; a.paper.forEach((q) => { const cn = String(q.category || "Khác").trim() || "Khác", x = cats[cn] = cats[cn] || { n: 0, ok: 0 }; x.n++; if (q.ok) x.ok++; }); row.cats = cats; read++; } } catch (e) { /* bỏ qua */ } } }
  await Promise.all(Array.from({ length: 10 }, worker));
  return { now, period, periods, passScore, rows, catRead: read, truncated: read < rows.length, examTitle: settings.examTitle || period, population: cands.length };
}

function analyze(d) {
  const rows = d.rows, N = rows.length, pass = d.passScore, scores = rows.map((r) => r.pct);
  const group = (keyFn) => { const m = {}; rows.forEach((r) => { const k = keyFn(r); if (k) (m[k] = m[k] || []).push(r); }); return m; };
  const gstat = (m) => Object.keys(m).map((k) => { const a = m[k].map((r) => r.pct); return { name: k, n: a.length, mean: r1(mean(a)), median: r1(median(a)), below: a.filter((v) => v < pass).length, belowPct: r1(100 * a.filter((v) => v < pass).length / a.length), shown: a.length >= MIN_SHOW }; }).filter((x) => x.shown).sort((a, b) => b.n - a.n);
  const hist = [["Dưới 50", 0, 50], ["50 đến 59", 50, 60], ["60 đến 69", 60, 70], ["70 đến 79", 70, 80], ["80 đến 89", 80, 90], ["90 đến 100", 90, 101]].map(([l, a, b]) => ({ label: l, n: scores.filter((v) => v >= a && v < b).length }));
  const overview = { n: N, mean: r1(mean(scores)), median: r1(median(scores)), passScore: pass, belowPass: scores.filter((v) => v < pass).length, belowPassPct: N ? r1(100 * scores.filter((v) => v < pass).length / N) : 0, hist };
  const byTitle = gstat(group((r) => r.title)), byRegion = gstat(group((r) => r.region));
  // theo đối tượng đào tạo (SR GT1 / SR GT2 / PC / PG / ASM / RSM) kèm mảng yếu nhất của từng đối tượng
  const byAudience = gstat(group((r) => r.aud)).map((g) => { const cs = {}; rows.filter((r) => r.aud === g.name && r.cats).forEach((r) => Object.keys(r.cats).forEach((c) => { const x = cs[c] = cs[c] || { n: 0, ok: 0, emp: 0 }; x.n += r.cats[c].n; x.ok += r.cats[c].ok; x.emp++; }));
    g.weakest = Object.keys(cs).filter((c) => cs[c].emp >= MIN_SHOW).map((c) => ({ category: c, pct: r1(100 * cs[c].ok / cs[c].n) })).filter((w) => w.pct < 80).sort((a, b) => a.pct - b.pct).slice(0, 3); return g; });
  // bản đồ khoảng cách năng lực
  const withCats = rows.filter((r) => r.cats), catAll = {};
  withCats.forEach((r) => Object.keys(r.cats).forEach((c) => { const x = catAll[c] = catAll[c] || { n: 0, ok: 0, emp: 0 }; x.n += r.cats[c].n; x.ok += r.cats[c].ok; x.emp++; }));
  const cats = Object.keys(catAll).filter((c) => catAll[c].emp >= MIN_SHOW).sort();
  const overall = {}; cats.forEach((c) => { overall[c] = r1(100 * catAll[c].ok / catAll[c].n); });
  const titles = byTitle.filter((t) => withCats.filter((r) => r.title === t.name).length >= MIN_SHOW).map((t) => t.name);
  const cell = (list, c) => { const a = list.filter((r) => r.cats[c]); if (a.length < MIN_SHOW) return null; const n = a.reduce((s, r) => s + r.cats[c].n, 0), ok = a.reduce((s, r) => s + r.cats[c].ok, 0); return { pct: r1(100 * ok / n), emp: a.length, gap: r1(100 * ok / n - overall[c]), reliable: a.length >= MIN_RELIABLE }; };
  const gapMap = { categories: cats, titles, overall, cells: titles.map((t) => ({ title: t, values: cats.map((c) => cell(withCats.filter((r) => r.title === t), c)) })), covered: withCats.length, total: N };
  // ưu tiên đào tạo: mảng yếu nhất của từng chức danh
  const priorities = titles.map((t) => { const list = withCats.filter((r) => r.title === t); const items = cats.map((c) => { const x = cell(list, c); if (!x) return null; const low = list.filter((r) => r.cats[c] && r.cats[c].n >= 2 && 100 * r.cats[c].ok / r.cats[c].n < 60).length; return { category: c, pct: x.pct, gap: x.gap, emp: x.emp, lowEmp: low, reliable: x.reliable }; }).filter(Boolean).sort((a, b) => a.pct - b.pct).slice(0, 3); return { title: t, n: list.length, items }; });
  // quan hệ giữa các biến
  const rel = (name, key, note, sensitive) => { const a = rows.filter((r) => r[key] != null); const s = spearman(a.map((r) => r[key]), a.map((r) => r.pct)); const o = { name, n: a.length, status: status(a.length), note: note || "", sensitive: !!sensitive }; if (s && s.rho != null) { o.rho = s.rho; o.p = s.p; o.strength = strength(s.rho); o.direction = s.rho > 0 ? "cùng chiều" : s.rho < 0 ? "ngược chiều" : ""; o.significant = s.p != null ? s.p < 0.05 : null; } return o; };
  const relations = [rel("Thâm niên × điểm kiểm tra", "tenure"), rel("Độ tuổi × điểm kiểm tra", "age", "Chỉ để xem cơ cấu tổng hợp, không dùng xếp hạng hay quyết định nhân sự; không đưa cho AI", true), rel("% hoàn thành chỉ tiêu bán hàng × điểm kiểm tra", "sales", "Chỉ tháng gần nhất có chỉ tiêu"), rel("Số lần rời màn hình × điểm kiểm tra", "leaves", "Tín hiệu hành vi, không phải bằng chứng gian lận")];
  const tenureBands = BANDS.map(([l, a, b]) => { const x = rows.filter((r) => r.tenure != null && r.tenure >= a && r.tenure < b).map((r) => r.pct); return { name: l, n: x.length, median: r1(median(x)), belowPct: x.length ? r1(100 * x.filter((v) => v < pass).length / x.length) : null, shown: x.length >= MIN_SHOW }; }).filter((x) => x.shown);
  const eduGroups = gstat(group((r) => r.edu));
  // phân nhóm theo luật minh bạch (không gắn nhãn cho từng người)
  const SEG = [
    ["S3", "Điểm thấp, cần hỗ trợ hoặc đào tạo lại", "Điểm dưới 50"], ["S1", "Mới vào, nền tảng chưa vững", "Thâm niên dưới 6 tháng và điểm dưới mức đạt"],
    ["S2", "Có kinh nghiệm nhưng điểm chưa đạt", "Thâm niên từ 24 tháng và điểm dưới mức đạt"], ["S8", "Chưa đạt, thâm niên trung bình", "Thâm niên 6 đến dưới 24 tháng, điểm dưới mức đạt"],
    ["S7", "Chưa đạt, thiếu dữ liệu thâm niên", "Điểm dưới mức đạt và chưa có ngày vào công ty"], ["S5", "Điểm tốt, nên trao đổi về cách làm bài", "Điểm từ 85 và rời màn hình từ 4 lần"],
    ["S4", "Điểm tốt, ổn định", "Điểm từ 85 và rời màn hình dưới 4 lần"], ["S6", "Đạt yêu cầu, còn dư địa", "Điểm đạt nhưng dưới 85"]
  ];
  const segOf = (r) => r.pct < 50 ? "S3" : r.pct < pass ? (r.tenure == null ? "S7" : r.tenure < 6 ? "S1" : r.tenure >= 24 ? "S2" : "S8") : r.pct >= 85 ? (r.leaves >= 4 ? "S5" : "S4") : "S6";
  rows.forEach((r) => { r.seg = segOf(r); });
  const segments = SEG.map(([id, name, rule]) => { const list = rows.filter((r) => r.seg === id); const tc = {}; list.forEach((r) => { tc[r.title] = (tc[r.title] || 0) + 1; });
    const weak = {}; list.filter((r) => r.cats).forEach((r) => Object.keys(r.cats).forEach((c) => { const x = weak[c] = weak[c] || { n: 0, ok: 0 }; x.n += r.cats[c].n; x.ok += r.cats[c].ok; }));
    const weakest = Object.keys(weak).filter((c) => list.filter((r) => r.cats && r.cats[c]).length >= MIN_SHOW).map((c) => ({ category: c, pct: r1(100 * weak[c].ok / weak[c].n) })).sort((a, b) => a.pct - b.pct).slice(0, 3);
    return { id, name, rule, n: list.length, share: N ? r1(100 * list.length / N) : 0, titles: Object.keys(tc).sort((a, b) => tc[b] - tc[a]).slice(0, 3).map((t) => t + " (" + tc[t] + ")"), weakest, shown: list.length >= MIN_SHOW }; });
  // ma trận đào tạo theo luật (gợi ý ban đầu; quản lí xác nhận)
  const M = {
    S3: ["Đào tạo lại theo mảng yếu, có huấn luyện trực tiếp", "8 đến 10 giờ trong 3 tuần", "Lớp nhỏ + kiểm tra lại", "Điểm kiểm tra lại đạt mức đạt sau 4 tuần"],
    S1: ["Đào tạo nền tảng tập trung + kèm cặp 1-1 (mentoring)", "6 đến 8 giờ + 4 tuần kèm cặp", "Học trực tiếp + bài kiểm tra ngắn hằng tuần", "Đạt mức đạt ở kiểm tra lại; giảm tỉ lệ dưới mức đạt của nhóm"],
    S2: ["Coaching tại điểm bán bằng tình huống thực tế (tư vấn, xử lý từ chối)", "4 đến 6 giờ trong 3 tuần", "Coaching trực tiếp + video tình huống", "Đạt mức đạt ở kiểm tra lại; quản lí xác nhận áp dụng được vào bán hàng"],
    S8: ["Học bổ sung theo mảng yếu + kèm cặp ngắn", "4 giờ trong 2 tuần", "E-learning + hỏi đáp với quản lí", "Đạt mức đạt ở kiểm tra lại"],
    S7: ["Bổ sung hồ sơ (ngày vào công ty) trước, rồi xếp nhóm đào tạo phù hợp", "—", "Rà soát hồ sơ", "Hồ sơ đầy đủ trước kỳ sau"],
    S5: ["Trao đổi cởi mở, nhắc lại quy định làm bài; không kết luận về từng người", "30 phút", "Quản lí trao đổi trực tiếp", "Giảm số lần rời màn hình ở kỳ sau"],
    S4: ["Tự học nâng cao; làm người chia sẻ (peer mentor) cho đồng nghiệp", "2 giờ mỗi tháng", "E-learning + chia sẻ nhóm", "Duy trì điểm; số buổi chia sẻ"],
    S6: ["Tự học học liệu ở mảng điểm thấp nhất", "2 đến 3 giờ", "E-learning", "Tăng điểm ở mảng yếu nhất ở kỳ sau"]
  };
  const matrix = segments.filter((s) => s.shown && M[s.id] && s.id !== "S4").map((s) => ({ audience: s.name + " (" + s.n + " người; " + s.titles.join(", ") + ")", need: s.weakest.length ? "Mảng thấp nhất: " + s.weakest.map((w) => w.category + " " + w.pct + "%").join("; ") : "Chưa đủ dữ liệu theo mảng", content: s.weakest.length ? s.weakest.map((w) => w.category).join(", ") : "Theo kết quả kiểm tra lại", method: M[s.id][0], duration: M[s.id][1], format: M[s.id][2], kpi: M[s.id][3] }));
  const notes = [];
  if (d.truncated) notes.push("Mới đọc được điểm theo mảng của " + d.catRead + "/" + N + " bài do giới hạn thời gian; bản đồ năng lực dựa trên phần đã đọc.");
  if (N < MIN_CONCLUDE) notes.push("Kỳ này chỉ có " + N + " nhân sự có điểm (dưới " + MIN_CONCLUDE + "): các quan hệ giữa biến chỉ mang tính mô tả, chưa kết luận.");
  return { byAudience, meta: { period: d.period, examTitle: d.examTitle, periods: d.periods, generatedAt: d.now, population: d.population, analysed: N, coverageCats: d.catRead }, overview, byTitle, byRegion, gapMap, priorities, relations, tenureBands, eduGroups, segments, matrix, notes };
}

// Tóm tắt ĐƯA CHO AI: chỉ số tổng hợp ẩn danh; BỎ độ tuổi và mọi quan hệ nhạy cảm; không có tên / mã / email
function aiSummary(a) {
  return { ky: a.meta.examTitle, so_nhan_su_co_diem: a.meta.analysed, tong_quan: { diem_tb: a.overview.mean, trung_vi: a.overview.median, muc_dat: a.overview.passScore, ty_le_duoi_muc_dat: a.overview.belowPassPct },
    theo_chuc_danh: a.byTitle.map((t) => ({ chuc_danh: t.name, n: t.n, diem_tb: t.mean, ty_le_duoi_muc_dat: t.belowPct })), theo_doi_tuong: (a.byAudience || []).map((t) => ({ doi_tuong: t.name, n: t.n, diem_tb: t.mean, ty_le_duoi_muc_dat: t.belowPct, mang_yeu: (t.weakest || []).map((w) => w.category + " " + w.pct + "%") })),
    theo_khu_vuc: a.byRegion.map((t) => ({ khu_vuc: t.name, n: t.n, diem_tb: t.mean, ty_le_duoi_muc_dat: t.belowPct })),
    uu_tien_dao_tao: a.priorities.map((p) => ({ chuc_danh: p.title, n: p.n, mang_yeu: p.items.map((i) => ({ mang: i.category, diem: i.pct, chenh_lech_so_voi_chung: i.gap, so_nguoi: i.emp, tin_cay: i.reliable ? "đủ" : "thấp" })) })),
    quan_he: a.relations.filter((r) => !r.sensitive).map((r) => ({ ten: r.name, n: r.n, muc_mau: r.status === "ok" ? "đủ để kết luận" : r.status === "low" ? "chỉ mô tả" : "chưa đủ", rho: r.rho == null ? null : r.rho, y_nghia_thong_ke: r.significant })),
    theo_tham_nien: a.tenureBands.map((b) => ({ nhom: b.name, n: b.n, trung_vi: b.median, ty_le_duoi_muc_dat: b.belowPct })),
    nhom_nhan_su: a.segments.filter((s) => s.shown).map((s) => ({ nhom: s.name, tieu_chi: s.rule, n: s.n, ty_trong: s.share, mang_yeu: s.weakest.map((w) => w.category + " " + w.pct + "%") })) };
}
module.exports = { gather, analyze, aiSummary, spearman, rank, eduOf, MIN_SHOW, MIN_RELIABLE, MIN_CONCLUDE };

// ĐỀ XUẤT KHUNG NĂNG LỰC THEO PHƯƠNG PHÁP SMART từ chính dữ liệu của hệ thống (nhân viên) + chỉ đạo kinh doanh của tháng (sản phẩm, chiến lược) + bằng chứng thị trường (thư viện benchmark).
// Chỉ ĐỀ XUẤT: không ghi vào khung năng lực. Quản trị viên xem căn cứ, chỉnh rồi bấm Lưu mới có hiệu lực.
//  S (Specific)   — theo từng vị trí × mảng năng lực.
//  M (Measurable) — ngưỡng là % đúng tối thiểu trong mảng (cùng thang với bài kiểm tra).
//  A (Achievable) — mức đề xuất không vượt P90 năng lực hiện có của chính vị trí đó; nêu rõ bao nhiêu % nhân sự hiện đã đạt.
//  R (Relevant)   — ưu tiên mức mà nhóm ĐẠT chỉ tiêu bán (≥ 100%) đang có (trung vị), kèm tương quan giữa điểm mảng và % chỉ tiêu bán; mảng thuộc chiến lược / sản phẩm trọng tâm của tháng; bằng chứng thị trường.
//  T (Time-bound) — lộ trình theo tháng từ mức hiện tại tới mức đề xuất (mặc định 3 tháng).
// Không bịa: chưa đủ số bán thì chỉ dùng MỨC ĐẠT CỦA ĐỀ THI (chuẩn công ty đã có trong hệ thống) và ghi độ tin cậy thấp; chưa đủ 5 người thì không đề xuất.
const quiz = require("./quiz");
const TP = require("./trainplan");

const MIN_PEOPLE = 5, MIN_PAIRS = 10, MIN_GROUP = 4, CAP = 95;
const AREAS = ["sk", "po", "mk", "n1", "n2", "sp"];
const EVID = { mk: ["thi_truong", "doi_thu", "kenh_gt"], sk: ["khach_hang", "coaching"], n1: ["khach_hang", "doi_thu"], n2: ["khach_hang", "doi_thu"], sp: ["khach_hang"], po: [] };
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function pearson(xs, ys) {
  const n = xs.length, mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
const addMonth = (m, k) => { let y = +m.slice(0, 4), mo = +m.slice(5) - 1 + k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + String(mo + 1).padStart(2, "0"); };
const mLabel = (m) => m.slice(5) + "/" + m.slice(0, 4);

async function propose(opt) {
  opt = opt || {}; const month = String(opt.month || ""), horizon = Math.min(6, Math.max(1, Math.round(Number(opt.horizon)) || 3)), months = [3, 6, 12].indexOf(Number(opt.months)) >= 0 ? Number(opt.months) : 0;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Tháng không hợp lệ." };
  const HC = require("./hrcompetency"), data = await HC.build({ months }), st = await quiz.getSettings();
  const passScore = st.passEnabled && isFinite(Number(st.passScore)) && Number(st.passScore) > 0 ? Math.round(Number(st.passScore)) : null;
  const biz = await TP.getBiz(month), items = (biz.strategy || []).concat(biz.goals || [], biz.promos || [], biz.direction || []);
  const focus = Object.fromEntries((biz.focus || []).map((f) => [f.key, f.products])), nprod = Object.fromEntries((biz.newProducts || []).map((f) => [f.key, f.products]));
  let bench = []; try { bench = ((await require("./benchlib").list()).items || []).filter((x) => x.status === "approved" && !/^KHÔNG dùng/i.test(String(x.implication || ""))); } catch (e) { bench = []; }
  const by = {}; data.people.forEach((p) => { const k = Object.keys(require("./hrcontext").AUD).find((x) => require("./hrcontext").AUD[x] === p.audience) || "OTHER"; (by[k] = by[k] || []).push(p); });
  const proposals = [], skipped = []; let withSales = 0;
  Object.keys(TP.SHORT).forEach((k) => {
    const people = by[k]; if (!people) return;
    AREAS.forEach((id) => {
      const rows = people.filter((p) => p.tests).map((p) => ({ p, a: (p.areas || []).find((x) => x.id === id && !x.offScope && x.n >= 4) })).filter((x) => x.a);
      if (!rows.length) return;
      const vals = rows.map((x) => x.a.pct), short = TP.SHORT[k], areaName = TP.AREA_NAME[id];
      if (vals.length < MIN_PEOPLE) { skipped.push({ key: k, short, area: id, areaName, n: vals.length, reason: "Mới có " + vals.length + " người có dữ liệu mảng này (cần ≥ " + MIN_PEOPLE + ") nên chưa đề xuất." }); return; }
      const cur = { avg: r1(mean(vals)), p25: r1(pct(vals, 0.25)), p50: r1(pct(vals, 0.5)), p75: r1(pct(vals, 0.75)), p90: r1(pct(vals, 0.9)) };
      const pairs = rows.filter((x) => x.p.sales && x.p.sales.avg3 != null), xs = pairs.map((x) => x.a.pct), ys = pairs.map((x) => x.p.sales.avg3);
      if (pairs.length) withSales = Math.max(withSales, pairs.length);
      let sales = null;
      if (pairs.length >= MIN_PAIRS) {
        const hi = pairs.filter((x) => x.p.sales.avg3 >= 100).map((x) => x.a.pct), lo = pairs.filter((x) => x.p.sales.avg3 < 100).map((x) => x.a.pct), r = pearson(xs, ys);
        sales = { pairs: pairs.length, high: hi.length, low: lo.length, medHigh: hi.length ? r1(pct(hi, 0.5)) : null, medLow: lo.length ? r1(pct(lo, 0.5)) : null, r: r == null ? null : Math.round(r * 100) / 100,
          relevance: r == null ? "không đo được" : r >= 0.3 ? "mạnh" : r >= 0.15 ? "vừa" : r > 0 ? "yếu" : "không thấy liên hệ" };
      }
      const floor = passScore || 0, usable = sales && sales.high >= MIN_GROUP && sales.low >= MIN_GROUP && sales.medHigh != null && sales.medLow != null && sales.medHigh > sales.medLow;
      let basis = "none", min = null, capped = false;
      if (usable) { basis = "sales"; min = Math.min(CAP, Math.max(floor, Math.round(sales.medHigh))); if (min > Math.round(cur.p90) && Math.round(cur.p90) >= floor) { min = Math.round(cur.p90); capped = true; } }
      else if (passScore) { basis = "passScore"; min = passScore; }
      const meeting = min == null ? null : Math.round(100 * vals.filter((v) => v >= min).length / vals.length);
      const hits = items.filter((x) => HC.areaOf(x) === id).concat(["n1", "n2", "sp"].indexOf(id) >= 0 && focus[k] ? ["Sản phẩm trọng tâm: " + focus[k].join(", ")] : [], ["n1", "n2", "sp"].indexOf(id) >= 0 && nprod[k] ? ["Sản phẩm mới: " + nprod[k].join(", ")] : []);
      const conf = basis === "sales" && sales.pairs >= 30 && sales.r != null && sales.r >= 0.3 ? "cao" : basis === "sales" ? "vừa" : "thấp";
      const road = []; if (min != null) { if (cur.avg >= min) road.push({ month, target: min, note: "duy trì" }); else for (let i = 1; i <= horizon; i++) road.push({ month: addMonth(month, i - 1), target: Math.round(cur.avg + (min - cur.avg) * i / horizon) }); }
      const ev = []; (EVID[id] || []).forEach((t) => { bench.filter((x) => x.topic === t).slice(0, 1).forEach((x) => ev.push({ topic: t, metric: String(x.metric || "").slice(0, 110), implication: String(x.implication || "").slice(0, 220) })); });
      const why = []; why.push(basis === "sales" ? "Nhóm đạt ≥100% chỉ tiêu bán (" + sales.high + " người) có điểm trung vị mảng này " + sales.medHigh + "% so với " + sales.medLow + "% ở nhóm chưa đạt (" + sales.low + " người); tương quan với % chỉ tiêu bán r = " + sales.r + " (" + sales.relevance + ")." + (capped ? " Đã hạ xuống P90 năng lực hiện có (" + Math.round(cur.p90) + "%) để bảo đảm khả thi." : "")
        : basis === "passScore" ? (sales ? "Số bán chưa cho thấy nhóm đạt chỉ tiêu có điểm mảng này cao hơn (hoặc nhóm quá nhỏ): " : "Chưa đủ dữ liệu số bán (" + pairs.length + " người có cả điểm mảng và số bán, cần ≥ " + MIN_PAIRS + "): ") + "dùng mức đạt của đề thi (" + passScore + "%) — chuẩn công ty đã có trong hệ thống; chưa đủ căn cứ đề xuất cao hơn." : "Chưa có mức đạt của đề thi và chưa đủ dữ liệu số bán: không đề xuất.");
      if (hits.length) why.push("Thuộc trọng tâm của tháng: " + hits.join("; ") + ".");
      const smart = { S: short + " · " + areaName, M: min == null ? "Chưa đề xuất" : "≥ " + min + "% đúng trong mảng", A: min == null ? "—" : meeting + "% nhân sự hiện đã đạt mức này (TB " + cur.avg + "%, P25–P75: " + cur.p25 + "–" + cur.p75 + "%)" + (meeting < 20 ? " — mục tiêu tham vọng, cần lộ trình dài" : ""),
        R: why.join(" ") + (ev.length ? " Thị trường: " + ev.map((e) => e.implication).join(" | ") : ""), T: !road.length ? "—" : road[0].note ? "Duy trì ≥ " + min + "%" : "Lộ trình " + horizon + " tháng: " + road.map((x) => mLabel(x.month) + " ≥ " + x.target + "%").join(", ") };
      proposals.push({ key: k, short, area: id, areaName, n: vals.length, current: cur, sales, basis, min, confidence: conf, capped, meeting, hits, roadmap: road, evidence: ev, smart });
    });
  });
  return { ok: true, month, horizon, scope: months, passScore, people: data.people.length, withSales, proposals, skipped,
    note: "Đây là ĐỀ XUẤT dựa trên dữ liệu hiện có (nhân viên, số bán, chỉ đạo kinh doanh, bằng chứng thị trường). Chưa có hiệu lực cho tới khi bạn xem, chỉnh và bấm “Lưu khung năng lực”. Tương quan chỉ cho thấy mối liên hệ, không chứng minh nhân quả." };
}
module.exports = { propose };

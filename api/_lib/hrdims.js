// NHẬN ĐỊNH THEO TỪNG NGƯỜI, TỪNG QUẢN LÍ, TỪNG TỈNH, TỪNG NGÀNH (kênh GT)
//  Ngành 1: máy lọc nước (Karofi, Livotec) · Ngành 2: gia dụng Livotec · Cả hai ngành.
//  - Nhận định theo LUẬT (tức thì, minh bạch) cho mọi người / mọi nhóm, từ: điểm kiểm tra chính thức kỳ được chọn, xu hướng so với kỳ trước,
//    mảng kiến thức yếu, số lần rời màn hình, thâm niên, % hoàn thành chỉ tiêu bán (nếu có).
//  - Nhận định bằng AI theo yêu cầu: máy chủ TỰ dựng dữ liệu (không nhận số liệu từ trình duyệt); gửi cho AI mã ẩn danh, không gửi tên, email,
//    số điện thoại hay tuổi. Chỉ quản trị viên gọi được (qua kt-admin).
//  - Không kết luận nhân quả; không đề xuất quyết định bất lợi về nhân sự; rời màn hình chỉ là tín hiệu để trao đổi.
const quiz = require("./quiz");
const H = require("./hranalytics");
const llm = require("./llm");

const SEG = { may_loc: "Ngành 1 · Máy lọc nước (Karofi, Livotec)", gia_dung: "Ngành 2 · Gia dụng Livotec", both: "Cả hai ngành" };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const PROV = () => require("./provinces");

function weakCats(cats, minN) {
  if (!cats) return [];
  return Object.keys(cats).filter((c) => cats[c].n >= (minN || 1)).map((c) => ({ category: c, pct: Math.round(100 * cats[c].ok / cats[c].n), n: cats[c].n }))
    .sort((a, b) => a.pct - b.pct || b.n - a.n);
}

// Nhận định theo luật cho một người
function personRules(p, pass) {
  const mid = Math.max(pass, 70), out = { level: "", notes: [], actions: [] };
  out.level = p.pct >= 90 ? "Tốt" : p.pct >= mid ? "Đạt" : p.pct >= pass ? "Đạt mức tối thiểu" : p.pct >= 50 ? "Chưa đạt" : "Cần hỗ trợ ngay";
  if (p.prev != null) { const d = r1(p.pct - p.prev); out.notes.push(d > 0 ? "Tiến bộ +" + d + " điểm so với kỳ trước (" + p.prev + "%)." : d < 0 ? "Giảm " + Math.abs(d) + " điểm so với kỳ trước (" + p.prev + "%)." : "Giữ nguyên so với kỳ trước."); }
  const weak = p.weak.filter((w) => w.pct < 60 && w.n >= 2).slice(0, 2);
  if (weak.length) { out.notes.push("Mảng còn yếu: " + weak.map((w) => w.category + " " + w.pct + "%").join(", ") + "."); out.actions.push("Ôn lại học liệu mảng " + weak.map((w) => w.category).join(", ") + " rồi làm bài kiểm tra lại."); }
  if (p.sales != null) {
    const kGood = p.pct >= mid, sGood = p.sales >= 100;
    out.notes.push("Hoàn thành chỉ tiêu bán: " + p.sales + "%.");
    if (kGood && !sGood) out.actions.push("Kiến thức tốt nhưng kết quả bán chưa tương xứng: quản lí xem cùng tại điểm bán (kỹ năng tư vấn, chốt đơn) và các yếu tố ngoài năng lực (hàng, giá, điểm bán).");
    else if (!kGood && sGood) out.actions.push("Bán tốt nhưng điểm kiến thức chưa cao: cập nhật kiến thức sản phẩm để giữ hiệu quả bền vững.");
    else if (!kGood && !sGood) out.actions.push("Cả điểm kiến thức và kết quả bán đều thấp: ưu tiên kèm cặp trực tiếp 1-1 trong 2 đến 4 tuần.");
  }
  if (p.tenure != null && p.tenure < 6) out.notes.push("Mới vào (" + p.tenure + " tháng).");
  if (p.tenure != null && p.tenure < 6 && p.pct < pass) out.actions.push("Đào tạo nền tảng + kèm cặp cho nhân sự mới.");
  if (p.leaves >= 4) { out.notes.push("Rời màn hình " + p.leaves + " lần khi làm bài (tín hiệu, không phải bằng chứng)."); out.actions.push("Quản lí trao đổi cởi mở về cách làm bài, nhắc lại quy định."); }
  if (p.pct >= 90 && p.leaves < 4) out.actions.push("Có thể làm người chia sẻ kinh nghiệm cho đồng nghiệp.");
  if (!out.actions.length) out.actions.push(p.pct >= pass ? "Tự học nâng cao ở mảng điểm thấp nhất." : "Ôn tập theo học liệu và làm lại bài kiểm tra.");
  return out;
}

// Thống kê + nhận định theo luật cho một nhóm (quản lí / tỉnh / ngành)
function groupStat(name, list, overallMean, pass) {
  const a = list.map((r) => r.pct), cats = {};
  list.forEach((r) => { if (r.cats) Object.keys(r.cats).forEach((c) => { const x = cats[c] = cats[c] || { n: 0, ok: 0, emp: 0 }; x.n += r.cats[c].n; x.ok += r.cats[c].ok; x.emp++; }); });
  const weak = Object.keys(cats).filter((c) => cats[c].emp >= Math.min(3, list.length)).map((c) => ({ category: c, pct: Math.round(100 * cats[c].ok / cats[c].n) })).filter((w) => w.pct < 80).sort((x, y) => x.pct - y.pct).slice(0, 3); // chỉ mảng dưới 80% mới tính là yếu
  const prevPairs = list.filter((r) => r.prev != null), sal = list.filter((r) => r.sales != null).map((r) => r.sales);
  const g = { name, n: list.length, mean: r1(mean(a)), median: r1(median(a)), below: a.filter((v) => v < pass).length, belowPct: list.length ? r1(100 * a.filter((v) => v < pass).length / list.length) : 0,
    trend: prevPairs.length >= 3 ? r1(mean(prevPairs.map((r) => r.pct - r.prev))) : null, trendN: prevPairs.length,
    salesMean: sal.length >= 3 ? r1(mean(sal)) : null, salesN: sal.length, leaves4: list.filter((r) => r.leaves >= 4).length, weak, reliable: list.length >= 10 };
  const notes = [], actions = [];
  if (overallMean != null && g.mean != null) { const d = r1(g.mean - overallMean); notes.push("Điểm TB " + g.mean + "% (" + (d >= 0 ? "+" : "") + d + " so với chung " + overallMean + "%)."); }
  if (g.below) notes.push(g.below + "/" + g.n + " người dưới mức đạt (" + g.belowPct + "%).");
  if (g.trend != null) notes.push("Xu hướng so với kỳ trước: " + (g.trend >= 0 ? "+" : "") + g.trend + " điểm (" + g.trendN + " người có kỳ trước).");
  if (g.salesMean != null) notes.push("Hoàn thành chỉ tiêu bán TB: " + g.salesMean + "% (" + g.salesN + " người).");
  if (weak.length) { notes.push("Mảng yếu nhất: " + weak.map((w) => w.category + " " + w.pct + "%").join(", ") + "."); actions.push("Tổ chức ôn tập chung mảng " + weak[0].category + " cho nhóm."); }
  if (g.belowPct >= 30) actions.push("Kèm cặp riêng " + g.below + " người dưới mức đạt và cho kiểm tra lại.");
  if (g.leaves4) actions.push(g.leaves4 + " người rời màn hình từ 4 lần: nhắc lại quy định làm bài.");
  if (!g.reliable) notes.push("Nhóm dưới 10 người: chỉ nên xem như tín hiệu tham khảo.");
  g.notes = notes; g.actions = actions.length ? actions : ["Duy trì; tự học nâng cao ở mảng điểm thấp nhất."];
  return g;
}

async function build(opt) {
  opt = opt || {};
  const d = await H.gather({ period: opt.period });
  const pass = d.passScore, cands = await quiz.getCandidates(), byCode = new Map(cands.map((c) => [quiz.normCode(c.code), c]));
  // điểm kỳ TRƯỚC của từng người (kỳ khác, nộp trước kỳ đang xem): bài tốt nhất của kỳ gần nhất
  const index = (await quiz.getIndex()).filter((r) => r && r.status === "submitted" && r.pct != null && isFinite(Number(r.pct)));
  const curStart = Math.min.apply(null, index.filter((r) => (r.period || "") === d.period).map((r) => r.submittedAt || 0).concat([Date.now()]));
  const prevOf = new Map();
  index.filter((r) => (r.period || "") !== d.period && (r.submittedAt || 0) < curStart).forEach((r) => {
    const k = quiz.normCode(r.code), o = prevOf.get(k);
    if (!o || (r.submittedAt || 0) > o.t || (r.period === o.period && Number(r.pct) > o.pct)) prevOf.set(k, { t: r.submittedAt || 0, period: r.period || "", pct: Number(r.pct) });
  });
  const people = d.rows.map((r) => {
    const c = byCode.get(r.key) || {}, pv = prevOf.get(r.key);
    const p = { code: c.code || r.key, name: c.name || "", title: r.title, manager: String(c.manager || "").trim() || "(Chưa có quản lí)",
      province: PROV().canonProvince(c.province) || "(Chưa rõ tỉnh)", region: r.region, segment: quiz.normSegment(c.segment), pct: r.pct,
      prev: pv ? r1(pv.pct) : null, leaves: r.leaves, tenure: r.tenure, sales: r.sales, weak: weakCats(r.cats, 1).slice(0, 4), cats: r.cats };
    p.rules = personRules(p, pass); return p;
  }).sort((a, b) => a.pct - b.pct);
  const overallMean = r1(mean(people.map((p) => p.pct)));
  const dim = (keyFn, label) => { const m = {}; people.forEach((p) => { const k = keyFn(p); (m[k] = m[k] || []).push(p); }); return Object.keys(m).map((k) => groupStat(label ? label(k) : k, m[k], overallMean, pass)).sort((a, b) => (a.mean || 0) - (b.mean || 0)); };
  const out = {
    meta: { period: d.period, examTitle: d.examTitle, periods: d.periods, passScore: pass, analysed: people.length, overallMean, channel: "Kênh GT", truncated: d.truncated },
    managers: dim((p) => p.manager), provinces: dim((p) => p.province), segments: dim((p) => p.segment, (k) => SEG[k] || k),
    people: people.map((p) => { const o = Object.assign({}, p, { segmentLabel: SEG[p.segment] || p.segment }); delete o.cats; return o; })
  };
  return out;
}

// ---------- AI ----------
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
function parse(text) { const t = String(text || ""), a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }
const SYSTEM = [
  "Bạn là chuyên gia phân tích nhân lực và đào tạo cho đội ngũ kinh doanh kênh GT (ngành 1: máy lọc nước Karofi và Livotec; ngành 2: gia dụng Livotec). Viết tiếng Việt chuyên nghiệp, ngắn gọn, ngôi trung tính.",
  "CHỈ dùng số liệu trong JSON được cung cấp; không bịa số, không suy đoán đời tư. Mỗi nhận định kèm con số làm bằng chứng. Thiếu dữ liệu thì nói là thiếu.",
  "Không kết luận nhân quả từ tương quan. Nhóm dưới 10 người hoặc người chỉ có một bài kiểm tra: ghi độ tin cậy thấp.",
  "Không đề xuất quyết định bất lợi về nhân sự (kỷ luật, hạ bậc, cho nghỉ). Rời màn hình chỉ là tín hiệu để quản lí trao đổi, không phải bằng chứng gian lận.",
  "Không mặc định mọi vấn đề giải quyết bằng đào tạo: khi điểm kiến thức tốt mà kết quả bán thấp, nêu khả năng do kỹ năng bán hoặc yếu tố ngoài năng lực (hàng, giá, điểm bán) cần quản lí kiểm chứng.",
  "Chỉ trả về MỘT đối tượng JSON hợp lệ: {\"items\":[{\"id\":string,\"nhan_dinh\":string,\"diem_manh\":[string],\"can_cai_thien\":[string],\"de_xuat\":[string],\"do_tin_cay\":\"cao|vừa|thấp\"}]}. Mỗi phần tử ứng với đúng một id trong dữ liệu; nhan_dinh 2 đến 4 câu; mỗi mảng tối đa 3 ý."
].join(" ");

function aiPerson(p, i) { return { id: "NV" + (i + 1), chuc_danh: p.title, nganh: SEG[p.segment] || p.segment, khu_vuc: p.region, diem: p.pct, diem_ky_truoc: p.prev, mang_kien_thuc: p.weak.map((w) => ({ mang: w.category, ty_le_dung: w.pct, so_cau: w.n })), so_lan_roi_man_hinh: p.leaves, tham_nien_thang: p.tenure, hoan_thanh_chi_tieu_ban: p.sales }; }
function aiGroup(g, i, kind) { return { id: (kind === "managers" ? "QL" : kind === "provinces" ? "TINH" : "NGANH") + (i + 1), ten: kind === "managers" ? undefined : g.name, so_nguoi: g.n, diem_tb: g.mean, trung_vi: g.median, ty_le_duoi_muc_dat: g.belowPct, xu_huong_so_ky_truoc: g.trend, hoan_thanh_chi_tieu_ban_tb: g.salesMean, so_nguoi_co_so_ban: g.salesN, so_nguoi_roi_man_hinh_tu_4: g.leaves4, mang_yeu: g.weak.map((w) => w.category + " " + w.pct + "%") }; }

// kind: managers | provinces | segments | person ; key: tên nhóm hoặc mã NV
async function ai(opt) {
  const kind = String(opt.kind || ""), data = await build({ period: opt.period });
  let list, ids, payload;
  if (kind === "person") {
    const p = data.people.find((x) => quiz.normCode(x.code) === quiz.normCode(opt.key)); if (!p) return { ok: false, error: "Không tìm thấy nhân sự này trong kỳ đã chọn." };
    list = [p]; payload = [aiPerson(p, 0)];
  } else if (kind === "managers" || kind === "provinces" || kind === "segments") {
    list = data[kind].filter((g) => g.n >= 3).slice(0, 40); if (!list.length) return { ok: false, error: "Chưa có nhóm nào đủ 3 người để nhận định." };
    payload = list.map((g, i) => aiGroup(g, i, kind));
  } else return { ok: false, error: "Loại nhận định không hợp lệ." };
  ids = payload.map((x) => x.id);
  const user = "Kỳ: " + s(data.meta.examTitle, 120) + ". Kênh GT. Mức đạt: " + data.meta.passScore + "%. Điểm TB chung: " + data.meta.overallMean + "%.\n" +
    "Đối tượng: " + (kind === "person" ? "một nhân sự (mã ẩn danh)" : kind === "managers" ? "từng đội của quản lí (tên quản lí được ẩn)" : kind === "provinces" ? "từng tỉnh/thành" : "từng ngành hàng") + ".\n" +
    "Dữ liệu (JSON):\n" + JSON.stringify(payload) + "\n\nViết nhận định cho TỪNG id.";
  let text; try { text = await llm.chat([{ role: "system", content: SYSTEM }, { role: "user", content: user }], { temperature: 0.3, max_tokens: kind === "person" ? 900 : Math.min(4000, 400 + payload.length * 260), task: "hr-dims", json: true, timeoutMs: 28000 }); }
  catch (e) { return { ok: false, error: "AI tạm thời không khả dụng, vui lòng thử lại sau." }; }
  const o = parse(text); if (!o || !Array.isArray(o.items)) return { ok: false, error: "AI trả về kết quả không đọc được, vui lòng thử lại." };
  const A = (v) => (Array.isArray(v) ? v.slice(0, 3).map((x) => s(x, 300)).filter(Boolean) : []);
  const items = o.items.filter((x) => x && ids.indexOf(String(x.id)) >= 0).map((x) => {
    const i = ids.indexOf(String(x.id)), src = list[i];
    return { key: kind === "person" ? src.code : src.name, nhan_dinh: s(x.nhan_dinh, 900), diem_manh: A(x.diem_manh), can_cai_thien: A(x.can_cai_thien), de_xuat: A(x.de_xuat), do_tin_cay: ["cao", "vừa", "thấp"].indexOf(s(x.do_tin_cay, 8)) >= 0 ? s(x.do_tin_cay, 8) : "thấp" };
  });
  if (!items.length) return { ok: false, error: "AI chưa trả nhận định nào, vui lòng thử lại." };
  return { ok: true, kind, period: data.meta.period, items };
}

module.exports = { build, ai, personRules, groupStat, SEG, SYSTEM };

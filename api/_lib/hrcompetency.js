// HỒ SƠ NĂNG LỰC TOÀN HỆ THỐNG (Workforce Intelligence): dựa trên TOÀN BỘ dữ liệu hiện có, không chỉ một kỳ kiểm tra.
//  Nguồn: mọi bài kiểm tra chính thức (mọi kỳ, điểm theo mảng kiến thức của từng câu), số bán mọi tháng, câu hỏi nhân viên gửi Trợ lí KAI,
//  chương trình học đã đăng ký, học liệu, ngân hàng câu hỏi, kho tri thức sản phẩm / chính sách / thị trường của KAI, hồ sơ nhân sự.
//  Năng lực được gom theo khung: sản phẩm ngành 1 (máy lọc nước), sản phẩm ngành 2 (điện gia dụng), sản phẩm chung, kỹ năng bán & tư vấn,
//  thị trường & đối thủ, chính sách / quy trình / tiêu chuẩn, kiến thức chung. Điểm năng lực có trọng số thời gian (bài gần đây nặng hơn,
//  bán rã 180 ngày) và mức tin cậy theo số câu đã trả lời.
//  Nguyên tắc: không suy đoán dữ liệu thiếu; không kết luận nhân quả; không đề xuất quyết định bất lợi; AI chỉ nhận mã ẩn danh và số liệu.
const quiz = require("./quiz");
const store = require("./store");
const CTX = require("./hrcontext");
const profile = require("./profile");

const CACHE_KEY = "kt/hr-competency.json", CAT_KEY = "kt/hr-catcache.json", CACHE_MS = 20 * 60 * 1000, HALF_DAYS = 180;
const fold = CTX.fold;
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// Khung năng lực: thứ tự khớp quan trọng (mảng cụ thể trước, chung sau)
const AREAS = [
  ["mk", "Thị trường & đối thủ", /doi thu|thi truong|canh tranh|sunhouse|kangaroo|toshiba|panasonic|daikin|ferroli|ariston/],
  ["po", "Chính sách, quy trình & tiêu chuẩn", /chinh sach|quy trinh|quy dinh|trung bay|tieu chuan|bao hanh|khuyen mai|bang gia|gia ban|chiet khau|cong no|dat hang/],
  ["sk", "Kỹ năng bán hàng & tư vấn", /ky nang|tu van|xu ly|thuyet phuc|ban hang|chot|khai thac|giao tiep|tu choi|phan doi|cham soc khach|dai ly|diem ban/],
  ["n1", "Sản phẩm ngành 1 · Máy lọc nước", /loc nuoc|may loc|\bro\b|karofi|loi loc|nano|hydrogen|kiem|nong lanh|cay nuoc|uf\b|tds/],
  ["n2", "Sản phẩm ngành 2 · Điện gia dụng", /gia dung|bep|dieu hoa|binh nong|nuoc nong|noi com|noi chien|quat|may hut|lo vi song|may say|may rua/],
  ["sp", "Kiến thức sản phẩm (chung)", /san pham|cong nghe|tinh nang|thong so|model|dong may/],
  ["gn", "Kiến thức chung", /.*/]
];
const AREA_NAME = Object.fromEntries(AREAS.map((a) => [a[0], a[1]]));
// Gắn THỦ CÔNG danh mục câu hỏi → mảng năng lực (khi tên danh mục không khớp từ khoá nên bị xếp vào "Kiến thức chung" và không được tính).
// Lưu ở kt/hr-areamap.json: { map: { "<tên danh mục viết thường, bỏ dấu>": "n1" } }. Mặc định rỗng = hành vi cũ.
const AREA_MAP_KEY = "kt/hr-areamap.json"; let OVR = {};
function areaOf(text) { const t = fold(text); if (OVR[t]) return OVR[t]; for (const a of AREAS) if (a[2].test(t)) return a[0]; return "gn"; }
async function getAreaMap() { const d = await store.get(AREA_MAP_KEY).catch(() => null), m = (d && d.map) || {}, out = {}; Object.keys(m).forEach((k) => { if (AREA_NAME[m[k]]) out[k] = m[k]; }); return out; }
async function setAreaMap(entries, by) { // entries: { "Tên danh mục": "n1" | "" (bỏ gắn thủ công) }
  const cur = await getAreaMap();
  Object.keys(entries || {}).forEach((name) => { const k = fold(name), v = entries[name]; if (!k) return; if (v === "" || v == null) delete cur[k]; else if (AREA_NAME[v]) cur[k] = v; });
  await store.put(AREA_MAP_KEY, { map: cur, updatedAt: Date.now(), by: String(by || "").toLowerCase() }); OVR = cur;
  await store.del(CACHE_KEY).catch(() => {}); // hồ sơ năng lực đang lưu tạm 20 phút: bỏ để tính lại theo cách gắn mới
  return cur;
}
const SEG_AREA = { may_loc: ["n2"], gia_dung: ["n1"] }; // mảng chuyên sâu của ngành KHÁC (không tính vào chỉ số năng lực của người chỉ bán một ngành)

function addCats(dst, cats, w) { Object.keys(cats || {}).forEach((c) => { const a = areaOf(c), x = dst[a] = dst[a] || { n: 0, ok: 0, wn: 0, wok: 0, raw: {} }; x.n += cats[c].n; x.ok += cats[c].ok; x.wn += w * cats[c].n; x.wok += w * cats[c].ok; const rr = x.raw[c] = x.raw[c] || { n: 0, ok: 0 }; rr.n += cats[c].n; rr.ok += cats[c].ok; }); }
const conf = (n) => (n >= 20 ? "cao" : n >= 8 ? "vừa" : "thấp");
const level = (v) => (v == null ? "Chưa có dữ liệu" : v >= 85 ? "Thành thạo" : v >= 70 ? "Vững" : v >= 60 ? "Đạt cơ bản" : v >= 45 ? "Cần củng cố" : "Cần đào tạo lại");

async function loadCatCache(index, budgetMs) {
  const cache = (await store.get(CAT_KEY).catch(() => null)) || {}, t0 = Date.now();
  const need = index.filter((r) => !cache[r.id]); let i = 0, changed = 0;
  async function worker() { while (i < need.length && Date.now() - t0 < budgetMs) { const r = need[i++]; try { const a = await quiz.getAttempt(r.id); if (a && Array.isArray(a.paper)) { const cats = {}; a.paper.forEach((q) => { const c = String((q && q.category) || "Khác").trim() || "Khác", x = cats[c] = cats[c] || { n: 0, ok: 0 }; x.n++; if (q && q.ok) x.ok++; }); cache[r.id] = cats; changed++; } else cache[r.id] = {}; } catch (e) { /* đọc lại lần sau */ } } }
  await Promise.all(Array.from({ length: 12 }, worker));
  if (changed) await store.put(CAT_KEY, cache).catch(() => {});
  return { cache, missing: need.length - changed };
}

async function compute(opt) {
  opt = opt || {}; OVR = await getAreaMap(); const now = opt.now || Date.now(), yr = new Date(now).getFullYear();
  const cands = (await quiz.getCandidates()).filter((c) => !quiz.isLeft(c)), byCode = new Map(cands.map((c) => [quiz.normCode(c.code), c]));
  const index = (await quiz.getIndex()).filter((r) => r && r.status === "submitted" && r.pct != null && isFinite(Number(r.pct)) && byCode.has(quiz.normCode(r.code)));
  const { cache, missing } = await loadCatCache(index, opt.budgetMs || 20000);
  // số bán mọi tháng
  const sales = new Map(); let salesMonths = [];
  try {
    const names = (await store.list("kt/sales/").catch(() => [])).filter((x) => /\d{4}-\d{2}\.json$/.test(x)).sort();
    const docs = await Promise.all(names.map((x) => store.get(x).catch(() => null)));
    docs.forEach((d, k) => { if (!d || d.deleted || !Array.isArray(d.rows)) return; const m = names[k].match(/(\d{4}-\d{2})\.json$/)[1]; salesMonths.push(m);
      d.rows.forEach((r) => { if (r.code && r.target > 0) { const key = quiz.normCode(r.code); (sales.get(key) || sales.set(key, []).get(key)).push({ m, v: Math.round(((r.actual || 0) / r.target) * 1000) / 10 }); } }); });
  } catch (e) { /* chưa có số bán */ }
  // câu hỏi gửi Trợ lí KAI (nhu cầu kiến thức thực tế)
  const kai = new Map(), kaiArea = {}; let kaiTotal = 0;
  try { ((await store.get("kai/log.json")) || []).forEach((l) => { if (!l || !l.question) return; kaiTotal++; const a = areaOf(l.question); kaiArea[a] = (kaiArea[a] || 0) + 1; const k = quiz.normCode(l.code); if (!k) return; const o = kai.get(k) || kai.set(k, { n: 0, n90: 0, areas: {} }).get(k); o.n++; if (now - (l.ts || 0) < 90 * 864e5) o.n90++; o.areas[a] = (o.areas[a] || 0) + 1; }); } catch (e) { /* không có nhật ký */ }
  // chương trình học đã đăng ký
  const progs = new Map(); let progCount = 0;
  try { const P = require("./programs"), list = await P.list(); progCount = list.length; for (const p of list.slice(0, 60)) { const R = await P.regs(p.id); Object.keys(R.regs || {}).forEach((c) => { const k = quiz.normCode(c); progs.set(k, (progs.get(k) || 0) + 1); }); } } catch (e) { /* chưa có chương trình */ }
  // học liệu, ngân hàng câu hỏi, kho tri thức: độ phủ theo mảng năng lực
  let hl = { categories: [], items: [] }; try { hl = await require("./hoclieu").load(); } catch (e) { /* chưa có học liệu */ }
  const catName = Object.fromEntries((hl.categories || []).map((c) => [c.id, c.name]));
  const hlItems = (hl.items || []).filter((x) => x && x.title && x.hidden !== true).map((x) => ({ id: x.id, title: String(x.title).slice(0, 150), cat: catName[x.cat] || "", area: areaOf(x.title + " " + (x.desc || "") + " " + (catName[x.cat] || "")) }));
  let qs = []; try { qs = (await quiz.getQuestions()).filter((q) => q && q.active !== false); } catch (e) { qs = []; }
  let kb = []; try { kb = await require("./kai-kb").getSections(); } catch (e) { kb = []; }
  const cover = {}; AREAS.forEach((a) => { cover[a[0]] = { area: a[1], questions: 0, materials: 0, kbDocs: 0, kaiAsks: kaiArea[a[0]] || 0 }; });
  qs.forEach((q) => { cover[areaOf((q.category || "") + " " + (q.tags || []).join(" "))].questions++; });
  hlItems.forEach((x) => { cover[x.area].materials++; });
  (kb || []).forEach((s) => { cover[areaOf(s.title || "")].kbDocs++; });

  // --- từng người
  const byPerson = new Map(); index.forEach((r) => { const k = quiz.normCode(r.code); (byPerson.get(k) || byPerson.set(k, []).get(k)).push(r); });
  const people = cands.map((c) => {
    const k = quiz.normCode(c.code), seg = quiz.normSegment(c.segment), att = (byPerson.get(k) || []).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
    const areas = {}; let wsum = 0, wpct = 0;
    att.forEach((r) => { const w = Math.pow(0.5, Math.max(0, now - (r.submittedAt || now)) / (HALF_DAYS * 864e5)); wsum += w; wpct += w * Number(r.pct); addCats(areas, cache[r.id], w); });
    const off = SEG_AREA[seg] || [];
    const areaList = Object.keys(areas).map((a) => ({ id: a, name: AREA_NAME[a], pct: r1(100 * areas[a].wok / areas[a].wn), n: areas[a].n, conf: conf(areas[a].n), offScope: off.indexOf(a) >= 0,
      topics: Object.keys(areas[a].raw).map((t) => ({ name: t, pct: Math.round(100 * areas[a].raw[t].ok / areas[a].raw[t].n), n: areas[a].raw[t].n })).sort((x, y) => x.pct - y.pct).slice(0, 4) })).sort((x, y) => x.pct - y.pct);
    const S = (sales.get(k) || []).sort((a, b) => (a.m < b.m ? -1 : 1)), K = kai.get(k) || { n: 0, n90: 0, areas: {} }, p = c.profile || {}, since = p.vaoLanDau || p.vaoCongTy;
    const scope = areaList.filter((a) => !a.offScope);
    return {
      code: c.code, name: c.name || "", title: quiz.titleOf(c), audience: CTX.audienceOf({ title: c.title, segment: seg }), needs: CTX.needsOf({ title: c.title, segment: seg }),
      manager: String(c.manager || "").trim() || "(Chưa có quản lí)", province: require("./provinces").canonProvince(c.province) || "(Chưa rõ tỉnh)", segment: seg,
      tenure: since ? profile.monthsSince(since, now) : null,
      tests: att.length, index: wsum ? r1(wpct / wsum) : null, latest: att.length ? r1(Number(att[att.length - 1].pct)) : null, first: att.length ? r1(Number(att[0].pct)) : null,
      lastAt: att.length ? att[att.length - 1].submittedAt || null : null, leavesAvg: att.length ? r1(mean(att.map((r) => (r.flags && r.flags.blur) || 0))) : null,
      areas: areaList, scopeIndex: scope.length ? r1(mean(scope.filter((a) => a.n >= 4).map((a) => a.pct))) : null,
      sales: S.length ? { months: S.length, latest: S[S.length - 1].v, avg3: r1(mean(S.slice(-3).map((x) => x.v))), series: S.slice(-6) } : null,
      kai: { n: K.n, n90: K.n90, topArea: Object.keys(K.areas).sort((a, b) => K.areas[b] - K.areas[a])[0] || null }, programs: progs.get(k) || 0
    };
  });
  people.forEach((p) => { p.level = level(p.index); p.rules = personRules(p, hlItems, now); });

  // --- toàn hệ thống
  const tested = people.filter((p) => p.tests);
  const sysAreas = {}; tested.forEach((p) => p.areas.forEach((a) => { if (a.offScope) return; const x = sysAreas[a.id] = sysAreas[a.id] || { v: [], n: 0 }; x.v.push(a.pct); x.n += a.n; }));
  const areaMap = Object.keys(sysAreas).map((a) => ({ id: a, name: AREA_NAME[a], pct: r1(mean(sysAreas[a].v)), people: sysAreas[a].v.length, questions: sysAreas[a].n, weakPeople: sysAreas[a].v.filter((v) => v < 60).length })).sort((x, y) => x.pct - y.pct);
  // xu hướng theo tháng (mọi bài)
  const months = {}; index.forEach((r) => { const d = new Date((r.submittedAt || 0) + 7 * 3600e3), m = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); const x = months[m] = months[m] || { v: [], areas: {} }; x.v.push(Number(r.pct)); addCats(x.areas, cache[r.id], 1); });
  const trend = Object.keys(months).sort().slice(-12).map((m) => ({ month: m, n: months[m].v.length, pct: r1(mean(months[m].v)), areas: Object.fromEntries(Object.keys(months[m].areas).map((a) => [a, r1(100 * months[m].areas[a].ok / months[m].areas[a].n)])) }));
  // ma trận đối tượng × mảng
  const audMap = {}; tested.forEach((p) => p.areas.forEach((a) => { if (a.offScope || a.n < 4) return; const k = p.audience, x = (audMap[k] = audMap[k] || {})[a.id] = (audMap[k] || {})[a.id] || { v: [] }; x.v.push(a.pct); }));
  const audRows = Object.keys(audMap).map((k) => ({ audience: k, people: tested.filter((p) => p.audience === k).length, cells: Object.fromEntries(Object.keys(audMap[k]).map((a) => [a, audMap[k][a].v.length >= 3 ? { pct: r1(mean(audMap[k][a].v)), n: audMap[k][a].v.length } : null])) })).sort((a, b) => b.people - a.people);
  // kiến thức × kết quả bán
  const both = tested.filter((p) => p.sales && p.index != null), quad = { "Kiến thức tốt · bán tốt": 0, "Kiến thức tốt · bán chưa đạt": 0, "Kiến thức chưa vững · bán tốt": 0, "Cả hai cần cải thiện": 0 };
  both.forEach((p) => { const kG = p.index >= 70, sG = (p.sales.avg3 || 0) >= 100; quad[kG && sG ? "Kiến thức tốt · bán tốt" : kG ? "Kiến thức tốt · bán chưa đạt" : sG ? "Kiến thức chưa vững · bán tốt" : "Cả hai cần cải thiện"]++; });
  const groups = (keyFn) => { const m = {}; people.forEach((p) => { const k = keyFn(p); (m[k] = m[k] || []).push(p); }); return Object.keys(m).map((k) => groupStat(k, m[k])).sort((a, b) => (a.index == null) - (b.index == null) || (a.index || 0) - (b.index || 0)); };
  const SEGL = { may_loc: "Ngành 1 · Máy lọc nước (Karofi, Livotec)", gia_dung: "Ngành 2 · Điện gia dụng Livotec", both: "Cả hai ngành" };
  const gaps = Object.values(cover).filter((c) => c.area !== AREA_NAME.gn).map((c) => {
    const notes = [];
    if (c.kbDocs && !c.questions) notes.push("Có tài liệu trong kho tri thức nhưng chưa có câu hỏi kiểm tra");
    if (c.questions && !c.materials) notes.push("Có câu hỏi kiểm tra nhưng chưa có học liệu để ôn");
    if (c.kaiAsks >= 10 && c.materials < 2) notes.push("Nhân viên hỏi KAI nhiều nhưng học liệu còn ít");
    return Object.assign({}, c, { notes });
  });
  // danh mục câu hỏi mà từng vị trí đã làm + mảng năng lực hệ thống gắn cho chúng: để phát hiện danh mục bị xếp nhầm vào "Kiến thức chung"
  const catAgg = {};
  index.forEach((r) => { const c = byCode.get(quiz.normCode(r.code)); if (!c) return; const label = CTX.audienceOf({ title: c.title, segment: quiz.normSegment(c.segment) }), cats = cache[r.id] || {}, A = catAgg[label] = catAgg[label] || {};
    Object.keys(cats).forEach((cat) => { const o = A[cat] = A[cat] || { n: 0, area: areaOf(cat) }; o.n += cats[cat].n; }); });
  const catMap = Object.fromEntries(Object.keys(catAgg).map((label) => [label, Object.keys(catAgg[label]).map((cat) => ({ name: cat, n: catAgg[label][cat].n, area: catAgg[label][cat].area })).sort((a, b) => b.n - a.n).slice(0, 20)]));
  return {
    meta: { generatedAt: now, population: people.length, tested: tested.length, attempts: index.length, periods: new Set(index.map((r) => r.period || "")).size, salesMonths: salesMonths.length, kaiQuestions: kaiTotal, programs: progCount, materials: hlItems.length, questionBank: qs.length, kbDocs: (kb || []).length, catMissing: missing, halfLifeDays: HALF_DAYS },
    system: { index: r1(mean(tested.map((p) => p.index))), below60: tested.filter((p) => p.index < 60).length, notTested: people.length - tested.length, staleTests: tested.filter((p) => now - (p.lastAt || 0) > 120 * 864e5).length,
      areaMap, trend, audRows, quad, quadN: both.length, coverage: gaps, kaiEngaged: people.filter((p) => p.kai.n90 > 0).length, levels: countBy(tested, (p) => p.level), catMap },
    audiences: groups((p) => p.audience), managers: groups((p) => p.manager), provinces: groups((p) => p.province), segments: groups((p) => SEGL[p.segment] || p.segment),
    people: people.map((p) => Object.assign({}, p, { segmentLabel: SEGL[p.segment] || p.segment, areas: p.areas.map((a) => Object.assign({}, a)) })).sort((a, b) => (a.index == null) - (b.index == null) || (a.index || 0) - (b.index || 0)),
    areas: AREAS.map((a) => ({ id: a[0], name: a[1] }))
  };
}
function countBy(list, fn) { const m = {}; list.forEach((x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; }); return m; }

function groupStat(name, list) {
  const t = list.filter((p) => p.tests), A = {};
  t.forEach((p) => p.areas.forEach((a) => { if (a.offScope || a.n < 4) return; (A[a.id] = A[a.id] || []).push(a.pct); }));
  const areas = Object.keys(A).filter((a) => A[a].length >= Math.min(3, t.length)).map((a) => ({ id: a, name: AREA_NAME[a], pct: r1(mean(A[a])), people: A[a].length })).sort((x, y) => x.pct - y.pct);
  const sal = t.filter((p) => p.sales).map((p) => p.sales.avg3), tr = t.filter((p) => p.tests >= 2).map((p) => p.latest - p.first);
  const g = { name, n: list.length, tested: t.length, index: r1(mean(t.map((p) => p.index))), below60: t.filter((p) => p.index < 60).length, areas, salesAvg: sal.length >= 3 ? r1(mean(sal)) : null, salesN: sal.length,
    trend: tr.length >= 3 ? r1(mean(tr)) : null, kaiUsers: list.filter((p) => p.kai.n90 > 0).length, reliable: t.length >= 10 };
  const notes = [], actions = [];
  if (g.tested < g.n) notes.push((g.n - g.tested) + "/" + g.n + " người chưa có bài kiểm tra nào.");
  if (g.index != null) notes.push("Chỉ số năng lực TB " + g.index + "% (" + level(g.index).toLowerCase() + ").");
  if (g.trend != null) notes.push("Từ bài đầu đến bài gần nhất: " + (g.trend >= 0 ? "+" : "") + g.trend + " điểm.");
  if (g.salesAvg != null) notes.push("Hoàn thành chỉ tiêu bán TB 3 tháng gần nhất: " + g.salesAvg + "%.");
  const weak = areas.filter((a) => a.pct < 65);
  if (weak.length) { notes.push("Năng lực thấp nhất: " + weak.slice(0, 2).map((a) => a.name + " " + a.pct + "%").join("; ") + "."); actions.push("Đào tạo nhóm trọng tâm: " + weak[0].name + "."); }
  if (g.below60) actions.push("Kèm cặp " + g.below60 + " người có chỉ số dưới 60%.");
  if (g.salesAvg != null && g.salesAvg < 100 && (g.index || 0) >= 70) actions.push("Kiến thức đã vững mà bán chưa đạt: xem kỹ năng bán và yếu tố ngoài năng lực (hàng, giá, điểm bán).");
  if (!g.reliable) notes.push("Nhóm dưới 10 người có bài: chỉ nên xem như tín hiệu.");
  g.notes = notes; g.actions = actions.length ? actions : ["Duy trì; nâng cao ở mảng năng lực thấp nhất."];
  return g;
}

function personRules(p, hl, now) {
  const notes = [], actions = [], recs = [];
  if (!p.tests) { notes.push("Chưa có bài kiểm tra nào: chưa đánh giá được năng lực kiến thức."); actions.push("Tham gia kỳ kiểm tra gần nhất để có dữ liệu năng lực."); return { notes, actions, recs }; }
  notes.push("Chỉ số năng lực " + p.index + "% từ " + p.tests + " bài (bài gần đây được tính nặng hơn).");
  if (p.tests >= 2) { const d = r1(p.latest - p.first); notes.push(d > 0 ? "Tiến bộ +" + d + " điểm từ bài đầu (" + p.first + "%) đến bài gần nhất (" + p.latest + "%)." : d < 0 ? "Giảm " + Math.abs(d) + " điểm từ bài đầu (" + p.first + "%) đến bài gần nhất (" + p.latest + "%)." : "Ổn định giữa các bài."); }
  const scope = p.areas.filter((a) => !a.offScope && a.n >= 4), weak = scope.filter((a) => a.pct < 65).slice(0, 2), strong = scope.filter((a) => a.pct >= 85).slice(-2);
  if (strong.length) notes.push("Mạnh: " + strong.map((a) => a.name + " " + a.pct + "%").join("; ") + ".");
  if (weak.length) {
    notes.push("Cần cải thiện: " + weak.map((a) => a.name + " " + a.pct + "% (" + a.n + " câu, tin cậy " + a.conf + ")").join("; ") + ".");
    weak.forEach((a) => { const sub = a.topics.filter((t) => t.pct < 60).slice(0, 2).map((t) => t.name); actions.push("Củng cố " + a.name + (sub.length ? " (" + sub.join(", ") + ")" : "") + "."); hl.filter((x) => x.area === a.id).slice(0, 2).forEach((x) => { if (recs.length < 4) recs.push({ id: x.id, title: x.title, area: a.name }); }); });
  }
  if (p.sales) {
    notes.push("Chỉ tiêu bán: TB 3 tháng " + p.sales.avg3 + "% (gần nhất " + p.sales.latest + "%).");
    const sv = p.sales.avg3 || 0, kG = p.index >= 70, kL = p.index < 60, sG = sv >= 95, sL = sv < 85; // có vùng đệm, tránh gắn nhầm "thấp" cho người sát chỉ tiêu
    if (kG && sL) actions.push("Kiến thức vững nhưng bán chưa đạt: quản lí cùng đi thị trường để xem kỹ năng tư vấn, chốt đơn và yếu tố ngoài năng lực.");
    else if (kL && sG) actions.push("Bán tốt nhưng kiến thức chưa vững: cập nhật kiến thức sản phẩm để giữ hiệu quả bền vững.");
    else if (kL && sL) actions.push("Kiến thức và kết quả bán đều thấp: ưu tiên kèm cặp 1-1 trong 4 tuần.");
  }
  if (p.lastAt && now - p.lastAt > 120 * 864e5) notes.push("Bài kiểm tra gần nhất đã hơn 4 tháng: dữ liệu năng lực có thể đã cũ.");
  if (p.kai.n90) notes.push("Đã hỏi Trợ lí KAI " + p.kai.n90 + " lần trong 90 ngày" + (p.kai.topArea ? " (nhiều nhất về " + AREA_NAME[p.kai.topArea] + ")" : "") + ".");
  if (p.tenure != null && p.tenure < 6) notes.push("Nhân sự mới (" + p.tenure + " tháng).");
  if (p.leavesAvg >= 4) notes.push("Trung bình rời màn hình " + p.leavesAvg + " lần mỗi bài (tín hiệu, không phải bằng chứng).");
  if ((p.index || 0) < 70 && p.needs) actions.push("Trọng tâm theo vị trí " + String(p.audience).split(" · ")[0] + ": " + p.needs.slice(0, 2).join("; ") + ".");
  if ((p.index || 0) >= 85 && (!p.sales || p.sales.avg3 >= 100)) actions.push("Có thể làm người chia sẻ kinh nghiệm cho đồng nghiệp.");
  if (!actions.length) actions.push("Duy trì; tự học nâng cao ở mảng năng lực thấp nhất.");
  return { notes, actions, recs };
}

async function build(opt) {
  opt = opt || {};
  if (!opt.refresh) { const c = await store.get(CACHE_KEY).catch(() => null); if (c && c.data && Date.now() - (c.at || 0) < CACHE_MS) return Object.assign({ cached: true, cachedAt: c.at }, c.data); }
  const data = await compute(opt);
  await store.put(CACHE_KEY, { at: Date.now(), data }).catch(() => {});
  return Object.assign({ cached: false, cachedAt: Date.now() }, data);
}

// ---------- AI ----------
const llm = require("./llm");
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
function parse(text) { const t = String(text || ""), a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }
const RULES = [
  "Bạn là chuyên gia phát triển năng lực (L&D) và phân tích nhân lực cho đội ngũ kinh doanh kênh GT Karofi – Livotec. Viết tiếng Việt chuyên nghiệp, ngắn gọn, ngôi trung tính.",
  "Dữ liệu là HỒ SƠ NĂNG LỰC tổng hợp từ toàn bộ hệ thống: mọi bài kiểm tra (có trọng số thời gian), điểm theo mảng năng lực, số bán, câu hỏi gửi Trợ lí KAI, chương trình học, độ phủ học liệu / câu hỏi / kho tri thức sản phẩm và thị trường. Không chỉ là một bài kiểm tra.",
  "CHỈ dùng số liệu được cung cấp; không bịa số, thông số sản phẩm hay chính sách; mỗi nhận định kèm con số làm bằng chứng; thiếu thì nói thiếu. Không kết luận nhân quả từ tương quan.",
  "Khuyến nghị năng lực phải đúng đối tượng và đúng ngành hàng; phân loại nguyên nhân: thiếu kiến thức / thiếu kỹ năng / thiếu thực hành / chưa ứng dụng / ngoài năng lực (hàng, giá, chính sách, điểm bán) / chưa đủ dữ liệu.",
  "Không đề xuất quyết định bất lợi về nhân sự. Rời màn hình chỉ là tín hiệu. Mức tin cậy thấp khi ít câu hoặc nhóm dưới 10 người."
].join(" ") + " " + CTX.CONTEXT;
const FMT_ITEMS = " Chỉ trả về MỘT JSON: {\"items\":[{\"id\":string,\"nhan_dinh\":string,\"diem_manh\":[string],\"can_cai_thien\":[string],\"de_xuat\":[string],\"do_tin_cay\":\"cao|vừa|thấp\"}]}; mỗi id đúng một phần tử; nhan_dinh 2 đến 4 câu; mỗi mảng tối đa 3 ý.";
const FMT_SYS = " Chỉ trả về MỘT JSON: {\"tom_tat\":string,\"phat_hien\":[{\"noi_dung\":string,\"bang_chung\":string,\"do_tin_cay\":\"cao|vừa|thấp\"}],\"khuyen_nghi_nang_luc\":[{\"doi_tuong\":string,\"nang_luc\":string,\"hien_trang\":string,\"loai\":string,\"de_xuat\":string,\"do_luong\":string}],\"san_pham_thi_truong\":[string],\"du_lieu_can_bo_sung\":[string]}; mỗi mảng tối đa 6 ý.";

const aiPerson = (p, i) => ({ id: "NV" + (i + 1), doi_tuong: p.audience, nganh: p.segment, so_bai: p.tests, chi_so_nang_luc: p.index, bai_dau: p.first, bai_gan_nhat: p.latest, tham_nien_thang: p.tenure,
  nang_luc: p.areas.map((a) => ({ mang: a.name, diem: a.pct, so_cau: a.n, tin_cay: a.conf, ngoai_nganh: a.offScope || undefined, chu_de_yeu: a.topics.filter((t) => t.pct < 60).map((t) => t.name + " " + t.pct + "%") })),
  chi_tieu_ban: p.sales ? { tb_3_thang: p.sales.avg3, gan_nhat: p.sales.latest, so_thang: p.sales.months } : null, hoi_kai_90_ngay: p.kai.n90, mang_hoi_kai_nhieu: p.kai.topArea ? AREA_NAME[p.kai.topArea] : null, chuong_trinh_da_dang_ky: p.programs, roi_man_hinh_tb: p.leavesAvg });
const aiGroup = (g, i, kind) => ({ id: "G" + (i + 1), ten: kind === "managers" ? undefined : g.name, so_nguoi: g.n, co_bai: g.tested, chi_so_nang_luc_tb: g.index, duoi_60: g.below60, xu_huong: g.trend, chi_tieu_ban_tb: g.salesAvg, nang_luc: g.areas.map((a) => a.name + " " + a.pct + "% (" + a.people + " người)"), dung_kai_90_ngay: g.kaiUsers });

async function ai(opt) {
  const kind = String(opt.kind || ""), data = await build({});
  let payload, list, sys = false;
  if (kind === "system") {
    sys = true; const S = data.system;
    payload = { tong_quan: { nhan_su: data.meta.population, co_bai: data.meta.tested, so_bai: data.meta.attempts, so_ky: data.meta.periods, chi_so_nang_luc_tb: S.index, duoi_60: S.below60, chua_kiem_tra: S.notTested, bai_cu_hon_4_thang: S.staleTests, muc: S.levels },
      nang_luc_he_thong: S.areaMap.map((a) => ({ mang: a.name, diem: a.pct, so_nguoi: a.people, duoi_60: a.weakPeople })),
      doi_tuong_x_nang_luc: S.audRows.map((r) => ({ doi_tuong: r.audience, so_nguoi: r.people, nang_luc: Object.keys(r.cells).filter((a) => r.cells[a]).map((a) => AREA_NAME[a] + " " + r.cells[a].pct + "%") })),
      xu_huong_thang: S.trend.map((t) => ({ thang: t.month, so_bai: t.n, diem_tb: t.pct })), kien_thuc_x_ban_hang: Object.assign({ so_nguoi: S.quadN }, S.quad),
      do_phu_san_pham_thi_truong: S.coverage.map((c) => ({ mang: c.area, cau_hoi: c.questions, hoc_lieu: c.materials, tai_lieu_kho_tri_thuc: c.kbDocs, nhan_vien_hoi_kai: c.kaiAsks, luu_y: c.notes })),
      theo_doi_tuong: data.audiences.map((g) => ({ doi_tuong: g.name, so_nguoi: g.n, chi_so: g.index, ban_tb: g.salesAvg })) };
  } else if (kind === "person") {
    const p = data.people.find((x) => quiz.normCode(x.code) === quiz.normCode(opt.key)); if (!p) return { ok: false, error: "Không tìm thấy nhân sự." };
    list = [p]; payload = [aiPerson(p, 0)];
  } else if (["audiences", "managers", "provinces", "segments"].indexOf(kind) >= 0) {
    list = data[kind].filter((g) => g.tested >= 3).slice(0, 40); if (!list.length) return { ok: false, error: "Chưa có nhóm nào đủ 3 người có bài." };
    payload = list.map((g, i) => aiGroup(g, i, kind));
  } else return { ok: false, error: "Loại nhận định không hợp lệ." };
  const user = (sys ? "Hồ sơ năng lực TOÀN HỆ THỐNG (JSON):\n" : "Đối tượng: " + ({ person: "một nhân sự (mã ẩn danh)", managers: "từng đội của quản lí (ẩn tên)", provinces: "từng tỉnh/thành", segments: "từng ngành hàng", audiences: "từng đối tượng đào tạo" }[kind]) + ". Dữ liệu (JSON):\n") + JSON.stringify(payload) +
    (sys ? "\n\nViết tóm tắt điều hành, phát hiện chính, khuyến nghị năng lực theo đối tượng (đúng ngành hàng), nhận xét về độ phủ sản phẩm / thị trường trong đào tạo và dữ liệu cần bổ sung." : "\n\nViết nhận định năng lực cho TỪNG id.");
  let text; try { text = await llm.chat([{ role: "system", content: RULES + (sys ? FMT_SYS : FMT_ITEMS) }, { role: "user", content: user }], { temperature: 0.3, max_tokens: sys ? 2600 : kind === "person" ? 900 : Math.min(4000, 400 + payload.length * 260), task: "hr-competency", json: true, timeoutMs: 28000 }); }
  catch (e) { return { ok: false, error: "AI tạm thời không khả dụng, vui lòng thử lại sau." }; }
  const o = parse(text); const A = (v, m, n) => (Array.isArray(v) ? v.slice(0, m || 3).map((x) => s(x, n || 300)).filter(Boolean) : []);
  const cf = (v) => (["cao", "vừa", "thấp"].indexOf(s(v, 8)) >= 0 ? s(v, 8) : "thấp");
  if (sys) {
    if (!o || !o.tom_tat) return { ok: false, error: "AI trả về kết quả không đọc được, vui lòng thử lại." };
    return { ok: true, kind, report: { tom_tat: s(o.tom_tat, 1200),
      phat_hien: (Array.isArray(o.phat_hien) ? o.phat_hien : []).slice(0, 6).map((x) => ({ noi_dung: s(x && x.noi_dung, 400), bang_chung: s(x && x.bang_chung, 400), do_tin_cay: cf(x && x.do_tin_cay) })).filter((x) => x.noi_dung),
      khuyen_nghi_nang_luc: (Array.isArray(o.khuyen_nghi_nang_luc) ? o.khuyen_nghi_nang_luc : []).slice(0, 6).map((x) => ({ doi_tuong: s(x && x.doi_tuong, 160), nang_luc: s(x && x.nang_luc, 160), hien_trang: s(x && x.hien_trang, 300), loai: s(x && x.loai, 100), de_xuat: s(x && x.de_xuat, 400), do_luong: s(x && x.do_luong, 300) })).filter((x) => x.nang_luc),
      san_pham_thi_truong: A(o.san_pham_thi_truong, 6, 400), du_lieu_can_bo_sung: A(o.du_lieu_can_bo_sung, 6, 300) } };
  }
  if (!o || !Array.isArray(o.items)) return { ok: false, error: "AI trả về kết quả không đọc được, vui lòng thử lại." };
  const ids = payload.map((x) => x.id);
  const items = o.items.filter((x) => x && ids.indexOf(String(x.id)) >= 0).map((x) => { const src = list[ids.indexOf(String(x.id))];
    return { key: kind === "person" ? src.code : src.name, nhan_dinh: s(x.nhan_dinh, 900), diem_manh: A(x.diem_manh), can_cai_thien: A(x.can_cai_thien), de_xuat: A(x.de_xuat), do_tin_cay: cf(x.do_tin_cay) }; });
  if (!items.length) return { ok: false, error: "AI chưa trả nhận định nào, vui lòng thử lại." };
  return { ok: true, kind, items };
}

module.exports = { build, compute, ai, areaOf, getAreaMap, setAreaMap, AREA_NAME, AREAS, level, personRules, groupStat, RULES };

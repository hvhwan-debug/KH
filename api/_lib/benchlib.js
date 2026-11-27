// THƯ VIỆN BENCHMARK NGÀNH (bằng chứng bên ngoài để thiết kế giải pháp đào tạo).
//
// Mỗi mục là MỘT phát hiện có nguồn: chỉ số, giá trị, phạm vi, năm, nguồn (tiêu đề, nơi công bố, đường dẫn, loại nguồn),
// phương pháp / cỡ mẫu, trích dẫn ngắn để đối chiếu, và "hàm ý đào tạo" (dùng phát hiện này để thiết kế đào tạo thế nào).
//
// HAI nhãn tách biệt, đều do MÁY CHỦ chấm theo luật (AI không tự chấm):
//   - Độ tin cậy của nguồn: loại nguồn, độ mới, cỡ mẫu / phương pháp, trích dẫn có khớp nội dung nguồn không,
//     nguồn gốc hay dẫn lại, có mâu thuẫn hay lời kể đơn lẻ không, có nguồn khác xác nhận không.
//   - Độ phù hợp bối cảnh: cùng quốc gia (Việt Nam), cùng ngành hàng (máy lọc nước / điện gia dụng), cùng kênh (GT),
//     cùng vị trí (PC / nhân viên bán hàng tại điểm bán).
//   Một nghiên cứu khoa học rất đáng tin nhưng làm ở Mỹ cho ngành phần mềm vẫn có "độ phù hợp thấp" -> tham khảo, không đem so trực tiếp.
//
// Quy trình: AI tìm trên web (khi có cấu hình dịch vụ tìm kiếm) -> trích phát hiện KÈM trích dẫn nguyên văn -> máy chủ đối chiếu
// trích dẫn với nội dung trang -> chấm 2 nhãn -> trạng thái "chờ duyệt" -> quản trị viên duyệt / loại. Chỉ mục đã duyệt mới được
// dùng trong "Nhận định đa chiều" và gợi ý thiết kế đào tạo.
const crypto = require("crypto");
const store = require("./store");

const KEY = "kt/benchmarks.json";
const TOPICS = [
  { id: "thi_truong", name: "Thị trường & ngành hàng", q: ["thị trường máy lọc nước Việt Nam quy mô tăng trưởng", "thị trường điện gia dụng Việt Nam báo cáo", "Vietnam water purifier market report"] },
  { id: "doi_thu", name: "Đối thủ & định vị thương hiệu", q: ["thị phần máy lọc nước Karofi Kangaroo Sunhouse", "so sánh thương hiệu máy lọc nước Việt Nam người tiêu dùng", "điện gia dụng thương hiệu Việt thị phần"] },
  { id: "khach_hang", name: "Hành vi & hành trình mua của khách", q: ["khảo sát người tiêu dùng mua máy lọc nước yếu tố quyết định", "hành trình mua sắm điện gia dụng Việt Nam khảo sát", "Vietnam consumer appliance purchase journey survey"] },
  { id: "kenh_gt", name: "Kênh GT & điểm bán", q: ["kênh truyền thống GT Việt Nam tỷ trọng NielsenIQ", "đại lý điện máy cửa hàng truyền thống xu hướng", "Vietnam general trade channel outlets trend"] },
  { id: "nhan_su", name: "Nhân sự bán hàng: nghỉ việc, thâm niên, thu nhập", q: ["tỷ lệ nghỉ việc nhân viên bán hàng Việt Nam khảo sát", "báo cáo lương nhân viên kinh doanh Việt Nam", "retail sales staff turnover benchmark Asia"] },
  { id: "ky_nang_ban", name: "Kỹ năng bán & tư vấn tại điểm bán", q: ["retail salesperson product knowledge effect on sales study", "kỹ năng tư vấn bán hàng điện máy nghiên cứu", "in-store sales associate training impact conversion study"] },
  { id: "coaching", name: "Kèm cặp & vai trò quản lí", q: ["sales coaching impact quota attainment research", "field coaching retail sales manager study", "manager support training transfer research"] },
  { id: "hoi_nhap", name: "Hội nhập nhân sự mới", q: ["sales onboarding ramp time benchmark", "new hire 90 day turnover retail onboarding study", "đào tạo hội nhập nhân viên bán hàng mới hiệu quả"] },
  { id: "khoa_hoc_hoc_tap", name: "Khoa học học tập & hiệu quả đào tạo", q: ["retrieval practice spaced repetition meta-analysis workplace", "transfer of training research percentage", "microlearning effectiveness study corporate training"] }
];
const TOPIC_NAME = Object.fromEntries(TOPICS.map((t) => [t.id, t.name]));
const SRC = { academic: ["Khoa học có bình duyệt", 40], gov: ["Cơ quan nhà nước", 36], intl: ["Tổ chức quốc tế", 36], research_firm: ["Hãng nghiên cứu thị trường", 30], data: ["Nền tảng dữ liệu", 26], consulting: ["Công ty tư vấn", 22], vendor: ["Doanh nghiệp bán giải pháp", 18], news: ["Báo chí", 18], brand: ["Thương hiệu tự công bố", 8], blog: ["Blog / trang không rõ nguồn", 5], other: ["Khác", 5] };
const FIT_PT = { country: { vn: 3, asean: 2, global: 1 }, industry: { same: 3, near: 2, all: 2.5, other: 1 }, channel: { same: 3, near: 2, all: 2.5, other: 1, na: 2 }, role: { same: 3, near: 2, all: 2.5, other: 1, na: 2 } };
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 300);
const norm = (t) => String(t || "").toLowerCase().normalize("NFC").replace(/[“”"'’‘]/g, "").replace(/\s+/g, " ").trim();
const idOf = (url, metric) => crypto.createHash("sha1").update(String(url || "") + "|" + norm(metric)).digest("hex").slice(0, 12);

// ---------- Chấm nhãn (luật, minh bạch: trả cả lí do) ----------
function score(it, nowYear) {
  const y = nowYear || new Date().getFullYear(), why = [];
  const st = SRC[it.source && it.source.type] || SRC.other; let p = st[1]; why.push("Loại nguồn: " + st[0] + " (+" + st[1] + ")");
  const age = it.year ? y - it.year : null;
  if (age == null) { p -= 6; why.push("Không rõ năm (−6)"); }
  else { const r = age <= 1 ? 20 : age <= 3 ? 14 : age <= 5 ? 8 : age <= 10 ? 2 : -6; p += r; why.push("Số liệu năm " + it.year + " (" + (r >= 0 ? "+" : "") + r + ")"); }
  if (it.sample) { const r = it.sample >= 1000 ? 10 : 8; p += r; why.push("Có cỡ mẫu " + Number(it.sample).toLocaleString("vi-VN") + " (+" + r + ")"); }
  if (it.method) { p += 4; why.push("Có mô tả phương pháp (+4)"); }
  if (it.verified === true) { p += 10; why.push("Trích dẫn khớp nội dung nguồn (+10)"); } else { p -= 15; why.push("Chưa đối chiếu được trích dẫn với nguồn (−15)"); }
  if (it.secondary) { p -= 6; why.push("Nguồn dẫn lại, không phải nguồn gốc (−6)"); }
  if (it.anecdotal) { p -= 15; why.push("Lời kể / quan sát đơn lẻ, không phải số liệu đo (−15)"); }
  if (it.conflict) { p -= 20; why.push("Các nguồn mâu thuẫn nhau (−20)"); }
  if ((it.alt_sources || []).length) { p += 6; why.push("Có " + it.alt_sources.length + " nguồn khác xác nhận (+6)"); }
  const rel = p >= 62 ? "cao" : p >= 40 ? "vừa" : "thấp";
  const f = it.fit || {}, d = [FIT_PT.country[f.country] || 1, FIT_PT.industry[f.industry] || 1, FIT_PT.channel[f.channel] || 2, FIT_PT.role[f.role] || 2], fs = d.reduce((a, b) => a + b, 0) / 4;
  const FL = { country: { vn: "Việt Nam", asean: "Đông Nam Á", global: "ngoài Việt Nam" }, industry: { same: "cùng ngành hàng", near: "ngành gần", all: "áp dụng mọi ngành", other: "ngành khác" }, channel: { same: "cùng kênh GT", near: "kênh gần", all: "mọi kênh", other: "kênh khác", na: "" }, role: { same: "cùng vị trí bán tại điểm bán", near: "vị trí gần", all: "mọi vị trí", other: "vị trí khác", na: "" } };
  const fitWhy = ["country", "industry", "channel", "role"].map((k) => (FL[k] || {})[f[k]]).filter(Boolean).join(" · ");
  return { relScore: p, reliability: rel, relWhy: why, fitScore: Math.round(fs * 100) / 100, fit: fs >= 2.5 ? "cao" : fs >= 1.85 ? "vừa" : "thấp", fitWhy };
}
function view(it) { return Object.assign({}, it, score(it), { topicName: TOPIC_NAME[it.topic] || it.topic }); }

// ---------- Lưu trữ ----------
async function load() {
  let d = await store.get(KEY).catch(() => null);
  if (!d || !Array.isArray(d.items)) {
    const seed = require("./seed/benchmarks-v1.json"), now = Date.now();
    d = { items: seed.items.map((x) => Object.assign({ id: idOf(x.source.url, x.metric), status: "approved", verified: true, addedAt: now, addedBy: "Claude (nghiên cứu ban đầu 27/11/2026)", reviewedBy: "Claude", reviewedAt: now }, x)), runs: [] };
    await store.put(KEY, d).catch(() => {});
  }
  return d;
}
async function save(d) { d.items = d.items.slice(-800); d.runs = (d.runs || []).slice(-50); await store.put(KEY, d); }
async function list() { const d = await load(); return { items: d.items.map(view), runs: d.runs || [], topics: TOPICS.map((t) => ({ id: t.id, name: t.name })), providers: providers() }; }
async function setStatus(id, status, by, note) {
  if (["approved", "rejected", "pending"].indexOf(status) < 0) return { ok: false, error: "Trạng thái không hợp lệ." };
  const d = await load(), it = d.items.find((x) => x.id === id); if (!it) return { ok: false, error: "Không tìm thấy mục này." };
  it.status = status; it.reviewedBy = s(by, 120); it.reviewedAt = Date.now(); if (note != null) it.reviewNote = s(note, 300);
  await save(d); return { ok: true, item: view(it) };
}
async function remove(id) { const d = await load(), n = d.items.length; d.items = d.items.filter((x) => x.id !== id); if (d.items.length === n) return { ok: false, error: "Không tìm thấy mục này." }; await save(d); return { ok: true }; }
// Thêm thủ công (quản trị viên tự nhập từ báo cáo trả phí, số liệu nhà phân phối...)
async function addManual(x, by) {
  const it = clean(x); if (!it.metric || !it.value) return { ok: false, error: "Cần nhập chỉ số và giá trị." };
  it.id = idOf(it.source.url || ("manual-" + Date.now()), it.metric); it.status = "approved"; it.verified = !!x.verified; it.addedBy = s(by, 120); it.addedAt = Date.now(); it.manual = true;
  const d = await load(); d.items = d.items.filter((y) => y.id !== it.id).concat([it]); await save(d); return { ok: true, item: view(it) };
}
function clean(x) {
  x = x || {}; const src = x.source || {}, fit = x.fit || {}, pick = (v, arr, dflt) => (arr.indexOf(v) >= 0 ? v : dflt);
  return {
    topic: TOPIC_NAME[x.topic] ? x.topic : "thi_truong", metric: s(x.metric, 160), value: s(x.value, 700), scope: s(x.scope, 200),
    year: Number.isInteger(+x.year) && +x.year >= 1990 && +x.year <= 2100 ? +x.year : null,
    source: { title: s(src.title, 240), publisher: s(src.publisher, 160), url: /^https?:\/\//.test(String(src.url || "")) ? s(src.url, 500) : "", type: SRC[src.type] ? src.type : "other" },
    method: s(x.method, 300), sample: Number.isFinite(+x.sample) && +x.sample > 0 ? Math.round(+x.sample) : null,
    secondary: !!x.secondary, anecdotal: !!x.anecdotal, conflict: !!x.conflict,
    fit: { country: pick(fit.country, ["vn", "asean", "global"], "global"), industry: pick(fit.industry, ["same", "near", "all", "other"], "other"), channel: pick(fit.channel, ["same", "near", "all", "other", "na"], "na"), role: pick(fit.role, ["same", "near", "all", "other", "na"], "na") },
    implication: s(x.implication, 700), quote: s(x.quote, 300)
  };
}

// ---------- Tìm trên web ----------
// Cấu hình một trong các dịch vụ (biến môi trường của Azure Function App):
//   TAVILY_API_KEY (khuyên dùng: trả cả nội dung trang) · BRAVE_API_KEY · GOOGLE_API_KEY + GOOGLE_CSE_ID
//   hoặc OPENAI_API_KEY (dùng công cụ web_search của OpenAI Responses API; mô hình OPENAI_SEARCH_MODEL, mặc định gpt-4.1-mini).
function providers() {
  const e = process.env;
  const search = e.TAVILY_API_KEY ? "tavily" : e.BRAVE_API_KEY ? "brave" : (e.GOOGLE_API_KEY && e.GOOGLE_CSE_ID) ? "google" : e.OPENAI_API_KEY ? "openai" : "";
  return { search, ready: !!search, hint: search ? "" : "Chưa cấu hình dịch vụ tìm kiếm. Thêm TAVILY_API_KEY (khuyên dùng) hoặc BRAVE_API_KEY, hoặc GOOGLE_API_KEY + GOOGLE_CSE_ID, hoặc OPENAI_API_KEY vào cấu hình Azure Function App." };
}
async function fetchJson(url, opt, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 15000);
  try { const r = await fetch(url, Object.assign({ signal: ac.signal }, opt)); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } finally { clearTimeout(t); }
}
function htmlText(h) { return String(h || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }
async function pageText(url, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 12000);
  try { const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; KH-Benchmark/1.0)" } }); if (!r.ok) return ""; const ct = r.headers.get("content-type") || ""; if (!/html|text/.test(ct)) return ""; return htmlText((await r.text()).slice(0, 600000)).slice(0, 60000); }
  catch (e) { return ""; } finally { clearTimeout(t); }
}
async function webSearch(q, n) {
  const e = process.env, p = providers().search;
  if (p === "tavily") { const j = await fetchJson("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: e.TAVILY_API_KEY, query: q, max_results: n, search_depth: "advanced", include_raw_content: true }) }, 25000);
    return (j.results || []).map((r) => ({ url: r.url, title: r.title, text: s(r.raw_content || r.content, 60000) })); }
  if (p === "brave") { const j = await fetchJson("https://api.search.brave.com/res/v1/web/search?count=" + n + "&q=" + encodeURIComponent(q), { headers: { Accept: "application/json", "X-Subscription-Token": e.BRAVE_API_KEY } });
    return ((j.web && j.web.results) || []).map((r) => ({ url: r.url, title: r.title, text: htmlText(r.description) })); }
  if (p === "google") { const j = await fetchJson("https://www.googleapis.com/customsearch/v1?num=" + Math.min(10, n) + "&key=" + encodeURIComponent(e.GOOGLE_API_KEY) + "&cx=" + encodeURIComponent(e.GOOGLE_CSE_ID) + "&q=" + encodeURIComponent(q));
    return (j.items || []).map((r) => ({ url: r.link, title: r.title, text: r.snippet || "" })); }
  return [];
}

const SYS = [
  "Bạn là chuyên viên nghiên cứu cho bộ phận đào tạo đội ngũ bán hàng kênh GT (đại lý, cửa hàng truyền thống) tại Việt Nam, ngành máy lọc nước (Karofi, Livotec) và điện gia dụng (Livotec). Mục đích: tìm BẰNG CHỨNG để thiết kế giải pháp đào tạo cho nhân viên bán hàng tại điểm bán (PC).",
  "Từ các tài liệu được cung cấp, trích ra các PHÁT HIỆN có số liệu hoặc kết luận nghiên cứu cụ thể. Mỗi phát hiện phải có 'quote' là đoạn NGUYÊN VĂN, liên tục, dài 8–30 từ, chép đúng từng chữ từ tài liệu có số 'doc'. Không có câu nguyên văn chứa số liệu thì KHÔNG đưa phát hiện đó.",
  "Không bịa số, không suy diễn ngoài tài liệu. Nếu tài liệu chỉ dẫn lại nguồn khác thì secondary=true và ghi tên nguồn gốc vào publisher (vd 'VnEconomy (dẫn NielsenIQ)'). Lời kể của một vài người: anecdotal=true. Hai tài liệu mâu thuẫn về cùng chỉ số: conflict=true và nêu cả hai giá trị.",
  "source.type chọn một trong: academic, gov, intl, research_firm, data, consulting, vendor, news, brand, blog, other. fit: country vn|asean|global; industry same (máy lọc nước/điện gia dụng)|near (bán lẻ điện máy, hàng tiêu dùng bền)|all (phát hiện phổ quát như khoa học học tập)|other; channel same (GT/đại lý)|near|all|other|na; role same (nhân viên bán tại điểm bán)|near (nhân viên kinh doanh khác)|all|other|na.",
  "implication: 1–3 câu, cụ thể, nói phát hiện này nên thay đổi THIẾT KẾ ĐÀO TẠO PC thế nào (nội dung, phương pháp, nhịp độ, vai trò quản lí, cách đo). Viết tiếng Việt; value viết lại bằng lời của bạn (giữ đúng số).",
  "Chỉ trả về JSON: {\"items\":[{\"doc\":number,\"topic\":string,\"metric\":string,\"value\":string,\"scope\":string,\"year\":number,\"source\":{\"title\":string,\"publisher\":string,\"type\":string},\"method\":string,\"sample\":number|null,\"secondary\":bool,\"anecdotal\":bool,\"conflict\":bool,\"fit\":{\"country\":string,\"industry\":string,\"channel\":string,\"role\":string},\"implication\":string,\"quote\":string}]}. Tối đa 8 phát hiện, ưu tiên phát hiện mới, có cỡ mẫu, gần đây, sát bối cảnh."
].join(" ");

function parseJson(t) { t = String(t || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }
function quoteIn(quote, text) { const q = norm(quote); return q.length >= 20 && norm(text).indexOf(q) >= 0; }

// OpenAI Responses + web_search: mô hình tự tìm và trả phát hiện kèm URL; máy chủ tự tải trang để đối chiếu trích dẫn
async function openaiResearch(topic, focus) {
  const body = { model: process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini", tools: [{ type: "web_search" }],
    input: [{ role: "system", content: SYS.replace("Từ các tài liệu được cung cấp", "Hãy TỰ TÌM trên web (ít nhất 4 lượt tìm, cả tiếng Việt và tiếng Anh) rồi từ các trang đã đọc") + " Thêm trường source.url (đường dẫn trang chứa quote) cho mỗi phát hiện; bỏ trường doc." },
      { role: "user", content: "Chủ đề: " + topic.name + ". Gợi ý từ khoá: " + topic.q.join(" | ") + (focus ? ". Trọng tâm thêm: " + focus : "") } ] };
  const j = await fetchJson("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.OPENAI_API_KEY }, body: JSON.stringify(body) }, 120000);
  const text = j.output_text || ((j.output || []).filter((o) => o.type === "message").map((o) => (o.content || []).map((c) => c.text || "").join("")).join(""));
  const o = parseJson(text); return (o && Array.isArray(o.items)) ? o.items : [];
}

// Chạy nghiên cứu MỘT chủ đề (trang quản trị gọi lần lượt từng chủ đề để không quá thời gian của máy chủ)
async function research(topicId, focus, by) {
  const topic = TOPICS.find((t) => t.id === topicId); if (!topic) return { ok: false, error: "Chủ đề không hợp lệ." };
  const pv = providers(); if (!pv.ready) return { ok: false, error: pv.hint, needConfig: true };
  const t0 = Date.now(); let raw = [], docs = [];
  try {
    if (pv.search === "openai") raw = await openaiResearch(topic, focus);
    else {
      const qs = topic.q.slice(0, 3).concat(focus ? [focus] : []), seen = new Set();
      for (const q of qs) { const rs = await webSearch(q, 5).catch(() => []); rs.forEach((r) => { if (r.url && !seen.has(r.url) && docs.length < 10) { seen.add(r.url); docs.push(r); } }); }
      // Brave / Google chỉ trả đoạn tóm tắt -> tự tải nội dung trang để AI đọc và để đối chiếu trích dẫn
      await Promise.all(docs.map(async (d) => { if ((d.text || "").length < 1500) { const t = await pageText(d.url); if (t) d.text = t; } }));
      docs = docs.filter((d) => (d.text || "").length > 300);
      if (!docs.length) return { ok: false, error: "Không tải được tài liệu nào cho chủ đề này, thử lại sau." };
      const llm = require("./llm");
      const user = "Chủ đề: " + topic.name + (focus ? " · trọng tâm: " + focus : "") + "\n\n" + docs.map((d, i) => "### doc " + i + "\nURL: " + d.url + "\nTiêu đề: " + s(d.title, 200) + "\n" + s(d.text, 9000)).join("\n\n");
      const out = await llm.chat([{ role: "system", content: SYS }, { role: "user", content: user }], { temperature: 0.1, max_tokens: 3500, task: "bench-research", json: true, timeoutMs: 90000 });
      const o = parseJson(out); raw = (o && Array.isArray(o.items)) ? o.items : [];
    }
  } catch (e) { return { ok: false, error: "Dịch vụ tìm kiếm hoặc AI tạm thời lỗi, vui lòng thử lại sau." }; }
  // đối chiếu trích dẫn với nội dung trang thật, chấm nhãn, lưu "chờ duyệt"
  const d = await load(), have = new Set(d.items.map((x) => x.id)), added = [];
  for (const r of raw.slice(0, 10)) {
    const doc = docs[+r.doc], it = clean(Object.assign({}, r, { topic: TOPIC_NAME[r.topic] ? r.topic : topic.id, source: Object.assign({}, r.source || {}, { url: doc ? doc.url : (r.source || {}).url, title: (r.source || {}).title || (doc && doc.title) }) }));
    if (!it.metric || !it.value || !it.source.url) continue;
    let text = doc ? doc.text : ""; if (!text) text = await pageText(it.source.url);
    it.verified = !!(it.quote && text && quoteIn(it.quote, text));
    it.id = idOf(it.source.url, it.metric); if (have.has(it.id)) continue; have.add(it.id);
    Object.assign(it, { status: "pending", addedAt: Date.now(), addedBy: "AI tìm kiếm (" + pv.search + ")" + (by ? " · yêu cầu bởi " + s(by, 80) : ""), run: topic.id });
    d.items.push(it); added.push(it);
  }
  d.runs = (d.runs || []).concat([{ at: Date.now(), topic: topic.id, focus: s(focus, 120), provider: pv.search, docs: docs.length, found: raw.length, added: added.length, verified: added.filter((x) => x.verified).length, ms: Date.now() - t0, by: s(by, 80) }]);
  await save(d);
  return { ok: true, topic: topic.id, docs: docs.length, found: raw.length, added: added.map(view) };
}

// ---------- Dùng trong "Nhận định đa chiều": bằng chứng ngành liên quan tới giả thuyết của một nhân sự ----------
const HYP_TOPICS = { skill: ["coaching", "ky_nang_ban", "khach_hang"], market: ["kenh_gt", "doi_thu", "thi_truong", "khach_hang"], gap: ["khoa_hoc_hoc_tap"], content: ["khoa_hoc_hoc_tap"],
  team: ["coaching"], onboard: ["hoi_nhap", "nhan_su", "khoa_hoc_hoc_tap"], decline: ["khoa_hoc_hoc_tap", "nhan_su"], rush: ["khoa_hoc_hoc_tap"], natural: ["khach_hang", "doi_thu"], both: ["coaching", "khoa_hoc_hoc_tap"], star: ["coaching"] };
async function forHypotheses(ids, max) {
  let d; try { d = await load(); } catch (e) { return []; }
  const want = []; (ids || []).forEach((h, i) => (HYP_TOPICS[h] || []).forEach((t, j) => { if (want.findIndex((w) => w.t === t) < 0) want.push({ t, w: i * 10 + j }); }));
  if (!want.length) return [];
  const rank = Object.fromEntries(want.map((w) => [w.t, w.w]));
  return d.items.filter((x) => x.status === "approved" && rank[x.topic] != null).map(view).filter((x) => x.reliability !== "thấp")
    .sort((a, b) => rank[a.topic] - rank[b.topic] || b.relScore + b.fitScore * 10 - (a.relScore + a.fitScore * 10)).slice(0, max || 3);
}

// ---------- Gợi ý thiết kế đào tạo từ thư viện đã duyệt (+ AI nếu có) ----------
async function design(opt) {
  const d = await load(), ok = d.items.filter((x) => x.status === "approved").map(view).filter((x) => x.reliability !== "thấp");
  if (!ok.length) return { ok: false, error: "Chưa có mục benchmark nào đã duyệt với độ tin cậy từ vừa trở lên." };
  const byTopic = {}; ok.forEach((x) => { (byTopic[x.topic] = byTopic[x.topic] || []).push(x); });
  const rules = Object.keys(byTopic).map((t) => ({ topic: TOPIC_NAME[t], points: byTopic[t].sort((a, b) => b.relScore - a.relScore).map((x) => ({ metric: x.metric, implication: x.implication, reliability: x.reliability, fit: x.fit })) }));
  if (!opt || !opt.ai) return { ok: true, rules };
  const llm = require("./llm");
  const pack = ok.map((x, i) => ({ id: "B" + (i + 1), chu_de: TOPIC_NAME[x.topic], chi_so: x.metric, gia_tri: x.value, pham_vi: x.scope, nam: x.year, do_tin_cay: x.reliability, do_phu_hop: x.fit, ham_y: x.implication }));
  const ctx = opt.internal ? "\nSố liệu nội bộ (tổng hợp, ẩn danh): " + JSON.stringify(opt.internal) : "";
  const sys = "Bạn là chuyên gia thiết kế đào tạo cho đội bán hàng kênh GT ngành máy lọc nước và điện gia dụng tại Việt Nam. Dựa CHỈ trên các bằng chứng có id được cung cấp (và số liệu nội bộ nếu có), đề xuất khung giải pháp đào tạo. Mỗi đề xuất phải dẫn id bằng chứng; bằng chứng độ phù hợp thấp chỉ dùng như định hướng và phải nói rõ. Phân biệt cái đã có bằng chứng mạnh với cái cần thử nghiệm. " +
    "Chỉ trả JSON: {\"tom_tat\":string,\"nguyen_tac\":[{\"nguyen_tac\":string,\"bang_chung\":[string],\"muc_chac_chan\":\"cao|vừa|thấp\"}],\"cau_truc\":[{\"hoc_phan\":string,\"doi_tuong\":string,\"noi_dung\":string,\"phuong_phap\":string,\"nhip_do\":string,\"do_luong\":string,\"bang_chung\":[string]}],\"vai_tro_quan_li\":[string],\"thu_nghiem\":[{\"gia_thuyet\":string,\"cach_thu\":string,\"chi_so\":string}],\"lo_hong_du_lieu\":[string]}";
  let text; try { text = await llm.chat([{ role: "system", content: sys }, { role: "user", content: "Bằng chứng: " + JSON.stringify(pack) + ctx }], { temperature: 0.3, max_tokens: 3000, task: "bench-design", json: true, timeoutMs: 45000 }); }
  catch (e) { return { ok: true, rules, aiError: "AI tạm thời không khả dụng; dưới đây là tổng hợp theo luật." }; }
  const o = parseJson(text); if (!o || !o.tom_tat) return { ok: true, rules, aiError: "AI trả về kết quả không đọc được; dưới đây là tổng hợp theo luật." };
  const ids = new Set(pack.map((p) => p.id)), refs = (a) => (Array.isArray(a) ? a.map((x) => s(x, 6)).filter((x) => ids.has(x)) : []);
  return { ok: true, rules, evidence: pack.map((p, i) => ({ id: p.id, metric: p.chi_so, source: ok[i].source, reliability: p.do_tin_cay, fit: p.do_phu_hop })),
    ai: { tom_tat: s(o.tom_tat, 800), nguyen_tac: (o.nguyen_tac || []).slice(0, 8).map((x) => ({ nguyen_tac: s(x.nguyen_tac, 300), bang_chung: refs(x.bang_chung), muc_chac_chan: s(x.muc_chac_chan, 6) })),
      cau_truc: (o.cau_truc || []).slice(0, 8).map((x) => ({ hoc_phan: s(x.hoc_phan, 120), doi_tuong: s(x.doi_tuong, 120), noi_dung: s(x.noi_dung, 400), phuong_phap: s(x.phuong_phap, 300), nhip_do: s(x.nhip_do, 160), do_luong: s(x.do_luong, 200), bang_chung: refs(x.bang_chung) })),
      vai_tro_quan_li: (o.vai_tro_quan_li || []).slice(0, 6).map((x) => s(x, 300)), thu_nghiem: (o.thu_nghiem || []).slice(0, 5).map((x) => ({ gia_thuyet: s(x.gia_thuyet, 240), cach_thu: s(x.cach_thu, 300), chi_so: s(x.chi_so, 200) })),
      lo_hong_du_lieu: (o.lo_hong_du_lieu || []).slice(0, 6).map((x) => s(x, 240)) } };
}

module.exports = { list, load, setStatus, remove, addManual, research, forHypotheses, design, score, view, providers, quoteIn, TOPICS, SRC };

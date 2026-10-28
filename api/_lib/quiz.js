// Thư viện dùng chung cho nền tảng kiểm tra: ngân hàng đề, danh sách thí sinh, cài đặt, bài làm.
const store = require("./store");
const { cleanText, cleanQuestion } = require("./cleantext");
const crypto = require("crypto");
const { cfg } = require("./config");

const Q_KEY = "kt/questions.json";
const C_KEY = "kt/candidates.json";
const S_KEY = "kt/settings.json";
const IDX_KEY = "kt/attempts-index.json";
const EX_KEY = "kt/exams.json"; // danh sách các đề thi (nhiều đề độc lập, mỗi đề 1 "period"/mã riêng, có cài đặt riêng)

const DEFAULT_SETTINGS = {
  examTitle: "Bài kiểm tra",
  // Dòng đầu của nội dung chia sẻ qua Zalo (tên rút gọn của kỳ kiểm tra). Để trống thì dùng tên bài kiểm tra.
  shareTitle: "PCs - KTTĐK 10/2026",
  questionCount: 30,
  // Thí sinh bán cả 2 ngành (segment "both"): lấy co dinh so cau "Gia dụng" nay, so con lai (questionCount - so nay)
  // lay tu moi cau hoi KHONG thuoc "Gia dụng" (Máy lọc nước, Kiến thức khác... — tu dong gom moi category khac).
  bothGiaDungCount: 10,
  secondsPerQuestion: 60,
  // Ngưỡng đạt chỉ áp dụng khi bật (passEnabled). Mặc định TẮT: bài không có ngưỡng thì không hiện Đạt/Chưa đạt.
  passEnabled: false,
  passScore: 70,
  allowRetake: false,
  // Số lượt làm tối đa của mỗi thí sinh trong một đề (khi không bật "làm lại nhiều lần"). Mặc định 1.
  maxAttempts: 1,
  // Điểm tuân thủ học tập: quy đổi từ tỉ lệ đúng (thang điểm 10) sang một mốc điểm cố định
  // (mặc định theo quy tắc kiểm tra định kỳ PC: <6 → 0, 6-6.99 → 10, 7-8.99 → 15, >=9 → 20).
  complianceEnabled: true,
  complianceHighMin: 9,   // >= mốc này: 20 điểm
  complianceMidMin: 7,    // >= mốc này (và < mốc trên): 15 điểm
  complianceLowMin: 6,    // >= mốc này (và < mốc trên): 10 điểm; dưới mốc này: 0 điểm
  // Kỳ kiểm tra hiện tại (vd "2026-10"): bài làm được gắn đúng kỳ lúc nộp. "Đã làm bài" chỉ chặn trong
  // CÙNG kỳ - đổi giá trị này (ví dụ sang tháng mới) là mọi thí sinh tự động được làm lại, không cần
  // quản trị viên reset tay từng người; kết quả các kỳ cũ vẫn giữ nguyên để đối chiếu.
  examPeriod: defaultPeriod()
};

function defaultPeriod() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// Quy đổi điểm thang 10 (tỉ lệ đúng * 10) sang điểm tuân thủ học tập theo mốc đã cấu hình.
function compliancePoints(scoreOutOf10, settings) {
  const s = settings || DEFAULT_SETTINGS;
  if (scoreOutOf10 >= s.complianceHighMin) return 20;
  if (scoreOutOf10 >= s.complianceMidMin) return 15;
  if (scoreOutOf10 >= s.complianceLowMin) return 10;
  return 0;
}

// Trạng thái đạt: true/false nếu bài có ngưỡng đạt, null nếu bài không có ngưỡng (luôn tính theo cài đặt hiện tại).
function passState(pct, settings) {
  const s = settings || DEFAULT_SETTINGS;
  return s.passEnabled && (s.passScore || 0) > 0 ? pct >= s.passScore : null;
}
function passScoreOf(settings) { return settings && settings.passEnabled ? (settings.passScore || 0) : 0; }

function normCode(s) { return String(s || "").trim().toLowerCase(); }
function normEmail(s) { return String(s || "").trim().toLowerCase(); }

// Nhóm ngành hàng của thí sinh, quyết định đề sẽ trộn từ nhóm câu hỏi nào.
// "both": cả hai ngành (đề trộn từ toàn bộ ngân hàng) · "gia_dung" / "may_loc": chỉ một ngành.
const SEGMENTS = { both: "both", ca_hai: "both", "cả hai": "both", gia_dung: "gia_dung", "gia dụng": "gia_dung", may_loc: "may_loc", "máy lọc": "may_loc", "máy lọc nước": "may_loc" };
// Chức danh của nhân viên (vd. PC, Sales, Giám sát). Hồ sơ cũ chưa có thì mặc định là "PC".
const DEFAULT_TITLE = "PC";
function normTitle(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 50); }
function titleOf(c) { return normTitle(c && c.title) || DEFAULT_TITLE; }
function normSegment(s) {
  const k = String(s || "").trim().toLowerCase();
  return SEGMENTS[k] || "both"; // mặc định: không rõ thì coi như bán cả hai (đề đầy đủ hơn, an toàn hơn)
}
const CATEGORY_BY_SEGMENT = { gia_dung: "Gia dụng", may_loc: "Máy lọc nước" };

// ---------- Miền bán hàng (Miền Bắc / Miền Nam) ----------
// Miền KHÔNG suy ra từ tỉnh (công ty chia miền không theo địa lý): PC tự chọn tỉnh + miền trước khi làm bài.
// Câu hỏi gắn tag "Miền Bắc" / "Miền Nam" chỉ phát cho PC thuộc miền đó; câu không gắn tag miền dùng chung.
const REGION_LABEL = { bac: "Miền Bắc", nam: "Miền Nam" };
const foldRg = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
function normRegion(s) {
  const k = foldRg(s).replace(/^mien /, "");
  return k === "bac" || k === "mb" ? "bac" : k === "nam" || k === "mn" ? "nam" : "";
}
// Miền của một câu hỏi theo tag ("Miền Bắc", "mien-bac", "#mienbac"...). Gắn cả hai miền hoặc không gắn = dùng chung ("").
function questionRegion(q) {
  let r = "";
  const mark = (v) => { if (v) r = r && r !== v ? "*" : v; };
  (Array.isArray(q && q.tags) ? q.tags : []).forEach((t) => {
    const k = foldRg(t).replace(/ /g, "");
    mark(k === "mienbac" ? "bac" : k === "miennam" ? "nam" : "");
  });
  const c = " " + foldRg(q && q.category) + " ";
  if (c.indexOf(" mien bac ") >= 0) mark("bac");
  if (c.indexOf(" mien nam ") >= 0) mark("nam");
  return r === "*" ? "" : r;
}
// Thí sinh có phải chọn tỉnh + miền trước khi làm bài không: BẮT BUỘC với mọi thí sinh (miền quyết định bộ đề được phát;
// không phụ thuộc chức danh để người bị ghi sai chức danh cũng không lọt qua và nhận sai đề).
function needsRegion(c) { return true; }

// Ngân hàng đề THEO KỲ: mỗi câu hỏi có period ("YYYY-MM"); "" = chưa gắn kỳ.
// Đề của kỳ P chỉ lấy câu thuộc kỳ P. Nếu kỳ P chưa có câu nào, tạm dùng các câu CHƯA GẮN KỲ (dự phòng),
// để bài thi không bị gián đoạn khi mới chuyển sang cấu trúc theo kỳ.
// Mã đề thi/kỳ: chấp nhận dạng tháng "YYYY-MM" (lặp lại định kỳ) HOẶC một mã tự chọn (vd "thu-nghiem")
// để mở được NHIỀU đề thi độc lập, không chỉ một đề lặp lại theo tháng.
const validPeriod = (p) => p === "" || /^\d{4}-\d{2}$/.test(String(p)) || /^[a-z0-9][a-z0-9-]{0,39}$/i.test(String(p));

// ---------- Loại câu hỏi ----------
// single: 1 đáp án đúng (đúng/sai cũng là single với 2 phương án) · multi: nhiều đáp án đúng, đúng khi chọn ĐÚNG và ĐỦ tập đáp án ·
// fill: điền vào chỗ trống, đúng khi khớp một trong các đáp án chấp nhận (không phân biệt hoa/thường, khoảng trắng thừa, dấu câu cuối).
const TYPES = ["single", "multi", "fill"];
function qType(q) { return q && TYPES.indexOf(q.type) >= 0 ? q.type : "single"; }
function normText(s) {
  let t = String(s == null ? "" : s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  t = t.replace(/(\d),(\d)/g, "$1.$2");            // 1,5 == 1.5
  return t.replace(/^[\s"'“”‘’.,;:!?()\[\]-]+|[\s"'“”‘’.,;:!?()\[\]-]+$/g, "");
}
// Làm sạch dữ liệu câu hỏi nhập từ quản trị viên theo từng loại. Trả về { error } hoặc { fields }.
function normalizeQuestionInput(q) {
  q = q || {};
  const type = TYPES.indexOf(q.type) >= 0 ? q.type : "single";
  const text = cleanText(q.text).slice(0, 2000);
  if (!text) return { error: "Câu hỏi cần có nội dung." };
  if (type === "fill") {
    const raw = Array.isArray(q.accepted) ? q.accepted : String(q.accepted || "").split(/\r?\n/);
    const accepted = raw.map((a) => cleanText(a).slice(0, 200)).filter(Boolean).filter((v, i, a) => a.findIndex((x) => normText(x) === normText(v)) === i).slice(0, 20);
    if (!accepted.length) return { error: "Câu điền khuyết cần ít nhất một đáp án chấp nhận." };
    return { fields: { type, text, options: [], correctIndex: -1, accepted } };
  }
  const options = Array.isArray(q.options) ? q.options.map((o) => cleanText(o).slice(0, 500)).filter(Boolean) : [];
  if (options.length < 2) return { error: "Câu hỏi cần ít nhất 2 phương án." };
  if (options.length > 8) return { error: "Tối đa 8 phương án." };
  if (type === "multi") {
    const idx = (Array.isArray(q.correctIndexes) ? q.correctIndexes : []).filter((i) => Number.isInteger(i) && i >= 0 && i < options.length).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    if (idx.length < 2) return { error: "Câu nhiều đáp án cần chọn ít nhất 2 đáp án đúng (chỉ 1 đáp án thì dùng loại \"Một đáp án\")." };
    return { fields: { type, text, options, correctIndex: idx[0], correctIndexes: idx } };
  }
  const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : -1;
  if (correctIndex < 0 || correctIndex >= options.length) return { error: "Hãy chọn 1 đáp án đúng hợp lệ." };
  return { fields: { type: "single", text, options, correctIndex } };
}
// Chấm MỘT câu. ans = câu trả lời đã lưu (vị trí hiển thị), order = thứ tự đáp án đã xáo của thí sinh.
// Trả về { state: "correct"|"wrong"|"blank", ok, chosenText, correctText, chosenOrig: [chỉ số gốc đã chọn] }.
function gradeAnswer(q, ans, order) {
  const t = qType(q);
  if (t === "fill") {
    const given = ans && typeof ans.text === "string" ? ans.text.trim() : "";
    const accepted = q.accepted || [];
    if (!given) return { state: "blank", ok: false, chosenText: "(không trả lời)", correctText: accepted.join(" / "), chosenOrig: [] };
    const n = normText(given), ok = accepted.some((a) => normText(a) === n);
    return { state: ok ? "correct" : "wrong", ok, chosenText: given, correctText: accepted.join(" / "), chosenOrig: [] };
  }
  const ord = order || (q.options || []).map((_, i) => i);
  if (t === "multi") {
    const pos = ans && Array.isArray(ans.answerIndexes) ? ans.answerIndexes : [];
    const orig = pos.filter((p, i) => Number.isInteger(p) && p >= 0 && p < ord.length && pos.indexOf(p) === i).map((p) => ord[p]).sort((a, b) => a - b);
    const want = (q.correctIndexes || []).slice().sort((a, b) => a - b);
    const correctText = want.map((i) => q.options[i]).join("; ");
    if (!orig.length) return { state: "blank", ok: false, chosenText: "(không trả lời)", correctText, chosenOrig: [] };
    const ok = orig.length === want.length && orig.every((v, i) => v === want[i]);
    return { state: ok ? "correct" : "wrong", ok, chosenText: orig.map((i) => q.options[i]).join("; "), correctText, chosenOrig: orig };
  }
  const oi = ans && Number.isInteger(ans.answerIndex) && ans.answerIndex >= 0 && ans.answerIndex < ord.length ? ord[ans.answerIndex] : -1;
  const ok = oi === q.correctIndex;
  return { state: oi < 0 ? "blank" : (ok ? "correct" : "wrong"), ok: oi >= 0 && ok, chosenText: oi >= 0 ? q.options[oi] : "(không trả lời)", correctText: q.options[q.correctIndex], chosenOrig: oi >= 0 ? [oi] : [] };
}
function usableQ(q) {
  if (!q || q.active === false || !q.text) return false;
  if (qType(q) === "fill") return Array.isArray(q.accepted) && q.accepted.length >= 1;
  return Array.isArray(q.options) && q.options.length >= 2;
}
// Chuyển đổi một lần: ngân hàng đề cũ (chưa câu nào có kỳ) chính là đề của kỳ đang chạy -> gắn vào kỳ hiện tại.
// Các bước chuyển đổi dữ liệu một lần (gắn nhãn miền Bắc -> nhập câu miền Nam -> ngưng câu kỹ năng).
// Gọi ở MỌI thao tác quản trị và khi thí sinh vào bài; sau lần đầu chỉ tốn một lần đọc cờ cho mỗi tiến trình.
// Chuyển đổi một lần: nhóm ngành theo chức danh. Ngành 1 = máy lọc nước, ngành 2 = gia dụng (đúng định nghĩa ở org.js).
// Chỉ đổi người đang là "Cả hai" (mặc định) có chức danh SR 1 / ASM 1 / SR 2 / ASM 2; người đã được đặt nhóm ngành riêng giữ nguyên.
// Đổi nhóm ngành thì xác nhận của quản lí không còn đúng nên gỡ để quản lí xác nhận lại (giống khi sửa thông tin). Sao lưu danh sách trước khi ghi.
const SEG_TITLE_KEY = "kt/migrate-segment-by-title-v1.json";
const SEG_BY_TITLE = { "sr 1": "may_loc", "asm 1": "may_loc", "sr 2": "gia_dung", "asm 2": "gia_dung" };
let segTitleDone = false;
async function ensureSegmentByTitle() {
  if (segTitleDone) return null;
  if (await store.get(SEG_TITLE_KEY)) { segTitleDone = true; return null; }
  const list = await getCandidates();
  const before = JSON.parse(JSON.stringify(list));
  let n = 0;
  list.forEach((c) => {
    const want = SEG_BY_TITLE[normTitle(c && c.title).toLowerCase()];
    if (!want || normSegment(c.segment) !== "both") return;
    c.segment = want; delete c.confirmed;
    c.audit = (c.audit || []).concat([{ at: Date.now(), kind: "edit", by: "system", byName: "Hệ thống", changes: { admin: { from: "", to: "đặt nhóm ngành theo chức danh (ngành 1 = máy lọc, ngành 2 = gia dụng)" } } }]).slice(-30);
    n++;
  });
  if (n) { await store.put("kt/candidates-backup-before-segment-v1.json", { at: Date.now(), candidates: before }); await saveCandidates(list); }
  await store.put(SEG_TITLE_KEY, { at: Date.now(), changed: n });
  segTitleDone = true;
  return n;
}
async function runMigrations(log) {
  for (const [name, fn] of [["regionTags", ensureRegionTags], ["seeds", ensureSeeds], ["moveNam", ensureMoveNam], ["noSkill", ensureNoSkill], ["segByTitle", ensureSegmentByTitle]]) {
    try { await fn(); } catch (e) { if (log) (log.warn || log)("migration " + name + " loi: " + (e && e.message)); } // lỗi thì lần gọi sau thử lại
  }
}
async function ensureBankPeriods() {
  await runMigrations();
  const list = await getQuestions();
  if (!list.length || list.some((q) => q.period)) return null;
  const st = await getSettings();
  list.forEach((q) => { q.period = st.examPeriod; });
  await saveQuestions(list);
  try { await require("./auditlog").write({ area: "system", role: "system", by: "hệ thống", name: "Hệ thống", op: "migrateBank", label: "Tự gắn ngân hàng đề cũ vào kỳ hiện tại", kind: "change", status: 200, ok: true, details: { count: list.length, period: st.examPeriod } }); } catch (e) {}
  return { migrated: list.length, period: st.examPeriod };
}
// Chuyển đổi một lần (10/2026): toàn bộ câu Máy lọc nước + Kỹ năng bán hàng có sẵn trước khi tách miền đều là đề MIỀN BẮC
// -> tự gắn tag "Miền Bắc". Chỉ áp dụng cho câu tạo TRƯỚC mốc REGION_MIGRATE_CUTOFF (mã câu chứa thời điểm tạo), chưa thuộc miền nào.
// Câu miền Nam thêm sau mốc này không bị đụng tới. Chạy đúng một lần (đánh dấu trong kho), sao lưu ngân hàng đề trước khi ghi.
const REGION_MIGRATE_KEY = "kt/migrate-region-bac-v1.json";
const REGION_MIGRATE_CUTOFF = 1792828265984;
function regionMigrateCat(c) {
  const f = foldRg(c);
  if (f.indexOf("may loc") >= 0) return true;                                  // Máy lọc nước, Kỹ năng bán hàng máy lọc...
  return /\bk[yi] nang ban hang\b/.test(f) && f.indexOf("gia dung") < 0;       // Kỹ năng bán hàng (trừ kỹ năng bán hàng gia dụng)
}
function idTime(id) { const t = parseInt(String(id || "").slice(0, 8), 36); return t > 1.4e12 && t < 4e12 ? t : 0; }
let regionMigrated = false;
async function ensureRegionTags() {
  if (regionMigrated) return null;
  if (await store.get(REGION_MIGRATE_KEY)) { regionMigrated = true; return null; }
  const list = await getQuestions();
  const before = JSON.parse(JSON.stringify(list)), byCat = {};
  let n = 0;
  list.forEach((q) => {
    if (!regionMigrateCat(q.category) || questionRegion(q)) return;
    const t = idTime(q.id); if (t && t >= REGION_MIGRATE_CUTOFF) return;
    q.tags = (Array.isArray(q.tags) ? q.tags : []).concat(["Miền Bắc"]).slice(-12);
    byCat[q.category] = (byCat[q.category] || 0) + 1; n++;
  });
  if (n) { await backupQuestions(before); await saveQuestions(list); }
  await store.put(REGION_MIGRATE_KEY, { at: Date.now(), tagged: n, byCat });
  regionMigrated = true;
  try { await require("./auditlog").write({ area: "system", role: "system", by: "hệ thống", name: "Hệ thống", op: "migrateRegion", label: "Tự gắn nhãn Miền Bắc cho câu Máy lọc nước / Kỹ năng bán hàng có sẵn", kind: "change", status: 200, ok: true, details: { tagged: n, byCat } }); } catch (e) {}
  return { tagged: n, byCat };
}
// ---------- Số lượt làm ----------
// Giới hạn lượt của một đề: bật "làm lại nhiều lần" = không giới hạn; không thì theo maxAttempts (mặc định 1).
function attemptLimit(settings) { return settings && settings.allowRetake ? Infinity : Math.max(1, toInt(settings && settings.maxAttempts) || 1); }
// Các bài ĐÃ NỘP của một thí sinh trong một đề, cũ -> mới
function submittedOf(idx, code, period) {
  return (idx || []).filter((a) => normCode(a.code) === normCode(code) && a.status === "submitted" && (a.period || "") === period).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
}
// Kết quả CHÍNH THỨC của một người trong một đề (khi làm nhiều lượt) = lần có điểm CAO NHẤT.
// So sánh: tỉ lệ đúng cao hơn -> số câu đúng nhiều hơn -> nộp sau (hoà điểm thì lấy lần gần nhất).
function betterResult(a, b) {
  if (!b) return true;
  if ((a.pct || 0) !== (b.pct || 0)) return (a.pct || 0) > (b.pct || 0);
  if ((a.score || 0) !== (b.score || 0)) return (a.score || 0) > (b.score || 0);
  return (a.submittedAt || 0) > (b.submittedAt || 0);
}
// ---------- Nhập bộ câu hỏi có sẵn trong repo (api/_lib/seed/*.json), mỗi bộ đúng MỘT lần ----------
// Đích: đề mặc định hiện tại (cài đặt chung); nếu đề đó chưa có câu cùng danh mục thì vào đề gần nhất đang có danh mục đó.
// Danh mục lấy đúng tên đang dùng trong hệ thống (không phân biệt hoa thường). Bỏ qua câu trùng nội dung trong cùng đề.
const SEEDS = ["mien-nam-may-loc-v1"];
let seedsDone = false;
async function ensureSeeds() {
  if (seedsDone) return null;
  const report = {};
  for (const name of SEEDS) {
    const key = "kt/seed-" + name + ".json";
    if (await store.get(key)) continue;
    let data; try { data = require("./seed/" + name + ".json"); } catch (e) { continue; }
    const list = await getQuestions(), st = await getSettings();
    const want = foldRg(data.category);
    const sameCat = list.filter((q) => foldRg(q.category) === want);
    let period = st.examPeriod;
    if (!sameCat.some((q) => (q.period || "") === period)) {
      const ps = Array.from(new Set(sameCat.map((q) => q.period || ""))).filter(Boolean).sort();
      if (ps.length) period = ps[ps.length - 1];
    }
    const catName = (sameCat.find((q) => (q.period || "") === period) || sameCat[0] || {}).category || data.category;
    const normT = (t) => String(t || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
    const have = new Set(list.filter((q) => (q.period || "") === period).map((q) => normT(q.text)));
    const before = JSON.parse(JSON.stringify(list));
    let added = 0, skipped = 0;
    (data.questions || []).forEach((q) => {
      const nq = normalizeQuestionInput(q);
      if (nq.error || have.has(normT(nq.fields.text))) { skipped++; return; }
      have.add(normT(nq.fields.text));
      list.push(Object.assign({ id: genId(), category: catName, active: true, period }, nq.fields, cleanQuestionMeta({ tags: q.tags, explanation: q.explanation })));
      added++;
    });
    if (added) { await backupQuestions(before); await saveQuestions(list); }
    await store.put(key, { at: Date.now(), period, category: catName, added, skipped });
    report[name] = { period, category: catName, added, skipped };
    try { await require("./auditlog").write({ area: "system", role: "system", by: "hệ thống", name: "Hệ thống", op: "seedQuestions", label: "Nhập bộ câu hỏi " + name, kind: "change", status: 200, ok: true, details: report[name] }); } catch (e) {}
  }
  seedsDone = true;
  return report;
}
// ---------- Chuyển 100 câu Máy lọc nước Miền Nam sang đúng đề KTDKPCS102026 (chạy một lần) ----------
// Bộ nhập lần đầu đưa nhầm vào ngân hàng của đề MẶC ĐỊNH; câu phải thuộc đề "Kiểm tra định kì PCs - Tháng 10/2026 | GT".
// Nhận diện đúng các câu của bộ nhập (nội dung trùng file + tag Miền Nam). Đề đích đã có câu trùng thì bỏ bản thừa.
const MOVE_NAM_KEY = "kt/migrate-move-nam-KTDKPCS102026-v1.json";
const MOVE_NAM_TARGET = "KTDKPCS102026";
let moveNamDone = false;
async function ensureMoveNam() {
  if (moveNamDone) return null;
  if (await store.get(MOVE_NAM_KEY)) { moveNamDone = true; return null; }
  const exams = await getExams();
  if (!exams.some((e) => e.id === MOVE_NAM_TARGET)) { moveNamDone = true; return null; } // không có đề này: bỏ qua
  let data; try { data = require("./seed/mien-nam-may-loc-v1.json"); } catch (e) { return null; }
  const normT = (t) => String(t || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const seedTexts = new Set((data.questions || []).map((q) => normT(q.text)));
  const list = await getQuestions();
  const before = JSON.parse(JSON.stringify(list));
  const inTarget = new Set(list.filter((q) => (q.period || "") === MOVE_NAM_TARGET).map((q) => normT(q.text)));
  const catName = (list.find((q) => (q.period || "") === MOVE_NAM_TARGET && foldRg(q.category) === "may loc nuoc") || {}).category || "Máy lọc nước";
  let moved = 0, dropped = 0; const from = {};
  const out = list.filter((q) => {
    if ((q.period || "") === MOVE_NAM_TARGET || questionRegion(q) !== "nam" || !seedTexts.has(normT(q.text))) return true;
    from[q.period || ""] = (from[q.period || ""] || 0) + 1;
    if (inTarget.has(normT(q.text))) { dropped++; return false; } // đề đích đã có câu này
    q.period = MOVE_NAM_TARGET; q.category = catName; inTarget.add(normT(q.text)); moved++;
    return true;
  });
  if (moved || dropped) { await backupQuestions(before); await saveQuestions(out); }
  const info = { at: Date.now(), target: MOVE_NAM_TARGET, moved, dropped, from };
  await store.put(MOVE_NAM_KEY, info);
  moveNamDone = true;
  try { await require("./auditlog").write({ area: "system", role: "system", by: "hệ thống", name: "Hệ thống", op: "moveNamQuestions", label: "Chuyển câu Máy lọc nước Miền Nam sang đề " + MOVE_NAM_TARGET, kind: "change", status: 200, ok: true, details: info }); } catch (e) {}
  return info;
}
// ---------- Ngưng dùng câu hỏi KỸ NĂNG (10/2026, chưa đảm bảo chất lượng) — chạy một lần ----------
// 1) Tạm ngưng (active=false, KHÔNG xoá; đánh dấu pausedBy để bật lại được) mọi câu kỹ năng bán hàng/tư vấn,
//    trừ "Kỹ năng bán hàng gia dụng" (PC chỉ bán gia dụng không có câu máy lọc để thay).
// 2) Khung phân bổ (cài đặt chung + từng đề): số câu của dòng kỹ năng được cộng sang dòng "Máy lọc nước" để giữ tổng số câu.
const NOSKILL_KEY = "kt/migrate-no-skill-v1.json";
const isSkillCat = (c) => { const f = foldRg(c); return /\bk[yi] nang\b/.test(f) && f.indexOf("gia dung") < 0; };
function isSkillQ(q) {
  if (isSkillCat(q && q.category)) return true;
  return (Array.isArray(q && q.tags) ? q.tags : []).some((t) => /^k[yi] nang (tu van|ban hang)/.test(foldRg(t)) && foldRg(t).indexOf("gia dung") < 0);
}
function plansWithoutSkill(sp, mayLocName) {
  if (!sp || typeof sp !== "object") return { sp, moved: 0 };
  const out = {}; let moved = 0;
  Object.keys(sp).forEach((seg) => {
    const rows = Array.isArray(sp[seg]) ? sp[seg].map((r) => Object.assign({}, r)) : sp[seg];
    if (!Array.isArray(rows) || seg === "gia_dung") { out[seg] = rows; return; }
    const skill = rows.filter((r) => isSkillCat(r.category)), n = skill.reduce((x, r) => x + (toInt(r.count) || 0), 0);
    if (!skill.length) { out[seg] = rows; return; }
    const keep = rows.filter((r) => !isSkillCat(r.category));
    const ml = keep.find((r) => foldRg(r.category) === "may loc nuoc");
    if (ml) ml.count = (toInt(ml.count) || 0) + n; else keep.push({ category: mayLocName, count: n });
    out[seg] = keep; moved += n;
  });
  return { sp: out, moved };
}
let noSkillDone = false;
async function ensureNoSkill() {
  if (noSkillDone) return null;
  if (await store.get(NOSKILL_KEY)) { noSkillDone = true; return null; }
  const list = await getQuestions();
  const before = JSON.parse(JSON.stringify(list)), byCat = {};
  let paused = 0;
  list.forEach((q) => {
    if (q.active === false || !isSkillQ(q)) return;
    q.active = false; q.pausedBy = "no-skill-v1"; paused++;
    byCat[q.category || "(trống)"] = (byCat[q.category || "(trống)"] || 0) + 1;
  });
  const mlName = (list.find((q) => foldRg(q.category) === "may loc nuoc") || {}).category || "Máy lọc nước";
  if (paused) { await backupQuestions(before); await saveQuestions(list); }
  // Khung phân bổ chung
  const raw = (await store.get(S_KEY)) || {};
  const g = plansWithoutSkill(raw.segmentPlans, mlName);
  if (g.moved) { raw.segmentPlans = g.sp; await saveSettings(raw); }
  // Khung phân bổ riêng của từng đề
  const exams = await getExams(); let exMoved = 0;
  exams.forEach((e) => { const r = plansWithoutSkill(e.segmentPlans, mlName); if (r.moved) { e.segmentPlans = r.sp; exMoved += r.moved; } });
  if (exMoved) await saveExams(exams);
  const info = { at: Date.now(), paused, byCat, planMovedGlobal: g.moved, planMovedExams: exMoved };
  await store.put(NOSKILL_KEY, info);
  noSkillDone = true;
  try { await require("./auditlog").write({ area: "system", role: "system", by: "hệ thống", name: "Hệ thống", op: "pauseSkillQuestions", label: "Ngưng dùng câu kỹ năng, thay bằng câu Máy lọc nước", kind: "change", status: 200, ok: true, details: info }); } catch (e) {}
  return info;
}
// Tóm tắt các lần làm của một thí sinh trong một đề (cho màn kết quả): mỗi lần điểm/tỉ lệ/thời gian,
// đánh dấu lần CHÍNH THỨC (điểm cao nhất) và lần đang xem; kèm số lượt tối đa / còn lại (0 = không giới hạn).
function attemptsSummary(idx, code, period, settings, currentId) {
  const subs = submittedOf(idx, code, period);
  let best = null; subs.forEach((a) => { if (betterResult(a, best)) best = a; });
  const lim = attemptLimit(settings), max = lim === Infinity ? 0 : lim;
  return {
    max, left: max ? Math.max(0, max - subs.length) : null,
    list: subs.map((a, i) => ({ n: i + 1, score: a.score, total: a.total, pct: a.pct, submittedAt: a.submittedAt,
      durationSec: a.durationSec != null ? a.durationSec : (a.startedAt ? Math.round(((a.submittedAt || 0) - a.startedAt) / 1000) : null),
      official: !!best && best.id === a.id, current: a.id === currentId }))
  };
}
// Thứ tự lấy đề cho kỳ P: câu của kỳ P -> câu chưa gắn kỳ -> đề của kỳ gần nhất TRƯỚC P (dự phòng tạm thời,
// để đổi sang kỳ mới mà chưa kịp soạn đề thì thí sinh vẫn làm được bài; trang quản trị báo rõ đang dùng tạm).
function bankFor(all, period) {
  const own = all.filter((q) => usableQ(q) && (q.period || "") === period);
  if (own.length || !period) return { list: own, source: own.length ? "period" : "none" };
  const shared = all.filter((q) => usableQ(q) && !q.period);
  if (shared.length) return { list: shared, source: "unassigned" };
  const prev = Array.from(new Set(all.filter((q) => usableQ(q) && q.period && q.period < period).map((q) => q.period))).sort().pop();
  if (prev) return { list: all.filter((q) => usableQ(q) && q.period === prev), source: "previous", from: prev };
  return { list: [], source: "none" };
}

// Bản sao lưu ngân hàng đề trước khi xoá hàng loạt (giữ bản gần nhất để khôi phục).
const QB_KEY = "kt/questions-backup.json";
async function backupQuestions(list) { await store.put(QB_KEY, { at: Date.now(), questions: list }); }
async function getQuestionsBackup() { return store.get(QB_KEY); }
// Số thí sinh đang làm bài dở (chưa hết giờ).
async function countInProgress() {
  let n = 0;
  const names = (await store.list("kt/active/")).slice(0, 300);
  for (const name of names) {
    try {
      const p = await store.get(name);
      const a = p && p.attemptId ? await getAttempt(p.attemptId) : null;
      if (a && a.status === "in_progress" && !a.test) { const c = Object.assign({}, a); syncAttempt(c, Date.now()); if (c.cursor < c.questionIds.length) n++; }
    } catch (e) { /* bỏ qua mục lỗi */ }
  }
  return n;
}

// ---------- Tài khoản quản lí (chỉ xem kết quả + chỉnh thông tin nhân viên của mình) ----------
const V_KEY = "kt/viewers.json";
async function getViewers() { return (await store.get(V_KEY)) || []; }
async function saveViewers(list) { await store.put(V_KEY, list); }
// So khớp tên người (không phân biệt hoa thường, dấu, khoảng trắng thừa).
function normPerson(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
}
// Chuẩn hoá TÊN QUẢN LÍ khi lưu: "lê thị thanh loan", "LÊ THỊ THANH LOAN" và "Lê Thị Thanh Loan" là MỘT người.
// Trùng quản lí đã có (không phân biệt hoa/thường, dấu, khoảng trắng) thì dùng đúng cách viết đang phổ biến nhất của người đó;
// tên mới viết toàn HOA hoặc toàn thường thì tự viết hoa chữ cái đầu mỗi từ. Trả về hàm chuẩn hoá (nhớ cả tên mới thêm trong cùng đợt).
function properCaseName(s) {
  const hasL = /\p{Ll}/u.test(s), hasU = /\p{Lu}/u.test(s);
  return hasL && hasU ? s : s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
function managerCanon(list) {
  const stat = {};
  (list || []).forEach((c) => {
    const n = String((c && c.manager) || "").replace(/\s+/g, " ").trim(); if (!n) return;
    const k = normPerson(n); stat[k] = stat[k] || {}; stat[k][n] = (stat[k][n] || 0) + 1;
  });
  const best = {};
  Object.keys(stat).forEach((k) => { best[k] = Object.keys(stat[k]).sort((a, b) => stat[k][b] - stat[k][a] || a.localeCompare(b))[0]; });
  return (input) => {
    const n = String(input == null ? "" : input).replace(/\s+/g, " ").trim().slice(0, 100);
    if (!n) return "";
    const k = normPerson(n);
    if (!best[k]) best[k] = properCaseName(n);
    return best[k];
  };
}
async function findViewer(email) {
  const e = normEmail(email);
  return (await getViewers()).find((v) => normEmail(v.email) === e) || null;
}
// Nhân viên có thuộc phạm vi của quản lí này không (theo tên quản lí ghi trong danh sách thí sinh).
function inScope(viewer, candidate) {
  if (viewer && viewer.isAdmin) return true; // quản trị viên: toàn quyền, không giới hạn theo quản lí nào
  const mine = new Set(((viewer && viewer.scopes) || []).map(normPerson).filter(Boolean));
  return mine.size > 0 && mine.has(normPerson(candidate && candidate.manager));
}

async function getQuestions() { return ((await store.get(Q_KEY)) || []).map(cleanQuestion); } // dọn ký tự \" thừa ở câu cũ đã lưu
async function saveQuestions(list) { await store.put(Q_KEY, list); }

async function getCandidates() { return (await store.get(C_KEY)) || []; }

// ---------- Tài khoản THỬ NGHIỆM ----------
// Dành cho quản trị thử đề: không giới hạn lượt, không bị khung giờ/đối tượng chặn, KHÔNG ghi vào kết quả / dashboard / xuất dữ liệu.
// Lưu riêng, không nằm trong danh sách thí sinh nên không lọt vào bất kỳ thống kê nào.
const TA_KEY = "kt/testaccounts.json";
async function getTestAccounts() { const l = await store.get(TA_KEY); return Array.isArray(l) ? l : []; }
async function saveTestAccounts(list) { await store.put(TA_KEY, list); }
async function findTestAccount(code, email) {
  const k = normCode(code), e = normEmail(email);
  if (!k || !e) return null;
  const t = (await getTestAccounts()).find((x) => normCode(x.code) === k && normEmail(x.email) === e);
  if (!t) return null;
  return { code: t.code, email: t.email, name: t.name || "Tài khoản thử nghiệm", manager: "", phone: "", segment: normSegment(t.segment), title: normTitle(t.title) || DEFAULT_TITLE,
    province: "", region: normRegion(t.region) || "bac", test: true };
}
async function saveCandidates(list) { await store.put(C_KEY, list); }

async function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, (await store.get(S_KEY)) || {});
}
async function saveSettings(s) { await store.put(S_KEY, s); }

// ---------- Nhiều đề thi độc lập ----------
// Mỗi đề thi là MỘT BẢN GHI gắn với một mã "period" riêng (vd "2026-10" cho đề lặp lại theo tháng,
// hoặc "thu-nghiem" cho một đề thử). Mỗi đề có cài đặt RIÊNG (số câu, thời gian/câu, ngưỡng đạt, điểm
// tuân thủ...); đề nào không tự nêu cài đặt riêng thì dùng theo cài đặt chung (getSettings()) làm mặc định.
const OVERRIDABLE_FIELDS = [
  "examTitle", "shareTitle", "questionCount", "bothGiaDungCount", "secondsPerQuestion",
  "passEnabled", "passScore", "allowRetake", "maxAttempts",
  "complianceEnabled", "complianceHighMin", "complianceMidMin", "complianceLowMin"
];

async function getExams() { return (await store.get(EX_KEY)) || []; }
async function saveExams(list) { await store.put(EX_KEY, list); }

// Cài đặt THỰC TẾ áp dụng cho một đề thi cụ thể: lấy cài đặt chung làm nền, đè lên bằng phần đề thi đó tự nêu riêng.
async function getExamSettings(examId) {
  const base = await getSettings();
  const exams = await getExams();
  const ex = exams.find((e) => e.id === examId);
  const effective = Object.assign({}, base, ex ? pick(ex, OVERRIDABLE_FIELDS) : {});
  effective.examPeriod = examId != null ? examId : base.examPeriod;
  // Tên đề thí sinh thấy: tên đặt ở form đề (title). Trước đây chỉ lưu title cho danh sách quản trị nên mọi đề
  // đều hiện tên chung ở Cài đặt (vd một đề thật bị hiện chữ "THI THỬ" của tên chung). Đề chưa đặt tên riêng mới dùng tên chung.
  if (ex && !ex.examTitle && ex.title && String(ex.title).trim() !== ex.id) effective.examTitle = String(ex.title).trim();
  // Cấu trúc đề + khung thời gian + đối tượng: chỉ có ở đề thi đã đăng ký (không kế thừa từ cài đặt chung).
  effective.blueprint = ex && ex.blueprint ? ex.blueprint : null;
  // Phân bổ câu theo nhóm ngành: đề có phân bổ riêng thì dùng của đề, không thì theo cài đặt chung
  if (ex && ex.segmentPlans && Object.keys(ex.segmentPlans).length) effective.segmentPlans = ex.segmentPlans;
  effective.openAt = ex && ex.openAt ? ex.openAt : 0;
  effective.closeAt = ex && ex.closeAt ? ex.closeAt : 0;
  effective.segments = ex && Array.isArray(ex.segments) ? ex.segments : [];
  effective.codes = ex && Array.isArray(ex.codes) ? ex.codes : []; // danh sách mã nhân viên được thi (rỗng = không giới hạn theo mã)
  effective.description = ex && ex.description ? ex.description : "";
  // Đề thi thử: chấm và quy đổi điểm tuân thủ NHƯ BÌNH THƯỜNG (để thí sinh hình dung điểm nếu thi thật),
  // nhưng mọi màn hình, ảnh kết quả và email đều ghi rõ "THI THỬ - không phải thi chính thức".
  effective.practice = !!(ex && ex.practice);
  return effective;
}
function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k]; });
  return out;
}

// Tạo mới hoặc cập nhật một đề thi (theo id). Validate id và các trường ghi đè trước khi lưu.
async function upsertExam(data) {
  const id = String((data && data.id) || "").trim();
  if (!validPeriod(id) || !id) return { ok: false, error: "Mã đề thi không hợp lệ (chỉ chữ/số/gạch ngang, tối đa 40 ký tự, hoặc dạng năm-tháng)." };
  const exams = await getExams();
  const i = exams.findIndex((e) => e.id === id);
  const now = Date.now();
  const entry = Object.assign(
    { id, title: String((data && data.title) || id).trim().slice(0, 150), createdAt: i >= 0 ? exams[i].createdAt : now },
    pick(data || {}, OVERRIDABLE_FIELDS)
  );
  // Khống chế số câu: kiểm tra chặt, lưu dạng SỐ (không lưu chuỗi thô như trước)
  const base = await getSettings();
  const bpIn = data && data.blueprint !== undefined ? cleanBlueprint(data.blueprint) : (i >= 0 ? exams[i].blueprint : null);
  if (bpIn && bpIn.error) return { ok: false, error: bpIn.error };
  const qcIn = entry.questionCount !== undefined ? entry.questionCount : (i >= 0 && exams[i].questionCount != null ? exams[i].questionCount : undefined);
  const verr = validateCounts({ questionCount: qcIn, bothGiaDungCount: entry.bothGiaDungCount, blueprint: bpIn }, targetCount(base));
  if (verr) return { ok: false, error: verr };
  if (entry.questionCount !== undefined) entry.questionCount = toInt(entry.questionCount);
  if (entry.bothGiaDungCount !== undefined) entry.bothGiaDungCount = toInt(entry.bothGiaDungCount);
  if (entry.secondsPerQuestion !== undefined) { const sp = toInt(entry.secondsPerQuestion); if (!(sp >= 10 && sp <= 600)) return { ok: false, error: "Thời gian mỗi câu phải từ 10 đến 600 giây." }; entry.secondsPerQuestion = sp; }
  if (entry.maxAttempts !== undefined) { const ma = toInt(entry.maxAttempts); if (!(ma >= 1 && ma <= 20)) return { ok: false, error: "Số lượt làm mỗi người phải từ 1 đến 20." }; entry.maxAttempts = ma; }
  if (entry.passScore !== undefined) { const ps = toInt(entry.passScore); if (!(ps >= 0 && ps <= 100)) return { ok: false, error: "Điểm đạt phải từ 0 đến 100%." }; entry.passScore = ps; }
  // Ô để trống = kế thừa cài đặt chung: xoá giá trị cũ đã lưu (trước đây để trống KHÔNG xoá được giá trị cũ)
  if (data) ["questionCount", "bothGiaDungCount", "secondsPerQuestion", "passScore", "maxAttempts"].forEach((k) => { if (data[k] === "" && i >= 0) delete exams[i][k]; });
  if (data && data.practice !== undefined) entry.practice = !!data.practice;
  if (data && data.description !== undefined) entry.description = String(data.description || "").trim().slice(0, 500);
  if (data && data.blueprint !== undefined) {
    const bp = cleanBlueprint(data.blueprint);
    if (bp && bp.error) return { ok: false, error: bp.error };
    entry.blueprint = bp; // null = dùng cách ra đề cũ
  }
  if (data && data.segmentPlans !== undefined) {
    const sp = data.segmentPlans ? cleanSegmentPlans(data.segmentPlans) : {};
    if (sp.error) return { ok: false, error: sp.error };
    entry.segmentPlans = Object.keys(sp).length ? sp : null; // null = theo cài đặt chung
  }
  if (data && data.openAt !== undefined) entry.openAt = Math.max(0, Number(data.openAt) || 0);
  if (data && data.closeAt !== undefined) entry.closeAt = Math.max(0, Number(data.closeAt) || 0);
  if (entry.openAt && entry.closeAt && entry.closeAt <= entry.openAt) return { ok: false, error: "Thời gian đóng phải sau thời gian mở." };
  if (data && data.codes !== undefined) {
    const raw = Array.isArray(data.codes) ? data.codes : String(data.codes || "").split(/[\s,;]+/);
    entry.codes = raw.map(normCode).filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).slice(0, 5000);
  }
  if (data && data.segments !== undefined) entry.segments = (Array.isArray(data.segments) ? data.segments : []).map(normSegment).filter((v, k, a) => a.indexOf(v) === k);
  if (i >= 0) exams[i] = Object.assign({}, exams[i], entry); else exams.push(entry);
  await saveExams(exams);
  return { ok: true, exam: entry };
}
async function deleteExam(id) {
  const exams = await getExams();
  const kept = exams.filter((e) => e.id !== id);
  await saveExams(kept);
  return exams.length - kept.length;
}

// Danh sách đề thi để hiển thị (gộp đề đã đăng kí RIÊNG trong kt/exams.json với mọi "period" đã có dữ liệu
// thật trong ngân hàng đề/kết quả, để không "mất" các kỳ cũ tạo trước khi có màn quản lý đề thi này).
async function listExamsSummary() {
  const [exams, questions, idx, settings] = await Promise.all([getExams(), getQuestions(), getIndex(), getSettings()]);
  const byId = {};
  // LƯU Ý: số câu đang có trong ngân hàng của kỳ được đếm vào "bankCount", KHÔNG dùng tên "questionCount"
  // (questionCount là cài đặt "số câu mỗi đề"; trùng tên trước đây khiến form Sửa đề hiện và lưu nhầm số câu ngân hàng).
  exams.forEach((e) => { byId[e.id] = Object.assign({}, e, { bankCount: 0, resultCount: 0 }); });
  const touch = (id) => {
    if (!id && id !== "") return;
    if (!byId[id]) byId[id] = { id, title: id || "(chưa gắn đề)", bankCount: 0, resultCount: 0 };
  };
  questions.forEach((q) => { touch(q.period || ""); if (byId[q.period || ""]) byId[q.period || ""].bankCount++; });
  idx.forEach((r) => { touch(r.period || ""); if (byId[r.period || ""]) byId[r.period || ""].resultCount++; });
  touch(settings.examPeriod);
  return Object.values(byId).filter((e) => e.id !== "").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.id.localeCompare(b.id));
}

// ---------- Nhiều ngân hàng câu hỏi ----------
// Câu hỏi chưa có bankId thuộc ngân hàng "default" (Ngân hàng chung) để dữ liệu cũ vẫn chạy bình thường.
const BANKS_KEY = "kt/banks.json";
const DEFAULT_BANK = "default";
const DIFFICULTIES = ["easy", "medium", "hard"];
async function getBanks() {
  const list = (await store.get(BANKS_KEY)) || [];
  if (!list.some((b) => b.id === DEFAULT_BANK)) list.unshift({ id: DEFAULT_BANK, name: "Ngân hàng chung", description: "Các câu hỏi chưa xếp vào ngân hàng riêng", createdAt: 0 });
  return list;
}
async function saveBanks(list) { await store.put(BANKS_KEY, list.filter((b) => b.id !== DEFAULT_BANK)); } // "default" luôn là ngân hàng ảo, không lưu
const bankOf = (q) => (q && q.bankId) || DEFAULT_BANK;
function validBankId(id) { return /^[a-z0-9][a-z0-9-]{0,39}$/i.test(String(id || "")); }
function slugify(s) {
  return normPerson(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "bank";
}
// Làm sạch các trường mở rộng của câu hỏi (ngân hàng, độ khó, thẻ, giải thích).
function cleanQuestionMeta(q, prev) {
  const out = {};
  const p = prev || {};
  if (q.bankId !== undefined) out.bankId = validBankId(q.bankId) ? String(q.bankId) : DEFAULT_BANK;
  else if (p.bankId) out.bankId = p.bankId;
  const d = q.difficulty !== undefined ? q.difficulty : p.difficulty;
  if (DIFFICULTIES.indexOf(d) >= 0) out.difficulty = d; else out.difficulty = "";
  const t = q.tags !== undefined ? q.tags : p.tags;
  const tags = Array.isArray(t) ? t : String(t || "").split(",");
  out.tags = tags.map((x) => String(x || "").trim().slice(0, 40)).filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).slice(0, 12);
  const e = q.explanation !== undefined ? q.explanation : p.explanation;
  out.explanation = String(e || "").trim().slice(0, 1000);
  return out;
}

// ---------- Cấu trúc đề (blueprint) ----------
// blueprint = { rules: [{ bankId: "*"|<id>, category: "", difficulty: ""|easy|medium|hard, tag: "", count: N }] }
function cleanBlueprint(bp) {
  if (bp === null || bp === "") return null;
  const rules = bp && Array.isArray(bp.rules) ? bp.rules : null;
  if (!rules) return { error: "Cấu trúc đề không hợp lệ." };
  if (!rules.length) return null;
  if (rules.length > 30) return { error: "Tối đa 30 quy tắc cho một đề." };
  const out = [];
  for (const r of rules) {
    const count = parseInt(r && r.count, 10);
    if (!(count >= 1 && count <= 500)) return { error: "Số câu của mỗi quy tắc phải từ 1 đến 500." };
    const bankId = r.bankId === "*" ? "*" : (validBankId(r.bankId) ? String(r.bankId) : DEFAULT_BANK);
    out.push({
      bankId, count,
      category: String(r.category || "").trim().slice(0, 100),
      difficulty: DIFFICULTIES.indexOf(r.difficulty) >= 0 ? r.difficulty : "",
      tag: String(r.tag || "").trim().slice(0, 40)
    });
  }
  return { rules: out };
}
function ruleMatches(rule, q) {
  if (rule.bankId !== "*" && bankOf(q) !== rule.bankId) return false;
  if (rule.category && (q.category || "") !== rule.category) return false;
  if (rule.difficulty && (q.difficulty || "") !== rule.difficulty) return false;
  if (rule.tag && !(Array.isArray(q.tags) && q.tags.indexOf(rule.tag) >= 0)) return false;
  return true;
}
function blueprintTotal(bp) { return bp && bp.rules ? bp.rules.reduce((n, r) => n + (r.count || 0), 0) : 0; }
// Rút câu theo từng quy tắc theo thứ tự; một câu không xuất hiện hai lần trong cùng một đề.
// Trả về { picked, report: [{ rule, available, taken, short }] } để quản trị viên biết quy tắc nào thiếu câu.
function buildFromBlueprint(all, blueprint) {
  const usable = all.filter(usableQ), used = new Set(), picked = [], report = [];
  (blueprint.rules || []).forEach((rule) => {
    const pool = usable.filter((q) => !used.has(q.id) && ruleMatches(rule, q));
    const take = shuffle(pool).slice(0, rule.count);
    take.forEach((q) => { used.add(q.id); picked.push(q); });
    report.push({ rule, available: pool.length, taken: take.length, short: Math.max(0, rule.count - take.length) });
  });
  return { picked: shuffle(picked), report };
}

// ---------- Khung thời gian & đối tượng của đề thi ----------
// Trả về chuỗi lỗi (tiếng Việt) nếu thí sinh không được vào đề này lúc này, ngược lại trả về "".
// Thí sinh có thuộc đối tượng của đề không (theo nhóm ngành và/hoặc danh sách mã nhân viên)? Dùng cả khi cho vào thi lẫn khi
// tính "ai chưa làm" ở bảng tổng quan, để người không thuộc đối tượng không bị tính là "chưa làm".
// Nhân viên đã nghỉ việc (quản trị viên đánh dấu ở hồ sơ): không gán đề, không tính vào "chưa làm", không được vào thi, không nhận thông báo.
function isLeft(c) { return !!(c && c.left); }
function inAudience(settings, candidate) {
  if (isLeft(candidate)) return false;
  const segs = settings && settings.segments || [], codes = settings && settings.codes || [];
  if (segs.length && segs.indexOf(normSegment(candidate && candidate.segment)) < 0) return false;
  if (codes.length && codes.indexOf(normCode(candidate && candidate.code)) < 0) return false;
  return true;
}
function examAccessError(settings, candidate, now) {
  const t = now || Date.now();
  if (isLeft(candidate)) return "Tài khoản này đã được đánh dấu nghỉ việc nên không thể làm bài. Nếu có nhầm lẫn, hãy liên hệ quản trị viên.";
  if (settings.openAt && t < settings.openAt) return "Bài kiểm tra chưa mở. Thời gian mở: " + fmtVN(settings.openAt) + ".";
  if (settings.closeAt && t > settings.closeAt) return "Bài kiểm tra đã đóng từ " + fmtVN(settings.closeAt) + ".";
  if (settings.codes && settings.codes.length && settings.codes.indexOf(normCode(candidate && candidate.code)) < 0) {
    return "Bạn không nằm trong danh sách được thi bài kiểm tra này.";
  }
  if (!inAudience(settings, candidate)) return "Bài kiểm tra này không dành cho nhóm của bạn.";
  return "";
}
function fmtVN(ms) {
  const d = new Date(ms + 7 * 3600 * 1000), p = (n) => String(n).padStart(2, "0");
  return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " " + p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
}

// Mã đề thi mà thí sinh gửi lên có hợp lệ không. Chỉ nhận: đề đang đặt mặc định, đề đã đăng ký, hoặc kỳ đã có câu hỏi trong
// ngân hàng. Mã bịa (không thuộc loại nào) bị từ chối: nếu không, thí sinh gõ ?exam=<mã bất kỳ> là có đề mới và thi lại vô hạn
// lần (giới hạn "làm lại" và khung giờ mở/đóng đều tính theo từng mã đề).
async function examKnown(examId, defaultSettings) {
  const id = String(examId == null ? "" : examId);
  if (!id || !validPeriod(id)) return false;
  const base = defaultSettings || (await getSettings());
  if (id === base.examPeriod) return true;
  if ((await getExams()).some((e) => e.id === id)) return true;
  return (await getQuestions()).some((q) => usableQ(q) && (q.period || "") === id);
}

async function getAttempt(id) {
  if (!id || /[^a-z0-9]/i.test(id)) return null;
  return store.get("kt/attempt/" + id + ".json");
}
async function putAttempt(a) { await store.put("kt/attempt/" + a.id + ".json", a); }

async function getIndex() { return (await store.get(IDX_KEY)) || []; }
async function saveIndex(list) { await store.put(IDX_KEY, list); }
async function upsertIndex(entry) {
  // Nhiều thí sinh nộp bài cùng lúc: phải đọc-sửa-ghi nguyên tử, nếu không bài nộp của người này sẽ ghi đè mất bài của người kia.
  await store.update(IDX_KEY, (cur) => {
    const list = Array.isArray(cur) ? cur : [];
    const i = list.findIndex((x) => x.id === entry.id);
    if (i >= 0) list[i] = entry; else list.push(entry);
    return list;
  });
}

// ======================================================================================
// PHÂN BỔ ĐỀ: MỘT NƠI DUY NHẤT quyết định mỗi thí sinh nhận bao nhiêu câu và câu nào.
// Dùng chung cho: tạo đề (kt-start), thể lệ hiển thị (kt-check), xem trước của quản trị (kt-admin).
// Nguyên tắc khống chế:
//  1. Số câu mỗi đề = "Tổng số câu hỏi mỗi đề" (questionCount), là con số DUY NHẤT. Không có trường hợp nào
//     "lấy cả ngân hàng": thiếu / sai giá trị -> dùng mặc định DEFAULT_QUESTION_COUNT.
//  2. Trần cứng MAX_QUESTION_COUNT áp cho mọi đường (cài đặt chung, đề riêng, cấu trúc đề, dữ liệu cũ đã lưu).
//  3. Cấu trúc đề (nếu có) chỉ là CÁCH CHIA số câu đó theo ngân hàng/danh mục/độ khó; tổng quy tắc phải bằng đúng
//     questionCount (kiểm tra khi lưu). Khi rút câu vẫn cắt đúng questionCount để chặn dữ liệu cũ sai.
//  4. Không bao giờ phát nhiều hơn questionCount. Ngân hàng không đủ câu -> báo thiếu cho quản trị (preview).
// ======================================================================================
const MAX_QUESTION_COUNT = Math.max(1, Math.min(200, parseInt(process.env.KT_MAX_QUESTIONS, 10) || 60));
const DEFAULT_QUESTION_COUNT = 30;
function toInt(v) { const n = typeof v === "number" ? v : parseInt(String(v == null ? "" : v).trim(), 10); return Number.isFinite(n) ? Math.trunc(n) : NaN; }
// Số câu THỰC TẾ mỗi đề sau khi khống chế (dùng cho dữ liệu đã lưu, kể cả dữ liệu cũ sai).
function targetCount(settings) {
  const n = toInt(settings && settings.questionCount);
  return Math.min(MAX_QUESTION_COUNT, n >= 1 ? n : DEFAULT_QUESTION_COUNT);
}
// Kiểm tra chặt khi LƯU (cài đặt chung hoặc đề riêng). Trả về "" nếu hợp lệ, ngược lại là thông báo lỗi.
// fields: { questionCount, bothGiaDungCount, blueprint } — trường nào undefined/"" thì bỏ qua (kế thừa).
function validateCounts(fields, inheritedCount) {
  const f = fields || {};
  let qc = inheritedCount;
  if (f.questionCount !== undefined && f.questionCount !== null && f.questionCount !== "") {
    qc = toInt(f.questionCount);
    if (!(qc >= 1 && qc <= MAX_QUESTION_COUNT)) return "Tổng số câu hỏi mỗi đề phải là số nguyên từ 1 đến " + MAX_QUESTION_COUNT + ".";
  }
  if (f.bothGiaDungCount !== undefined && f.bothGiaDungCount !== null && f.bothGiaDungCount !== "") {
    const g = toInt(f.bothGiaDungCount);
    if (!(g >= 0)) return "Số câu \"Gia dụng\" cố định phải là số nguyên không âm.";
    if (qc >= 1 && g > qc) return "Số câu \"Gia dụng\" cố định (" + g + ") không được lớn hơn tổng số câu mỗi đề (" + qc + ").";
  }
  if (f.blueprint && f.blueprint.rules && f.blueprint.rules.length) {
    const t = blueprintTotal(f.blueprint);
    if (t > MAX_QUESTION_COUNT) return "Cấu trúc đề đang cộng ra " + t + " câu, vượt giới hạn " + MAX_QUESTION_COUNT + " câu mỗi đề.";
    if (qc >= 1 && t !== qc) return "Tổng các quy tắc trong Cấu trúc đề là " + t + " câu, phải bằng đúng Tổng số câu hỏi mỗi đề (" + qc + "). Hãy chỉnh lại số câu của các quy tắc hoặc ô Tổng số câu.";
  }
  return "";
}
// Lên đề cho MỘT thí sinh (theo nhóm ngành). Trả về:
//   { picked, target, mode: "blueprint"|"segment", short, pool, source, parts: [{label, want, got}] , error }
function planExam(all, settings, segment, region) {
  // Có miền: bỏ các câu dành riêng cho miền kia (câu không gắn miền vẫn dùng chung)
  const rg = normRegion(region);
  if (rg) all = all.filter((q) => { const qr = questionRegion(q); return !qr || qr === rg; });
  const target = targetCount(settings);
  const parts = [];
  let picked = [], pool = 0, source = "", error = "";
  if (settings.blueprint && settings.blueprint.rules && settings.blueprint.rules.length) {
    const r = buildFromBlueprint(all, settings.blueprint);
    picked = r.picked.slice(0, target);
    r.report.forEach((x) => parts.push({ label: ruleLabel(x.rule), want: x.rule.count, got: x.taken }));
    pool = r.report.reduce((n, x) => n + x.available, 0);
    source = "blueprint";
    return { picked, target, mode: "blueprint", short: Math.max(0, target - picked.length), pool, source, parts, error };
  }
  const segRows = segPlanFor(settings, segment, rg);
  if (segRows) return planBySegment(all, settings, segRows);
  const bank = bankFor(all, settings.examPeriod);
  const active = bank.list;
  source = bank.source + (bank.from ? ":" + bank.from : "");
  const seg = normSegment(segment);
  const wantCategory = CATEGORY_BY_SEGMENT[seg];
  if (!active.length) error = "Ngân hàng đề kỳ này chưa có câu hỏi.";
  else if (wantCategory) {
    const p = active.filter((q) => q.category === wantCategory);
    pool = p.length;
    picked = shuffle(p).slice(0, Math.min(target, p.length));
    parts.push({ label: wantCategory, want: target, got: picked.length });
    if (!p.length) error = "Ngân hàng đề chưa có câu hỏi danh mục \"" + wantCategory + "\".";
  } else {
    const gd = active.filter((q) => q.category === "Gia dụng"), other = active.filter((q) => q.category !== "Gia dụng");
    pool = active.length;
    const wantGD = Math.min(Math.max(0, toInt(settings.bothGiaDungCount) || 0), target);
    const gdN = Math.min(wantGD, gd.length);
    const otN = Math.min(target - gdN, other.length); // phần Gia dụng thiếu KHÔNG bù bằng câu khác để giữ đúng tỉ lệ
    picked = shuffle(shuffle(gd).slice(0, gdN).concat(shuffle(other).slice(0, otN)));
    parts.push({ label: "Gia dụng (cố định)", want: wantGD, got: gdN }, { label: "Các danh mục khác", want: target - wantGD, got: otN });
    if (!picked.length) error = "Chưa có câu hỏi phù hợp để tạo đề.";
  }
  picked = picked.slice(0, target); // chốt chặn cuối cùng
  return { picked, target, mode: "segment", short: Math.max(0, target - picked.length), pool, source, parts, error };
}
// ---------- Phân bổ câu hỏi theo nhóm ngành (cài đặt chung) ----------
// segmentPlans = { both: [{category, count}], may_loc: [...], gia_dung: [...] }. Nhóm nào có danh sách thì đề của thí sinh
// thuộc nhóm đó rút đúng số câu từng danh mục (trong ngân hàng của kỳ); nhóm để trống thì dùng cách cũ.
const PLAN_SEGS = ["both", "may_loc", "gia_dung", "mien_bac", "mien_nam"];
const normCat = (c) => String(c || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
function cleanSegmentPlans(sp) {
  const out = {};
  if (!sp || typeof sp !== "object") return out;
  for (const seg of PLAN_SEGS) {
    const rows = Array.isArray(sp[seg]) ? sp[seg] : [];
    if (rows.length > 15) return { error: "Mỗi nhóm ngành tối đa 15 dòng phân bổ." };
    const clean = [];
    for (const r of rows) {
      const category = String(r && r.category || "").trim().replace(/\s+/g, " ").slice(0, 100);
      const count = toInt(r && r.count);
      if (!category && !(count > 0)) continue; // dòng trống: bỏ qua
      if (!category) return { error: "Có dòng phân bổ chưa ghi danh mục." };
      if (!(count >= 1 && count <= 200)) return { error: "Số câu của danh mục \"" + category + "\" phải từ 1 đến 200." };
      if (clean.some((x) => normCat(x.category) === normCat(category))) return { error: "Danh mục \"" + category + "\" bị lặp trong cùng một nhóm." };
      clean.push({ category, count });
    }
    const total = clean.reduce((n, x) => n + x.count, 0);
    if (total > MAX_QUESTION_COUNT) return { error: "Phân bổ cho nhóm " + ({ both: "bán cả 2 ngành", may_loc: "chỉ bán máy lọc", gia_dung: "chỉ bán gia dụng", mien_bac: "PC Miền Bắc", mien_nam: "PC Miền Nam" }[seg]) + " cộng ra " + total + " câu, vượt giới hạn " + MAX_QUESTION_COUNT + " câu mỗi đề." };
    if (clean.length) out[seg] = clean;
  }
  // Đang ngưng câu kỹ năng: dòng kỹ năng (trừ gia dụng) tự chuyển sang "Máy lọc nước" khi lưu/xem trước,
  // để form cũ còn dòng kỹ năng có bấm Lưu cũng không đưa câu kỹ năng trở lại đề.
  if (noSkillDone) return plansWithoutSkill(out, "Máy lọc nước").sp;
  return out;
}
// PC đã chọn miền: ưu tiên phân bổ của miền ("mien_bac"/"mien_nam"); miền đó chưa phân bổ thì theo nhóm ngành như cũ.
function segPlanFor(settings, segment, region) {
  const sp = settings && settings.segmentPlans;
  const rg = normRegion(region);
  const rgRows = rg && sp && sp["mien_" + rg];
  if (Array.isArray(rgRows) && rgRows.length) return rgRows;
  const rows = sp && sp[normSegment(segment)];
  return Array.isArray(rows) && rows.length ? rows : null;
}
// Số câu thực tế của đề cho một thí sinh (để hiện ở thể lệ)
function countFor(settings, segment, region) {
  if (settings && settings.blueprint && settings.blueprint.rules && settings.blueprint.rules.length) return targetCount(settings);
  const rows = segPlanFor(settings, segment, region);
  return rows ? Math.min(MAX_QUESTION_COUNT, rows.reduce((n, r) => n + r.count, 0)) : targetCount(settings);
}
function planBySegment(all, settings, rows) {
  const target = Math.min(MAX_QUESTION_COUNT, rows.reduce((n, r) => n + r.count, 0));
  const bank = bankFor(all, settings.examPeriod), active = bank.list, used = new Set(), parts = [];
  let picked = [], pool = 0;
  rows.forEach((r) => {
    const p = active.filter((q) => !used.has(q.id) && normCat(q.category) === normCat(r.category));
    pool += p.length;
    const take = shuffle(p).slice(0, r.count);
    take.forEach((q) => used.add(q.id));
    picked = picked.concat(take);
    parts.push({ label: r.category, want: r.count, got: take.length });
  });
  picked = shuffle(picked).slice(0, target);
  const error = !active.length ? "Ngân hàng đề kỳ này chưa có câu hỏi." : !picked.length ? "Chưa có câu hỏi thuộc các danh mục đã phân bổ." : "";
  return { picked, target, mode: "segplan", short: Math.max(0, target - picked.length), pool, source: bank.source + (bank.from ? ":" + bank.from : ""), parts, error };
}

function ruleLabel(r) {
  return (r.bankId === "*" ? "Mọi ngân hàng" : "Ngân hàng " + r.bankId) + (r.category ? " · " + r.category : "") +
    (r.difficulty ? " · " + ({ easy: "Dễ", medium: "Trung bình", hard: "Khó" }[r.difficulty] || r.difficulty) : "") + (r.tag ? " · #" + r.tag : "");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Mã minh chứng in trên thẻ kết quả để quản trị viên đối chiếu với hệ thống (suy ra từ mã bài làm, không cần lưu thêm).
function proofCode(id) { return "KT-" + String(id || "").slice(-8).toUpperCase(); }

// Mã trong QR trên thẻ kết quả: <mã bài làm>.<chữ ký>. Chữ ký do máy chủ ký nên không thể đoán hoặc tự chế mã cho bài khác.
function verifySig(id) { return crypto.createHmac("sha256", cfg().secret || "x").update("verify:" + id).digest("base64url").slice(0, 16); }
function verifyToken(id) { return id + "." + verifySig(id); }
function checkVerifyToken(t) {
  const s = String(t || ""), i = s.lastIndexOf(".");
  if (i < 1 || /[^a-z0-9]/i.test(s.slice(0, i))) return null;
  const id = s.slice(0, i), sig = s.slice(i + 1), want = verifySig(id);
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

// Chấm cả bài: dùng chung cho lúc nộp bài và khi "chấm lại" (đổi đáp án đúng sau khi đã có bài nộp).
// Câu đã bị xoá khỏi ngân hàng được tính là bỏ trống (tổng số câu vẫn là số câu đã ra cho thí sinh).
// Tổng hợp điểm từ số câu đúng / sai / tổng số câu (dùng chung cho chấm bài thường và chấm lại từng câu)
function summarize(correct, wrongN, total, settings) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const scoreOutOf10 = total ? (correct / total) * 10 : 0;
  return {
    correct, wrongN, total, pct,
    blank: Math.max(0, total - correct - wrongN),
    passed: passState(pct, settings), // null nếu bài không có ngưỡng đạt
    scoreOutOf10: Math.round(scoreOutOf10 * 100) / 100,
    compliance: settings.complianceEnabled ? compliancePoints(scoreOutOf10, settings) : null
  };
}
function scoreAttempt(attempt, byId, settings) {
  let correct = 0, wrongN = 0;
  (attempt.questionIds || []).forEach((qid) => {
    const q = byId[qid];
    if (!q) return;
    const g = gradeAnswer(q, attempt.answers && attempt.answers[qid], attempt.orders && attempt.orders[qid]);
    if (g.state === "correct") correct++; else if (g.state === "wrong") wrongN++;
  });
  return summarize(correct, wrongN, (attempt.questionIds || []).length, settings);
}
// Nạp nhiều bài làm (theo dòng bảng chỉ số) từng nhóm nhỏ, vì bài làm có kèm ảnh xác nhận nên khá nặng. Giữ nguyên thứ tự, bỏ bài lỗi.
async function loadAttempts(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = await Promise.all(rows.slice(i, i + 20).map((r) => getAttempt(r.id).catch(() => null)));
    chunk.forEach((a) => { if (a && a.status === "submitted") out.push(a); });
  }
  return out;
}
// Kết quả gần nhất của cùng một thí sinh ở kỳ KHÁC (không tính thi thử), để lời khuyên so sánh tiến bộ.
function previousResult(idx, code, period, exceptId) {
  const norm = normCode(code);
  const list = (idx || []).filter((x) => x.status === "submitted" && !x.practice && x.id !== exceptId && normCode(x.code) === norm && (x.period || "") !== (period || ""));
  list.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  return list.length ? { pct: list[0].pct, period: list[0].period || "" } : null;
}
// Sửa nhiều dòng của bảng chỉ số trong MỘT lần ghi nguyên tử: patches = { <id bài làm>: { trường: giá trị, ... } }
async function patchIndex(patches) {
  await store.update(IDX_KEY, (cur) => (Array.isArray(cur) ? cur : []).map((r) => (patches[r.id] ? Object.assign({}, r, patches[r.id]) : r)));
}

// Bản sao bài làm (từng câu theo ĐÚNG thứ tự đáp án thí sinh đã thấy): lưu lúc nộp bài để xem lại ổn định
// kể cả khi ngân hàng đề sau đó bị sửa/xoá.
function buildPaper(a, byId) {
  return (a.questionIds || []).map((qid, i) => {
    const q = byId[qid]; if (!q) return null;
    const type = qType(q);
    const ans = a.answers && a.answers[qid];
    const order = (a.orders && a.orders[qid]) || (q.options || []).map((_, k) => k);
    const g = gradeAnswer(q, ans, order);
    const base = { n: i + 1, type, text: q.text, category: q.category || "", ok: g.ok, answerText: g.correctText, chosenText: g.state === "blank" ? null : g.chosenText };
    if (type === "fill") return Object.assign(base, { options: [], chosen: g.state === "blank" ? -1 : 0, correct: 0, accepted: (q.accepted || []).slice() });
    const chosenList = order.map((k, pos) => (g.chosenOrig.indexOf(k) >= 0 ? pos : -1)).filter((x) => x >= 0);
    const wantOrig = type === "multi" ? q.correctIndexes : [q.correctIndex];
    const correctList = order.map((k, pos) => (wantOrig.indexOf(k) >= 0 ? pos : -1)).filter((x) => x >= 0);
    return Object.assign(base, { options: order.map((k) => q.options[k]), chosen: chosenList.length ? chosenList[0] : -1, correct: correctList[0], chosenList, correctList });
  }).filter(Boolean);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------------------------
// Tính giờ & tiến trình do MÁY CHỦ quyết định (thí sinh tải lại trang / đổi máy vẫn làm tiếp đúng chỗ,
// không thể "xem đề rồi làm lại từ đầu" và không thể kéo dài thời gian bằng cách thoát ra vào lại).
// ---------------------------------------------------------------------------------------------
const GRACE_MS = 3000; // dung sai độ trễ mạng cho mỗi câu

function actKey(code) { return "kt/active/" + String(code || "").toLowerCase().replace(/[^a-z0-9_-]/g, "_") + ".json"; }

// Bài làm đang dở (chưa nộp) của một mã nhân viên, hoặc null.
async function getActive(code) {
  const p = await store.get(actKey(code));
  if (!p || !p.attemptId) return null;
  const a = await getAttempt(p.attemptId);
  return a && a.status === "in_progress" ? a : null;
}
async function setActive(code, attemptId) { await store.put(actKey(code), { attemptId, at: Date.now() }); }
// Đổi mã nhân viên: chuyển con trỏ bài đang làm dở sang khoá của mã mới (true nếu có chuyển)
async function moveActive(from, to) {
  const k1 = actKey(from), k2 = actKey(to);
  if (k1 === k2) return false;
  const p = await store.get(k1);
  if (!p) return false;
  await store.put(k2, p); await store.del(k1);
  return true;
}

// Xoá (các) bản ghi kết quả "đã nộp" của một mã nhân viên khỏi bảng chỉ số, để họ được làm bài lại từ đầu
// (không đụng tới bài làm cũ đã lưu riêng trong kt/attempt/<id>.json, chỉ bỏ dấu "đã nộp" đang chặn check/start).
// Cho làm lại: chỉ xoá kết quả của MỘT kỳ (period). Không truyền period = hành vi cũ (xoá mọi kỳ) - chỉ dùng khi thật sự cần.
// Bài đang làm dở chỉ bị huỷ khi nó thuộc đúng kỳ được làm lại (không đụng tới bài đang làm của kỳ khác).
async function resetByCode(code, period) {
  const norm = normCode(code);
  const byPeriod = typeof period === "string";
  let removedN = 0;
  await store.update(IDX_KEY, (cur) => {
    const list = Array.isArray(cur) ? cur : [];
    const kept = list.filter((x) => normCode(x.code) !== norm || (byPeriod && (x.period || "") !== period));
    removedN = list.length - kept.length; // gán lại mỗi lần chạy (hàm có thể được gọi lại khi có xung đột)
    return kept;
  });
  const act = await getActive(code);
  if (!byPeriod || (act && (act.period || "") === period) || !act) await setActive(code, null);
  return removedN;
}
// Bài làm dở được bắt đầu ở kỳ khác kỳ hiện tại: không cho làm tiếp sang kỳ mới (ảnh chụp chỉ là minh chứng cho kỳ đã chụp).
async function activeForPeriod(code, period) {
  const a = await getActive(code);
  if (!a) return null;
  if ((a.period || "") === period) return a;
  a.status = "expired"; a.expiredAt = Date.now(); a.expiredReason = "Sang kỳ mới " + period;
  await putAttempt(a); await setActive(code, null);
  return null;
}

// Đưa con trỏ câu hỏi về đúng hiện tại: câu nào đã quá hạn mà chưa trả lời thì tính là bỏ trống.
// Trả về true nếu bài làm bị thay đổi (cần lưu lại).
function syncAttempt(a, now) {
  const n = a.questionIds.length, S = a.secondsPerQuestion * 1000;
  let changed = false;
  if (typeof a.cursor !== "number") { // bài làm tạo trước khi có cơ chế này
    let c = 0;
    while (c < n && a.answers[a.questionIds[c]]) c++;
    a.cursor = c; a.qStartedAt = now; changed = true;
  }
  while (a.cursor < n && now > a.qStartedAt + S + GRACE_MS) {
    const qid = a.questionIds[a.cursor];
    if (!a.answers[qid]) a.answers[qid] = { answerIndex: -1, auto: true, answeredAt: a.qStartedAt + S };
    a.cursor++; a.qStartedAt += S; changed = true;
  }
  return changed;
}

// Trạng thái gửi cho thí sinh: câu hiện tại (chỉ MỘT câu mỗi lần) + thời gian còn lại, hoặc done=true.
function clientState(a, byId, now) {
  const n = a.questionIds.length, S = a.secondsPerQuestion * 1000;
  let changed = false;
  while (a.cursor < n && !byId[a.questionIds[a.cursor]]) { // câu đã bị xoá khỏi ngân hàng giữa chừng: bỏ qua
    a.answers[a.questionIds[a.cursor]] = { answerIndex: -1, auto: true, answeredAt: now };
    a.cursor++; a.qStartedAt = now; changed = true;
  }
  if (a.cursor >= n) return { state: { done: true, total: n }, changed };
  const qid = a.questionIds[a.cursor], q = byId[qid];
  const order = a.orders[qid] || (q.options || []).map((_, i) => i);
  return {
    state: {
      done: false, index: a.cursor, total: n,
      remainingMs: Math.max(0, a.qStartedAt + S - now),
      secondsPerQuestion: a.secondsPerQuestion,
      question: { id: qid, type: qType(q), text: q.text, options: order.map((i) => q.options[i]) }
    },
    changed
  };
}

// Giới hạn số lần thử sai theo IP (best-effort, trong bộ nhớ của tiến trình) để chống dò mã nhân viên + email.
const _fails = new Map();
function ipOf(req) {
  const h = (req && req.headers) || {};
  return String(h["x-forwarded-for"] || h["x-azure-clientip"] || "").split(",")[0].trim().split(":")[0] || "unknown";
}
function tooManyFails(req, max, windowMs) {
  const k = ipOf(req), now = Date.now();
  const list = (_fails.get(k) || []).filter((t) => now - t < windowMs);
  _fails.set(k, list);
  if (_fails.size > 5000) { for (const [key, v] of _fails) if (!v.length || now - v[v.length - 1] > windowMs) _fails.delete(key); }
  return list.length >= max;
}
function noteFail(req) {
  const k = ipOf(req), list = _fails.get(k) || [];
  list.push(Date.now()); _fails.set(k, list);
}

module.exports = {
  runMigrations, managerCanon, properCaseName, normCode, normEmail, normSegment, normTitle, titleOf, attemptLimit, betterResult, attemptsSummary, submittedOf, normRegion, questionRegion, needsRegion, REGION_LABEL, DEFAULT_TITLE, CATEGORY_BY_SEGMENT, bankFor, usableQ, validPeriod, ensureBankPeriods,
  getQuestions, saveQuestions,
  getCandidates, saveCandidates, getTestAccounts, saveTestAccounts, findTestAccount,
  getSettings, saveSettings,
  getAttempt, putAttempt, saveIndex, activeForPeriod,
  getExams, saveExams, getExamSettings, upsertExam, deleteExam, listExamsSummary, fmtVN,
  getBanks, saveBanks, bankOf, validBankId, slugify, cleanQuestionMeta, DEFAULT_BANK, DIFFICULTIES,
  isLeft, cleanBlueprint, buildFromBlueprint, blueprintTotal, planExam, targetCount, cleanSegmentPlans, segPlanFor, countFor, validateCounts, MAX_QUESTION_COUNT, examAccessError, inAudience, examKnown, scoreAttempt, summarize, patchIndex, previousResult, loadAttempts,
  TYPES, qType, normText, normalizeQuestionInput, gradeAnswer,
  getIndex, upsertIndex, resetByCode,
  shuffle, genId, compliancePoints,
  buildPaper, getViewers, saveViewers, findViewer, normPerson, inScope, passState, passScoreOf, verifyToken, checkVerifyToken, backupQuestions, getQuestionsBackup, countInProgress, proofCode, GRACE_MS, getActive, setActive, moveActive, syncAttempt, clientState, tooManyFails, noteFail
};

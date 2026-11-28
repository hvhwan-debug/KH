// Xác nhận điểm qua email: quản trị viên nhập bảng điểm (vd. "Điểm tuân thủ học tập PCs tháng 11/2026"), hệ thống gửi cho từng
// nhân viên MỘT email riêng (cùng khung với "Thư mời đăng ký chương trình") kèm nút "Xác nhận điểm". Nhân viên bấm nút -> trang
// /kiemtra/xacnhan-diem.html hiện đúng điểm của họ -> bấm xác nhận (hoặc báo thắc mắc) là hệ thống ghi nhận.
// - Danh sách đợt: kt/scoreconfirm/index.json        { list: [{ id, title, rows, createdAt, by }] }
// - Từng đợt:      kt/scoreconfirm/<id>.json          { id, title, cols, rows:[{code,name,manager,vals}], sent:{}, confirmed:{}, disputes:{} ... }
// - Liên kết trong email mang mã ký (HMAC) gồm mã đợt + mã NV, không cần đăng nhập. GET chỉ ĐỌC; xác nhận là POST có header riêng
//   nên bộ quét link của hộp thư không thể xác nhận nhầm.
// - Gửi: xem trước -> xác nhận (kèm đúng số người đã xem) -> gửi theo đợt BATCH thư/lượt (giống luồng thư mời đăng ký).
const crypto = require("crypto");
const store = require("./store");
const session = require("./session");
const quiz = require("./quiz");
const mail = require("./mail");
const { cfg, mailConfigured } = require("./config");

const LIST = "kt/scoreconfirm/index.json";
const docKey = (id) => "kt/scoreconfirm/" + id + ".json";
const TOKEN_AGE = 120 * 24 * 3600 * 1000;
const BATCH = 25, MAX_ROWS = 3000, MAX_COLS = 8;
const ORG_DEFAULT = "Đào tạo kinh doanh";
const up = (s) => String(s || "").trim().toUpperCase();
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const err = (error, code) => ({ ok: false, error, code });

// ---------- lưu trữ ----------
async function list() { const d = (await store.get(LIST)) || {}; return Array.isArray(d.list) ? d.list : []; }
async function get(id) { id = String(id || ""); if (!/^[a-z0-9]{6,40}$/.test(id)) return null; const d = await store.get(docKey(id)); return d && !d.deleted && d.id === id ? d : null; }

// b: { title, org, cols:[nhãn cột điểm], rows:[{code,name,manager,vals:[...]}], deadline(ms), contact, phone, email, note }
// Cột điểm CUỐI CÙNG là điểm kết luận (hiện nổi bật trong email).
async function create(b, by) {
  const title = clip(b.title, 150); if (!title) return err("Vui lòng nhập tiêu đề bảng điểm.", "no_title");
  const cols = (Array.isArray(b.cols) ? b.cols : []).map((c) => clip(c, 60)).filter(Boolean).slice(0, MAX_COLS);
  if (cols.length < 1) return err("Chưa có cột điểm nào.", "no_cols");
  const seen = {}, rows = [], dup = [];
  (Array.isArray(b.rows) ? b.rows : []).slice(0, MAX_ROWS).forEach((r) => {
    const code = up(clip(r && r.code, 40)); if (!code) return;
    if (seen[code]) { dup.push(code); return; } seen[code] = 1;
    const vals = cols.map((_, i) => clip(r.vals && r.vals[i], 30));
    rows.push({ code, name: clip(r.name, 80), manager: clip(r.manager, 80), vals });
  });
  if (!rows.length) return err("Không đọc được dòng dữ liệu nào (cần có cột Mã nhân viên).", "no_rows");
  const n = Math.round(Number(b.deadline));
  const id = Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  const doc = {
    id, title, org: clip(b.org, 120) || ORG_DEFAULT, cols, rows, deadline: isFinite(n) && n > 1e12 ? n : 0,
    contact: clip(b.contact, 150), phone: clip(b.phone, 40), email: clip(b.email, 120), note: clip(b.note, 600),
    createdAt: Date.now(), by: clip(by, 120), sent: {}, confirmed: {}, disputes: {}
  };
  await store.put(docKey(id), doc);
  await store.update(LIST, (cur) => { const c = cur && Array.isArray(cur.list) ? cur : { list: [] }; c.list.unshift({ id, title, rows: rows.length, createdAt: doc.createdAt, by: doc.by }); c.list = c.list.slice(0, 200); return c; });
  return { ok: true, id, rows: rows.length, duplicates: dup };
}
// Tạo đợt TRỰC TIẾP từ kết quả trong hệ thống (không cần dán/ghép bảng bằng tay).
// b: { title, exams:[{id,label}] (1-4 đề), avg (có cột Điểm trung bình khi >= 2 đề, mặc định bật), onlyTaken (bỏ người chưa làm đề nào),
//      deadline, contact, phone, email, dry }
// - Mỗi đề = một cột điểm (% đúng, làm tròn) lấy từ lần làm CAO NHẤT trong bài chính thức (bỏ thi thử / bài đã ẩn / tài khoản thử nghiệm). Chưa làm = 0.
// - Người tham gia = người thuộc đối tượng của ÍT NHẤT một đề (chưa nghỉ việc) + người đã có bài ở các đề đó.
// - Một đề: Điểm tuân thủ = điểm đã ghi lúc nộp bài (giống bản xuất rút gọn). Nhiều đề: Điểm trung bình = trung bình các đề (chưa làm tính 0),
//   Điểm tuân thủ = quy đổi từ điểm trung bình theo đúng mốc của hệ thống (>= 9: 20, >= 7: 15, >= 6: 10, còn lại 0).
const vnNum = (n, d) => Number(n).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
async function fromResults(b, by) {
  const picks = (Array.isArray(b.exams) ? b.exams : []).map((e) => ({ id: String(e && e.id != null ? e.id : "").slice(0, 80), label: clip(e && e.label, 60) }))
    .filter((e) => e.id).filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i).slice(0, 4);
  if (!picks.length) return err("Chọn ít nhất một đề thi.", "no_exam");
  const title = clip(b.title, 150); if (!title) return err("Vui lòng nhập tiêu đề bảng điểm.", "no_title");
  const [cands, idxAll, exams] = await Promise.all([quiz.getCandidates(), quiz.getIndex(), quiz.getExams()]);
  const sets = await Promise.all(picks.map((p) => quiz.getExamSettings(p.id)));
  const titleOf = (id) => { const e = exams.find((x) => x.id === id); return String((e && (e.examTitle || e.title)) || id); };
  picks.forEach((p) => { if (!p.label) p.label = clip(titleOf(p.id), 60); });
  const best = picks.map(() => ({}));
  idxAll.filter((a) => a.status === "submitted" && !a.practice).forEach((a) => {
    const i = picks.findIndex((p) => p.id === (a.period || "")); if (i < 0) return;
    const k = quiz.normCode(a.code); if (quiz.betterResult(a, best[i][k])) best[i][k] = a;
  });
  const byCode = {}; cands.forEach((c) => { byCode[quiz.normCode(c.code)] = c; });
  const who = {};
  cands.forEach((c) => { if (!quiz.isLeft(c) && sets.some((st) => quiz.inAudience(st, c))) who[quiz.normCode(c.code)] = c; });
  best.forEach((m) => Object.keys(m).forEach((k) => { const c = byCode[k]; if (c && !quiz.isLeft(c)) who[k] = c; }));
  const multi = picks.length >= 2, withAvg = multi && b.avg !== false;
  const pctOf = (a) => a ? Math.round(a.pct != null ? a.pct : (a.total ? a.score / a.total * 100 : 0)) : 0;
  const rows = [], missing = picks.map(() => 0);
  Object.keys(who).forEach((k) => {
    const c = who[k], att = picks.map((p, i) => best[i][k] || null), pcts = att.map(pctOf);
    att.forEach((a, i) => { if (!a) missing[i]++; });
    if (b.onlyTaken && !att.some(Boolean)) return;
    const mean = pcts.reduce((x, y) => x + y, 0) / pcts.length;
    let cp;
    if (!multi) cp = att[0] ? (att[0].compliancePoints != null ? att[0].compliancePoints : quiz.compliancePoints(pcts[0] / 10, sets[0])) : 0;
    else cp = quiz.compliancePoints(mean / 10, sets[0]);
    rows.push({ code: c.code, name: c.name || "", manager: c.manager || "", vals: pcts.map(String).concat(withAvg ? [vnNum(mean, 1)] : [], [String(cp)]) });
  });
  rows.sort((x, y) => String(x.manager || "~").localeCompare(String(y.manager || "~"), "vi") || String(x.name).localeCompare(String(y.name), "vi"));
  const cols = picks.map((p) => p.label).concat(withAvg ? ["Điểm trung bình"] : [], ["Điểm tuân thủ"]);
  if (!rows.length) return err("Không có nhân viên nào thuộc các đề đã chọn" + (b.onlyTaken ? " đã làm bài" : "") + ".", "no_rows");
  if (b.dry) return { ok: true, dry: true, count: rows.length, cols, sample: rows.slice(0, 5), notTaken: picks.map((p, i) => ({ label: p.label, n: b.onlyTaken ? 0 : missing[i] })), exams: picks.map((p, i) => ({ label: p.label, took: Object.keys(best[i]).length })) };
  return create({ title, cols, rows, deadline: b.deadline, contact: b.contact, phone: b.phone, email: b.email, note: b.note }, by);
}
async function remove(id) {
  const d = await get(id); if (!d) return false;
  await store.put(docKey(id), { deleted: true, id: d.id, at: Date.now() });
  await store.update(LIST, (cur) => { const c = cur && Array.isArray(cur.list) ? cur : { list: [] }; c.list = c.list.filter((x) => x.id !== id); return c; });
  return true;
}

// ---------- mã ký trong liên kết ----------
function token(id, code) { return session.sign({ k: "sc", b: id, c: up(code), exp: Date.now() + TOKEN_AGE }); }
function readToken(t) {
  const p = session.verify(String(t || "").slice(0, 600));
  return p && p.k === "sc" && p.b && p.c && p.exp > Date.now() ? { id: String(p.b), code: up(p.c) } : null;
}
function linkUrl(id, code) { return (cfg().appUrl || "") + "/kiemtra/xacnhan-diem.html?t=" + encodeURIComponent(token(id, code)); }

// ---------- người nhận ----------
function stateOf(d, code) {
  const k = up(code), c = d.confirmed && d.confirmed[k], x = d.disputes && d.disputes[k], rs = x && x.resolved;
  if (c && (!x || c.at >= x.at || (rs && rs.outcome === "keep"))) return "confirmed";   // xử lý "giữ nguyên": xác nhận trước đó vẫn còn giá trị
  if (x && !rs) return "disputed";                                                      // thắc mắc chưa xử lý
  return "pending";                                                                     // đã xử lý (điều chỉnh điểm): chờ nhân viên xác nhận lại
}
async function recipients(d) {
  const cands = await quiz.getCandidates(), by = {};
  cands.forEach((c) => { by[up(c.code)] = c; });
  return d.rows.map((r) => {
    const c = by[r.code] || null;
    return { row: r, code: r.code, name: r.name || (c && c.name) || "", email: (c && c.email) || "", found: !!c, left: !!(c && quiz.isLeft(c)) };
  });
}
function statsOf(d, rc) {
  const withEmail = rc.filter((x) => x.email), noEmail = rc.filter((x) => !x.email);
  const sentOk = (x) => !!(d.sent && d.sent[x.code]);
  return {
    total: rc.length, withEmail: withEmail.length, noEmail: noEmail.length, notFound: rc.filter((x) => !x.found).length,
    alreadySent: withEmail.filter(sentOk).length, pending: withEmail.filter((x) => !sentOk(x)).length,
    confirmed: rc.filter((x) => stateOf(d, x.code) === "confirmed").length, disputed: rc.filter((x) => stateOf(d, x.code) === "disputed" && !((d.disputes[x.code] || {}).resolved)).length,
    missing: noEmail.slice(0, 30).map((x) => ({ code: x.code, name: x.name, why: x.found ? "chưa có email" : "không có trong danh sách nhân sự" }))
  };
}

// ---------- email ----------
const vnTime = (ms) => { const d = new Date(ms + 7 * 3600e3), p = (n) => String(n).padStart(2, "0"); return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " ngày " + p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear(); };
// Dựng email cho MỘT nhân viên. Khung, màu và nút theo đúng "Thư mời đăng ký chương trình" (programs.inviteMail).
async function mailFor(d, row, email, fullName) {
  const nm = String(fullName || row.name || "").trim(), url = linkUrl(d.id, row.code), org = d.org || ORG_DEFAULT;
  // Xưng hô: chỉ gọi "Anh"/"Chị" khi tên đủ căn cứ (hệ thống không lưu giới tính); không chắc thì gọi "bạn", không dùng "Anh/Chị".
  const h0 = require("./honorific").honorific(nm, true, true), known = h0 === "Anh" || h0 === "Chị", given = nm.split(/\s+/).pop() || "";
  const np = { call: known && given ? h0 + " " + given : "bạn" };
  const C = { navy: "#0B2A6B", brand: "#1559C4", ink: "#1C2B4A", body: "#33425E", muted: "#6B7A96", line: "#E1E8F3", tile: "#F1F6FD" };
  const FF = "'Be Vietnam Pro',Segoe UI,Arial,Helvetica,sans-serif";
  let hero = null; const atts = [];
  try { hero = await require("./inviteart").hero({ title: d.title, label: "XÁC NHẬN ĐIỂM", tagline: "Kiểm tra điểm và xác nhận chỉ với một lần bấm", script: ["Cùng nhau", "tiến bộ", "mỗi ngày"] }); } catch (e) { hero = null; }
  if (hero) atts.push({ filename: "xac-nhan-diem.jpg", content: hero, contentType: "image/jpeg", cid: "sc-hero" });
  const fm = { h: known ? h0 : "bạn", hc: known ? h0 : "Bạn", to: nm ? (known ? h0 + " " + nm : nm) : "bạn" };   // hc = đứng đầu câu
  const last = d.cols.length - 1, finalLabel = d.cols[last], finalVal = row.vals[last];
  const body = d.cols.slice(0, last).map((c, i) => [c, row.vals[i]]);
  const cell = (k, v, strong) => '<tr><td style="padding:11px 16px;border-top:1px solid ' + C.line + ';font-size:15px;color:' + C.body + '">' + esc(k) + '</td><td align="right" style="padding:11px 16px;border-top:1px solid ' + C.line + ';font-size:16px;font-weight:800;color:' + C.navy + (strong ? ';font-size:18px' : '') + '">' + esc(v === "" ? "—" : v) + '</td></tr>';
  const info = [["Mã nhân viên", row.code], row.manager ? ["Quản lí", row.manager] : null].filter(Boolean);
  const scoreCard = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.tile + ';border-radius:16px;border-collapse:separate;overflow:hidden">' +
    '<tr><td colspan="2" style="padding:16px 16px 12px"><div style="font-size:16px;line-height:1.5;color:' + C.body + '">Kết quả của ' + esc(fm.h) + ': <b style="color:' + C.navy + '">' + esc((nm || row.code).toLocaleUpperCase("vi-VN")) + '</b></div>' +
    '<div style="margin-top:4px;font-size:15px;line-height:1.5;color:' + C.ink + '">' + info.map((x) => esc(x[0]) + ': <b style="color:' + C.navy + '">' + esc(x[1]) + '</b>').join(' &nbsp;·&nbsp; ') + '</div></td></tr>' +
    body.map((x) => cell(x[0], x[1])).join("") +
    '<tr><td style="padding:16px;border-top:2px solid #C9D9F2;font-size:16px;font-weight:800;color:' + C.navy + '">' + esc(finalLabel) + '</td><td align="right" style="padding:16px;border-top:2px solid #C9D9F2"><span style="display:inline-block;min-width:56px;text-align:center;background:' + C.brand + ';color:#ffffff;font-size:24px;font-weight:800;line-height:1;padding:10px 16px;border-radius:12px">' + esc(finalVal === "" ? "—" : finalVal) + '</span></td></tr></table>';
  const deadlineHtml = d.deadline ? '<div style="margin-top:14px;font-size:15px;color:' + C.body + '">Vui lòng xác nhận <b style="color:' + C.navy + '">trước ' + esc(vnTime(d.deadline)) + '</b><div style="margin-top:6px;font-size:14px;line-height:1.55;color:' + C.body + '">Sau thời gian này, nếu ' + esc(fm.h) + ' không phản hồi, sẽ được hiểu là ' + esc(fm.h) + ' <b style="color:' + C.navy + '">đồng ý với kết quả này</b>.</div></div>' : "";
  const intro = esc(org) + " gửi " + esc(np.call) + " kết quả <b style=\"color:" + C.navy + "\">" + esc(d.title) + "</b>. " + esc(fm.hc) + " vui lòng kiểm tra các số liệu dưới đây và bấm nút xác nhận nếu thông tin đã đúng." + (d.note ? "<br>" + esc(d.note) : "");
  const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<style>@media only screen and (max-width:560px){.pad{padding-left:20px!important;padding-right:20px!important}.cta a{padding:17px 26px!important;font-size:16px!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:#EEF3FA">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(org) + " gửi " + esc(np.call) + ' kết quả "' + esc(d.title) + '". Bấm một nút để xác nhận điểm.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FA"><tr><td align="center" style="padding:24px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;border-collapse:separate;overflow:hidden;font-family:' + FF + ';color:' + C.body + '">' +
    '<tr><td style="padding:0;background:#EAF2FD">' + (hero ? '<img src="cid:sc-hero" width="640" alt="Xác nhận điểm: ' + esc(d.title) + '" style="display:block;width:100%;max-width:640px;height:auto;border:0">'
      : '<div style="padding:34px 32px"><div style="display:inline-block;background:#DCE8FB;color:' + C.brand + ';font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">XÁC NHẬN ĐIỂM</div><div style="margin-top:14px;font-size:28px;font-weight:800;color:' + C.navy + ';line-height:1.25">' + esc(d.title) + '</div></div>') + '</td></tr>' +
    '<tr><td class="pad" style="padding:30px 36px 6px;font-size:16px;line-height:1.65;color:' + C.ink + '"><b><i>Chào ' + esc(np.call) + ',</i></b><br>' + intro + '</td></tr>' +
    '<tr><td class="pad" style="padding:18px 36px 0">' + scoreCard + '</td></tr>' +
    '<tr><td align="center" style="padding:26px 20px 6px"><table role="presentation" cellpadding="0" cellspacing="0" class="cta"><tr><td align="center" bgcolor="' + C.brand + '" style="border-radius:40px;background:' + C.brand + ';background:linear-gradient(180deg,#1E6AD8,#1152B8)">' +
    '<a href="' + esc(url) + '" target="_blank" style="display:inline-block;padding:20px 54px;font-family:' + FF + ';font-size:18px;font-weight:800;letter-spacing:.02em;color:#ffffff;text-decoration:none;border-radius:40px">XÁC NHẬN ĐIỂM CỦA TÔI &nbsp;&rarr;</a></td></tr></table>' + deadlineHtml + '</td></tr>' +
    '<tr><td class="pad" style="padding:24px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.tile + ';border-radius:16px"><tr><td style="padding:18px 20px;font-size:14px;line-height:1.65;color:' + C.ink + '">' +
    '<b style="color:' + C.navy + '">Thông tin chưa chính xác?</b><br>' + esc(fm.hc) + ' vui lòng nhấn nút <b>“Tôi có thắc mắc”</b> và mô tả cụ thể nội dung cần kiểm tra. ' + esc(org) + ' sẽ tiếp nhận, rà soát thông tin và phản hồi ' + esc(fm.h) + ' trong thời gian sớm nhất.</td></tr></table></td></tr>' +
    '<tr><td class="pad" style="padding:22px 36px 8px;font-size:15px;line-height:1.6;color:' + C.ink + '">Trân trọng,<br><b style="color:' + C.navy + '">' + esc(org) + '</b></td></tr>' +
    '<tr><td class="pad" style="padding:14px 36px 26px"><div style="border-top:1px solid ' + C.line + ';padding-top:14px;font-size:12px;line-height:1.7;color:#7C8AA5">' +
    'Thư này được gửi riêng đến ' + esc(fm.to) + ' (Mã nhân viên: ' + esc(row.code) + '). Vui lòng không chuyển tiếp email này cho người khác.<br>' +
    'Trong trường hợp không thể nhấn nút xác nhận, ' + esc(fm.h) + ' vui lòng truy cập đường dẫn dưới đây:<br>' +
    '<a href="' + esc(url) + '" target="_blank" style="color:' + C.brand + ';font-weight:700;text-decoration:underline">Liên kết xác nhận điểm</a></div></td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = "Chào " + np.call + ",\n" + org + " gửi " + np.call + " kết quả " + d.title + ". " + fm.hc + " vui lòng kiểm tra các số liệu dưới đây và xác nhận nếu thông tin đã đúng.\n" + (d.note ? d.note + "\n" : "") + "\n" +
    "Kết quả của " + fm.h + ": " + (nm || row.code).toLocaleUpperCase("vi-VN") + "\nMã nhân viên: " + row.code + (row.manager ? "\nQuản lí: " + row.manager : "") + "\n" + body.map((x) => x[0] + ": " + (x[1] || "—")).join("\n") + "\n" + finalLabel + ": " + (finalVal || "—") +
    (d.deadline ? "\n\nVui lòng xác nhận trước " + vnTime(d.deadline) + ".\nSau thời gian này, nếu " + fm.h + " không phản hồi, sẽ được hiểu là " + fm.h + " đồng ý với kết quả này." : "") + "\n\nXÁC NHẬN ĐIỂM (chỉ 1 lần bấm):\n" + url +
    "\n\nThông tin chưa chính xác? " + fm.hc + " vui lòng mở liên kết trên, nhấn nút “Tôi có thắc mắc” và mô tả cụ thể nội dung cần kiểm tra. " + org + " sẽ tiếp nhận, rà soát thông tin và phản hồi " + fm.h + " trong thời gian sớm nhất." +
    "\n\nTrân trọng,\n" + org +
    "\n\n---\nThư này được gửi riêng đến " + fm.to + " (Mã nhân viên: " + row.code + "). Vui lòng không chuyển tiếp email này cho người khác.";
  const subject = "Xác nhận điểm dành cho " + np.call + ": " + d.title;
  let previewHtml = html; atts.forEach((a) => { previewHtml = previewHtml.split("cid:" + a.cid).join("data:" + a.contentType + ";base64," + a.content.toString("base64")); });
  return { subject, html, text, attachments: atts.length ? atts : undefined, previewHtml, to: email || "" };
}

// ---------- quản trị: xem trước / gửi / theo dõi ----------
async function preview(id, code) {
  const d = await get(id); if (!d) return err("Không tìm thấy đợt này.", "not_found");
  const rc = await recipients(d), stats = statsOf(d, rc);
  const pick = (code && rc.find((x) => x.code === up(code))) || rc.find((x) => x.email) || rc[0];
  const m = await mailFor(d, pick.row, pick.email, pick.name);
  return { ok: true, stats, cols: d.cols, createdAt: d.createdAt, subject: m.subject, html: m.previewHtml, to: pick.email || "(chưa có email)", sample: { code: pick.code, name: pick.name }, people: rc.slice(0, 400).map((x) => ({ code: x.code, name: x.name })) };
}
async function send(id, opt) {
  opt = opt || {};
  const d = await get(id); if (!d) return err("Không tìm thấy đợt này.", "not_found");
  if (!mailConfigured()) return err("Máy chủ chưa cấu hình gửi email (SMTP).", "no_smtp");
  const rc = await recipients(d);
  const since = Number(opt.since) > 0 ? Number(opt.since) : Date.now();   // mốc bắt đầu một lượt gửi nhiều đợt (gửi lại: bỏ người đã nhận lại sau mốc này)
  const todo = rc.filter((x) => x.email && (opt.resend ? stateOf(d, x.code) !== "confirmed" && !(d.sent && d.sent[x.code] && d.sent[x.code].at >= since) : !(d.sent && d.sent[x.code])));
  if (Number(opt.expect) !== todo.length) return err("Số người nhận đã thay đổi (" + todo.length + " thay vì " + Number(opt.expect) + "). Hãy xem trước lại rồi xác nhận.", "stale_preview");
  const batch = todo.slice(0, BATCH), sent = [], failed = [];
  for (const x of batch) {
    try {
      const m = await mailFor(d, x.row, x.email, x.name);
      const ok = await mail.send({ fromName: mail.KT_NAME, to: x.email, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments });
      if (ok) sent.push(x); else failed.push({ code: x.code, reason: "Máy chủ chưa gửi được email" });
    } catch (e) { failed.push({ code: x.code, reason: "Gửi thất bại" }); }
  }
  if (sent.length) await store.update(docKey(id), (cur) => {
    const c = cur && !cur.deleted ? cur : d; c.sent = c.sent || {};
    sent.forEach((x) => { const o = c.sent[x.code] || { n: 0 }; c.sent[x.code] = { at: Date.now(), email: x.email, n: (o.n || 0) + 1, first: o.first || Date.now() }; });
    return c;
  });
  const left = Math.max(0, todo.length - sent.length);
  return { ok: true, sent: sent.length, failed, remaining: left, since, batch: BATCH, stats: statsOf(await get(id), rc) };
}
async function status(id) {
  const d = await get(id); if (!d) return err("Không tìm thấy đợt này.", "not_found");
  const rc = await recipients(d);
  return {
    ok: true, id: d.id, title: d.title, cols: d.cols, deadline: d.deadline, createdAt: d.createdAt, by: d.by, stats: statsOf(d, rc),
    rows: rc.map((x) => ({
      code: x.code, name: x.name, manager: x.row.manager, email: x.email, vals: x.row.vals, state: stateOf(d, x.code),
      sentAt: (d.sent[x.code] || {}).at || 0, sentN: (d.sent[x.code] || {}).n || 0,
      confirmedAt: (d.confirmed[x.code] || {}).at || 0, dispute: d.disputes[x.code] ? { at: d.disputes[x.code].at, text: d.disputes[x.code].text, resolved: !!d.disputes[x.code].resolved, outcome: (d.disputes[x.code].resolved || {}).outcome || "", reply: (d.disputes[x.code].resolved || {}).reply || "", emailed: !!((d.disputes[x.code].resolved || {}).emailed && d.disputes[x.code].resolved.emailed.ok) } : null
    }))
  };
}

// ---------- lịch sử điểm của MỘT nhân viên (hiện trong hồ sơ học tập) ----------
// Mỗi đợt xác nhận = một kỳ điểm (thường là một tháng). Trả về theo thứ tự cũ -> mới. Tháng lấy từ tiêu đề ("... THÁNG 11/2026"), không có thì theo ngày tạo đợt.
function periodOf(title, createdAt) {
  const m = /TH[ÁA]NG\s*(\d{1,2})\s*\/\s*(\d{4})/i.exec(String(title || "").normalize("NFC"));
  if (m && +m[1] >= 1 && +m[1] <= 12) return { label: "Tháng " + (+m[1]) + "/" + m[2], key: +m[2] * 100 + +m[1] };
  const v = new Date((createdAt || Date.now()) + 7 * 3600e3), mo = v.getUTCMonth() + 1, y = v.getUTCFullYear();
  return { label: "Tháng " + mo + "/" + y, key: y * 100 + mo };
}
async function historyOf(code) {
  const k = up(code), out = [];
  if (!k) return out;
  const docs = await Promise.all((await list()).slice(0, 36).map((x) => get(x.id).catch(() => null)));
  docs.forEach((d) => {
    if (!d) return;
    const r = d.rows.find((x) => x.code === k); if (!r) return;
    const last = d.cols.length - 1, st = stateOf(d, k), sent = (d.sent && d.sent[k]) || null, c = (d.confirmed && d.confirmed[k]) || null, x = (d.disputes && d.disputes[k]) || null, per = periodOf(d.title, d.createdAt);
    out.push({
      id: d.id, title: d.title, period: per.label, key: per.key, createdAt: d.createdAt, deadline: d.deadline || 0,
      cols: d.cols, vals: r.vals, finalLabel: d.cols[last], final: r.vals[last],
      state: st === "pending" && sent ? "sent" : st, sentAt: sent ? sent.at : 0, confirmedAt: c ? c.at : 0, dispute: x ? { at: x.at, text: x.text, resolved: !!x.resolved, outcome: (x.resolved || {}).outcome || "" } : null
    });
  });
  out.sort((a, b) => a.key - b.key || a.createdAt - b.createdAt);
  return out;
}

// ---------- thông báo cho quản trị viên: việc nhân viên gửi lên ----------
// - Thắc mắc điểm CHƯA xử lý (cần xử lý, hiện cho tới khi bấm "Đã xử lý" hoặc nhân viên xác nhận lại).
// - Số nhân viên mới xác nhận điểm trong 7 ngày (chỉ để biết, không cần xử lý). Chỉ xét 12 đợt gần nhất.
async function notifications() {
  const out = [], week = Date.now() - 7 * 864e5;
  const docs = await Promise.all((await list()).slice(0, 12).map((x) => get(x.id).catch(() => null)));
  docs.forEach((d) => {
    if (!d) return;
    const by = {}; d.rows.forEach((r) => { by[r.code] = r; });
    Object.keys(d.disputes || {}).forEach((k) => {
      const x = d.disputes[k]; if (!x || x.resolved || stateOf(d, k) !== "disputed") return;
      const r = by[k] || {};
      out.push({ kind: "dispute", act: true, id: "dsp:" + d.id + ":" + k, at: x.at, title: (r.name || k) + " (" + k + ") có thắc mắc về điểm", detail: x.text, sub: d.title, batchId: d.id, code: k });
    });
    let n = 0, last = 0;
    Object.keys(d.confirmed || {}).forEach((k) => { const c = d.confirmed[k]; if (c && stateOf(d, k) === "confirmed" && c.at >= week) { n++; if (c.at > last) last = c.at; } });
    if (n) out.push({ kind: "confirm", act: false, id: "cfm:" + d.id, at: last, title: n + " nhân viên đã xác nhận điểm", sub: d.title, batchId: d.id, n });
  });
  return out;
}
async function resolveDispute(id, code, by) {
  const d = await get(id); if (!d) return err("Không tìm thấy đợt này.", "not_found");
  const k = up(code); let ok = false;
  await store.update(docKey(id), (cur) => {
    const c = cur && !cur.deleted ? cur : d, x = c.disputes && c.disputes[k];
    if (x && !x.resolved) { x.resolved = { at: Date.now(), by: clip(by, 120) }; ok = true; }
    return c;
  });
  return ok ? { ok: true } : err("Không có thắc mắc nào đang chờ xử lý của người này.", "none");
}

// ---------- xử lý thắc mắc + email thông báo kết quả cho nhân viên ----------
function whoOf(nm) {   // cùng quy tắc xưng hô với email xác nhận điểm: Anh / Chị khi đủ chắc, còn lại "bạn"
  const h0 = require("./honorific").honorific(nm, true, true), known = h0 === "Anh" || h0 === "Chị", given = String(nm || "").split(/\s+/).pop() || "";
  return { known, H: known ? h0 : "bạn", Hc: known ? h0 : "Bạn", call: known && given ? h0 + " " + given : "bạn", to: nm ? (known ? h0 + " " + nm : nm) : "bạn" };
}
// res: { outcome: "keep" | "adjust", reply, before (mảng điểm cũ, khi adjust), after (mảng điểm hiện tại) }; needConfirm: còn phải bấm xác nhận
async function resultMail(d, row, email, fullName, x, res, needConfirm) {
  const nm = String(fullName || row.name || "").trim(), W = whoOf(nm), org = d.org || ORG_DEFAULT, url = linkUrl(d.id, row.code);
  const C = { navy: "#0B2A6B", brand: "#1559C4", ink: "#1C2B4A", body: "#33425E", muted: "#6B7A96", line: "#E1E8F3", tile: "#F1F6FD" };
  const FF = "'Be Vietnam Pro',Segoe UI,Arial,Helvetica,sans-serif";
  const adjust = res.outcome === "adjust", last = d.cols.length - 1;
  let hero = null; const atts = [];
  try { hero = await require("./inviteart").hero({ title: d.title, label: "KẾT QUẢ XỬ LÝ", tagline: "Phản hồi thắc mắc về điểm của " + W.H, script: ["Cảm ơn bạn", "đã phản hồi"] }); } catch (e) { hero = null; }
  if (hero) atts.push({ filename: "ket-qua-xu-ly.jpg", content: hero, contentType: "image/jpeg", cid: "sc-hero" });
  const br = (t) => esc(t).replace(/\r?\n/g, "<br>");
  const badge = adjust ? '<span style="display:inline-block;background:#E3F5EA;color:#17794A;font-size:13px;font-weight:800;letter-spacing:.04em;padding:6px 14px;border-radius:99px">ĐÃ ĐIỀU CHỈNH ĐIỂM</span>'
    : '<span style="display:inline-block;background:#E4EEFC;color:' + C.brand + ';font-size:13px;font-weight:800;letter-spacing:.04em;padding:6px 14px;border-radius:99px">GIỮ NGUYÊN KẾT QUẢ</span>';
  const val = (v) => esc(v === "" || v == null ? "—" : v);
  const cell = (i) => {
    const o = adjust && res.before ? res.before[i] : null, n = res.after[i], ch = adjust && res.before && o !== n;
    return '<tr><td style="padding:11px 16px;border-top:1px solid ' + C.line + ';font-size:15px;color:' + C.body + '">' + esc(d.cols[i]) + '</td><td align="right" style="padding:11px 16px;border-top:1px solid ' + C.line + ';font-size:16px;font-weight:800;color:' + (ch ? "#17794A" : C.navy) + '">' +
      (ch ? '<span style="text-decoration:line-through;color:#8A97AE;font-weight:500;font-size:14px;margin-right:10px">' + val(o) + '</span>' : "") + val(n) + "</td></tr>";
  };
  const fo = adjust && res.before ? res.before[last] : null, fn = res.after[last], fch = adjust && res.before && fo !== fn;
  const card = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.tile + ';border-radius:16px;border-collapse:separate;overflow:hidden">' +
    '<tr><td colspan="2" style="padding:16px 16px 12px"><div style="font-size:15px;line-height:1.5;color:' + C.body + '">' + (adjust ? "Điểm sau khi điều chỉnh" : "Kết quả hiện tại") + ' của ' + esc(W.H) + ': <b style="color:' + C.navy + '">' + esc((nm || row.code).toLocaleUpperCase("vi-VN")) + '</b></div></td></tr>' +
    d.cols.slice(0, last).map((c, i) => cell(i)).join("") +
    '<tr><td style="padding:16px;border-top:2px solid #C9D9F2;font-size:16px;font-weight:800;color:' + C.navy + '">' + esc(d.cols[last]) + '</td><td align="right" style="padding:16px;border-top:2px solid #C9D9F2">' +
    (fch ? '<span style="text-decoration:line-through;color:#8A97AE;font-size:16px;margin-right:12px">' + val(fo) + '</span>' : "") +
    '<span style="display:inline-block;min-width:56px;text-align:center;background:' + (fch ? "#17794A" : C.brand) + ';color:#ffffff;font-size:24px;font-weight:800;line-height:1;padding:10px 16px;border-radius:12px">' + val(fn) + "</span></td></tr></table>";
  const dueLine = needConfirm && d.deadline && d.deadline > Date.now() ? '<div style="margin-top:12px;font-size:15px;color:' + C.body + '">Vui lòng xác nhận <b style="color:' + C.navy + '">trước ' + esc(vnTime(d.deadline)) + "</b></div>" : "";
  const cta = needConfirm
    ? '<tr><td align="center" style="padding:26px 20px 6px"><table role="presentation" cellpadding="0" cellspacing="0" class="cta"><tr><td align="center" bgcolor="' + C.brand + '" style="border-radius:40px;background:' + C.brand + ';background:linear-gradient(180deg,#1E6AD8,#1152B8)">' +
      '<a href="' + esc(url) + '" target="_blank" style="display:inline-block;padding:20px 54px;font-family:' + FF + ';font-size:18px;font-weight:800;letter-spacing:.02em;color:#ffffff;text-decoration:none;border-radius:40px">' + (adjust ? "XÁC NHẬN ĐIỂM MỚI" : "XÁC NHẬN ĐIỂM") + ' &nbsp;&rarr;</a></td></tr></table>' + dueLine + "</td></tr>"
    : '<tr><td class="pad" style="padding:18px 36px 0"><div style="font-size:14px;line-height:1.6;color:' + C.body + '">Điểm của ' + esc(W.H) + ' đã được xác nhận trước đó và <b style="color:' + C.navy + '">không thay đổi</b>, ' + esc(W.H) + ' không cần làm thêm gì.</div></td></tr>';
  const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<style>@media only screen and (max-width:560px){.pad{padding-left:20px!important;padding-right:20px!important}.cta a{padding:17px 26px!important;font-size:16px!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:#EEF3FA"><div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(org) + " đã xử lý thắc mắc về điểm của " + esc(W.H) + ": " + (adjust ? "điểm đã được điều chỉnh" : "giữ nguyên kết quả") + '.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FA"><tr><td align="center" style="padding:24px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;border-collapse:separate;overflow:hidden;font-family:' + FF + ';color:' + C.body + '">' +
    '<tr><td style="padding:0;background:#EAF2FD">' + (hero ? '<img src="cid:sc-hero" width="640" alt="Kết quả xử lý thắc mắc: ' + esc(d.title) + '" style="display:block;width:100%;max-width:640px;height:auto;border:0">'
      : '<div style="padding:34px 32px"><div style="display:inline-block;background:#DCE8FB;color:' + C.brand + ';font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">KẾT QUẢ XỬ LÝ</div><div style="margin-top:14px;font-size:28px;font-weight:800;color:' + C.navy + ';line-height:1.25">' + esc(d.title) + "</div></div>") + "</td></tr>" +
    '<tr><td class="pad" style="padding:30px 36px 6px;font-size:16px;line-height:1.65;color:' + C.ink + '"><b><i>Chào ' + esc(W.call) + ',</i></b><br>' + esc(org) + " đã tiếp nhận và xử lý thắc mắc của " + esc(W.H) + ' về <b style="color:' + C.navy + '">' + esc(d.title) + "</b>.</td></tr>" +
    '<tr><td class="pad" style="padding:14px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #C9D9F2"><tr><td style="padding:4px 0 4px 14px;font-size:14px;line-height:1.6;color:' + C.body + '">' +
      '<div style="font-size:12px;letter-spacing:.06em;color:' + C.muted + ';text-transform:uppercase">Thắc mắc của ' + esc(W.H) + (x && x.at ? " · " + esc(vnTime(x.at)) : "") + '</div><div style="margin-top:4px;font-style:italic">' + br(x && x.text || "") + "</div></td></tr></table></td></tr>" +
    '<tr><td class="pad" style="padding:20px 36px 0"><div>' + badge + '</div><div style="margin-top:12px;font-size:12px;letter-spacing:.06em;color:' + C.muted + ';text-transform:uppercase">Phản hồi của ' + esc(org) + '</div>' +
      '<div style="margin-top:4px;font-size:15px;line-height:1.65;color:' + C.ink + '">' + br(res.reply) + "</div></td></tr>" +
    '<tr><td class="pad" style="padding:20px 36px 0">' + card + "</td></tr>" + cta +
    '<tr><td class="pad" style="padding:22px 36px 0"><div style="font-size:14px;line-height:1.65;color:' + C.body + '">Nếu ' + esc(W.H) + ' vẫn còn thắc mắc, vui lòng nhấn nút <b>“Tôi có thắc mắc”</b> trên trang xác nhận, ' + esc(org) + " sẽ tiếp tục hỗ trợ " + esc(W.H) + ".</div></td></tr>" +
    '<tr><td class="pad" style="padding:22px 36px 8px;font-size:15px;line-height:1.6;color:' + C.ink + '">Trân trọng,<br><b style="color:' + C.navy + '">' + esc(org) + "</b></td></tr>" +
    '<tr><td class="pad" style="padding:14px 36px 26px"><div style="border-top:1px solid ' + C.line + ';padding-top:14px;font-size:12px;line-height:1.7;color:#7C8AA5">' +
      "Thư này được gửi riêng đến " + esc(W.to) + " (Mã nhân viên: " + esc(row.code) + "). Vui lòng không chuyển tiếp email này cho người khác.<br>" +
      "Trong trường hợp không thể nhấn nút, " + esc(W.H) + ' vui lòng truy cập đường dẫn dưới đây:<br><a href="' + esc(url) + '" target="_blank" style="color:' + C.brand + ';font-weight:700;text-decoration:underline">Liên kết xác nhận điểm</a></div></td></tr>' +
    "</table></td></tr></table></body></html>";
  const text = "Chào " + W.call + ",\n" + org + " đã tiếp nhận và xử lý thắc mắc của " + W.H + " về " + d.title + ".\n\nThắc mắc của " + W.H + ": " + (x && x.text || "") + "\n\nKẾT QUẢ: " + (adjust ? "ĐÃ ĐIỀU CHỈNH ĐIỂM" : "GIỮ NGUYÊN KẾT QUẢ") + "\nPhản hồi của " + org + ": " + res.reply + "\n\n" +
    (adjust ? "Điểm sau khi điều chỉnh" : "Kết quả hiện tại") + " của " + W.H + ": " + (nm || row.code).toLocaleUpperCase("vi-VN") + "\n" +
    d.cols.map((c, i) => c + ": " + (adjust && res.before && res.before[i] !== res.after[i] ? (res.before[i] || "—") + " -> " : "") + (res.after[i] || "—")).join("\n") +
    (needConfirm ? "\n\n" + (adjust ? "XÁC NHẬN ĐIỂM MỚI" : "XÁC NHẬN ĐIỂM") + ":\n" + url + (d.deadline && d.deadline > Date.now() ? "\nVui lòng xác nhận trước " + vnTime(d.deadline) + "." : "") : "\n\nĐiểm của " + W.H + " đã được xác nhận trước đó và không thay đổi.") +
    "\n\nNếu " + W.H + " vẫn còn thắc mắc, vui lòng nhấn nút “Tôi có thắc mắc” trên trang xác nhận.\n\nTrân trọng,\n" + org;
  const subject = "Kết quả xử lý thắc mắc về điểm dành cho " + W.call + ": " + d.title;
  let previewHtml = html; atts.forEach((a) => { previewHtml = previewHtml.split("cid:" + a.cid).join("data:" + a.contentType + ";base64," + a.content.toString("base64")); });
  return { subject, html, text, attachments: atts.length ? atts : undefined, previewHtml, to: email || "" };
}
// opt: { outcome: "keep"|"adjust", reply, vals (khi adjust), notify (mặc định gửi email), dry (chỉ xem trước, không lưu) }
async function handleDispute(id, code, opt, by) {
  opt = opt || {};
  const d = await get(id); if (!d) return err("Không tìm thấy đợt này.", "not_found");
  const k = up(code), ri = d.rows.findIndex((r) => r.code === k), x = d.disputes && d.disputes[k];
  if (ri < 0 || !x) return err("Không có thắc mắc nào của người này.", "none");
  if (x.resolved) return err("Thắc mắc này đã được xử lý rồi.", "done");
  const outcome = opt.outcome === "adjust" ? "adjust" : opt.outcome === "keep" ? "keep" : "";
  if (!outcome) return err("Hãy chọn kết quả xử lý: giữ nguyên hoặc điều chỉnh điểm.", "no_outcome");
  const reply = clip(opt.reply, 800); if (reply.length < 5) return err("Hãy ghi nội dung phản hồi gửi nhân viên (ít nhất 5 ký tự).", "no_reply");
  const row = d.rows[ri], before = row.vals.slice();
  let after = before;
  if (outcome === "adjust") {
    if (!Array.isArray(opt.vals) || opt.vals.length !== d.cols.length) return err("Thiếu số điểm cần điều chỉnh.", "bad_vals");
    after = d.cols.map((_, i) => clip(opt.vals[i], 30));
    if (after.every((v, i) => v === before[i])) return err("Chưa có điểm nào thay đổi. Nếu giữ nguyên điểm, hãy chọn “Giữ nguyên”.", "same");
  }
  const rc = (await recipients(d)).find((r) => r.code === k) || { email: "", name: row.name };
  const needConfirm = outcome === "adjust" || !(d.confirmed && d.confirmed[k]);   // giữ nguyên mà trước đó đã xác nhận thì không cần xác nhận lại
  const mailRes = { outcome, reply, before: outcome === "adjust" ? before : null, after };
  const m = await resultMail(Object.assign({}, d, { rows: d.rows }), Object.assign({}, row, { vals: after }), rc.email, rc.name || row.name, x, mailRes, needConfirm);
  const willEmail = opt.notify !== false && !!rc.email && mailConfigured();
  if (opt.dry) return { ok: true, dry: true, subject: m.subject, html: m.previewHtml, to: rc.email || "", willEmail, noEmailReason: !rc.email ? "Nhân viên chưa có email" : !mailConfigured() ? "Máy chủ chưa cấu hình gửi email" : "", needConfirm };
  await store.update(docKey(id), (cur) => {
    const c = cur && !cur.deleted ? cur : d, cx = c.disputes && c.disputes[k]; if (!cx || cx.resolved) return c;
    if (outcome === "adjust") {
      const r = c.rows[ri]; r.vals = after.slice();
      r.adj = (r.adj || []).concat({ at: Date.now(), by: clip(by, 120), from: before, to: after.slice(), why: reply }).slice(-10);
      if (c.confirmed && c.confirmed[k]) { c.confirmedPrev = c.confirmedPrev || {}; c.confirmedPrev[k] = c.confirmed[k]; delete c.confirmed[k]; }   // điểm đổi: xác nhận cũ không còn giá trị, phải xác nhận lại (giữ lại để đối chiếu)
    }
    cx.resolved = { at: Date.now(), by: clip(by, 120), outcome, reply };
    return c;
  });
  let emailed = false, reason = "";
  if (opt.notify === false) reason = "Bạn chọn không gửi email.";
  else if (!rc.email) reason = "Nhân viên chưa có email nên chưa gửi được.";
  else if (!mailConfigured()) reason = "Máy chủ chưa cấu hình gửi email (SMTP).";
  else {
    try { emailed = !!(await mail.send({ fromName: mail.KT_NAME, to: rc.email, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments })); if (!emailed) reason = "Máy chủ chưa gửi được email."; }
    catch (e) { reason = "Gửi email thất bại."; }
  }
  await store.update(docKey(id), (cur) => { const c = cur && !cur.deleted ? cur : d, cx = c.disputes && c.disputes[k]; if (cx && cx.resolved) cx.resolved.emailed = { at: Date.now(), ok: emailed }; return c; });
  return { ok: true, outcome, emailed, reason, needConfirm };
}

// ---------- trang công khai của nhân viên ----------
async function view(t) {
  const d = await get(t.id); if (!d) return err("Đợt xác nhận này không còn tồn tại. Vui lòng liên hệ người gửi thư.", "not_found");
  const row = d.rows.find((r) => r.code === t.code); if (!row) return err("Không tìm thấy điểm của bạn trong đợt này.", "no_row");
  const k = row.code, c = d.confirmed[k] || null, x = d.disputes[k] || null;
  return { ok: true, title: d.title, org: d.org, cols: d.cols, vals: row.vals, code: row.code, name: row.name, manager: row.manager, deadline: d.deadline || 0,
    contact: d.contact, phone: d.phone, email: d.email, state: stateOf(d, k), confirmedAt: c ? c.at : 0, dispute: x ? { at: x.at, text: x.text, resolved: !!x.resolved } : null,
    resolution: x && x.resolved ? { at: x.resolved.at, outcome: x.resolved.outcome || "", reply: x.resolved.reply || "" } : null };
}
async function act(t, op, b, meta) {
  const d = await get(t.id); if (!d) return err("Đợt xác nhận này không còn tồn tại.", "not_found");
  const row = d.rows.find((r) => r.code === t.code); if (!row) return err("Không tìm thấy điểm của bạn trong đợt này.", "no_row");
  const k = row.code; let res = null;
  if (op === "dispute") { const text = clip(b && b.text, 600); if (text.length < 5) return err("Vui lòng ghi rõ nội dung thắc mắc (ít nhất 5 ký tự).", "short"); b = { text }; }
  await store.update(docKey(d.id), (cur) => {
    const c = cur && !cur.deleted ? cur : d; c.confirmed = c.confirmed || {}; c.disputes = c.disputes || {};
    if (op === "confirm") {
      if (stateOf(c, k) === "confirmed") { res = { already: true }; return c; }
      c.confirmed[k] = { at: Date.now(), ua: clip(meta && meta.ua, 160), vals: row.vals.slice() }; res = { ok: true }; return c;   // lưu kèm bản điểm đã xác nhận
    }
    c.disputes[k] = { at: Date.now(), text: b.text, ua: clip(meta && meta.ua, 160) }; res = { ok: true }; return c;
  });
  return Object.assign(await view(t), res || {});
}

module.exports = { ORG_DEFAULT, handleDispute, resultMail, notifications, resolveDispute, fromResults, historyOf, periodOf, list, get, create, remove, token, readToken, linkUrl, stateOf, recipients, statsOf, mailFor, preview, send, status, view, act, BATCH };

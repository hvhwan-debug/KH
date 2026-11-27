// NHẬN ĐỊNH ĐA CHIỀU CHO MỘT NHÂN SỰ (trang Hồ sơ học tập, tab Tổng quan năng lực).
//
// Vì sao có module này: nhận định cũ chỉ đọc lại con số của chính người đó ("điểm 72%, tăng 5 điểm"), nên đọc xong
// quản lí không biết phải làm gì khác. Ở đây mỗi nhận định phải trả lời được 4 câu:
//   1) So với AI? (đồng nghiệp cùng vị trí, cùng đội, cùng tỉnh, toàn hệ thống) -> một con số chỉ có nghĩa khi có mốc so sánh.
//   2) Vấn đề nằm ở ĐÂU? cá nhân / cả đội / nội dung đào tạo / kỹ năng bán / thị trường -> mỗi nơi cần một hành động khác nhau.
//   3) Bằng chứng nào ỦNG HỘ và bằng chứng nào PHẢN BÁC (giả thuyết cạnh tranh) -> tránh kết luận vội.
//   4) Vậy thì làm gì, ai làm, đo bằng chỉ số nào sau 30 ngày; quản lí hỏi gì trong buổi 1-1 để kiểm chứng.
//
// 7 góc nhìn: Kiến thức theo mảng (so với đồng nghiệp) · Vị thế (thứ hạng phần trăm) · Xu hướng qua các kỳ ·
//   Hành vi làm bài · Kết quả kinh doanh (và quan hệ với kiến thức) · Bối cảnh đội & quản lí · Chủ động học tập.
// Nguyên tắc: chỉ dùng số liệu có thật; mẫu nhỏ thì hạ độ tin cậy; không kết luận nhân quả; không đề xuất quyết định bất lợi về nhân sự.
// AI (tuỳ chọn) chỉ nhận mã ẩn danh + gói bằng chứng đã tính sẵn, phải viết theo khung trên; số AI đưa ra được đối chiếu lại với gói bằng chứng.
const quiz = require("./quiz");
const HC = require("./hrcompetency");

const r0 = (v) => (v == null || !isFinite(v) ? null : Math.round(v));
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const signed = (v) => (v == null ? "–" : (v > 0 ? "+" : "") + String(r1(v)).replace(".", ","));
const vn = (v) => (v == null ? "–" : String(r1(v)).replace(".", ","));
// Thứ hạng phần trăm: tỉ lệ người có giá trị THẤP HƠN (tính nửa số người bằng) -> 0..100
function pctile(v, arr) { if (v == null || !arr.length) return null; let lo = 0, eq = 0; arr.forEach((x) => { if (x < v) lo++; else if (x === v) eq++; }); return r0(100 * (lo + eq / 2) / arr.length); }
// Độ dốc (điểm % mỗi kỳ) theo hồi quy tuyến tính đơn
function slope(ys) { const n = ys.length; if (n < 3) return null; const xs = ys.map((_, i) => i), mx = mean(xs), my = mean(ys); let a = 0, b = 0; for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; } return b ? a / b : null; }
const LV = { good: "Điểm sáng", ok: "Ổn", watch: "Cần chú ý", risk: "Rủi ro", na: "Thiếu dữ liệu" };

function peerStat(list, fn) { const v = list.map(fn).filter((x) => x != null && isFinite(x)); return { n: v.length, mean: r1(mean(v)), median: r1(median(v)), values: v }; }

// ---------------------------------------------------------------------------------------------
async function analyze(code, opt) {
  opt = opt || {};
  const k = quiz.normCode(code);
  const cand = (await quiz.getCandidates()).find((c) => quiz.normCode(c.code) === k);
  if (!cand) return { ok: false, error: "Không tìm thấy nhân sự này." };
  if (quiz.isLeft(cand)) return { ok: true, left: true, headline: { title: "Nhân sự đã nghỉ việc", text: "Nhân sự đã nghỉ việc nên không đưa vào so sánh với đội ngũ hiện tại. Dữ liệu cũ vẫn xem được ở các tab khác." }, lenses: [], hypotheses: [], questions: [], plan: [] };
  const H = await HC.build({ refresh: !!opt.refresh });
  const all = H.people || [];
  const p = all.find((x) => quiz.normCode(x.code) === k);
  if (!p) return { ok: false, error: "Chưa có dữ liệu năng lực của nhân sự này, vui lòng thử Làm mới." };
  const tested = all.filter((x) => x.tests && x.index != null);
  const same = (f) => tested.filter((x) => f(x) && quiz.normCode(x.code) !== k);
  const G = {
    role: same((x) => x.audience === p.audience), team: same((x) => x.manager === p.manager),
    prov: same((x) => x.province === p.province), all: tested.filter((x) => quiz.normCode(x.code) !== k)
  };
  const lenses = [], hyp = [], questions = [], plan = [], facts = {};

  // ---------- 1. VỊ THẾ: một con số chỉ có nghĩa khi có mốc so sánh ----------
  if (p.tests) {
    const ref = G.role.length >= 5 ? { l: "cùng vị trí (" + String(p.audience).split(" · ")[0] + ")", list: G.role } : { l: "toàn hệ thống", list: G.all };
    const pr = pctile(p.index, ref.list.map((x) => x.index)), prTeam = G.team.length >= 3 ? pctile(p.index, G.team.map((x) => x.index)) : null;
    const pm = r1(mean(ref.list.map((x) => x.index)));
    facts.position = { index: p.index, refLabel: ref.l, refN: ref.list.length, refMean: pm, pctile: pr, teamPctile: prTeam };
    const lv = pr == null ? "na" : pr >= 75 ? "good" : pr >= 40 ? "ok" : pr >= 20 ? "watch" : "risk";
    const so = pr == null ? "" : pr >= 75 ? "Thuộc nhóm 25% dẫn đầu: có thể giao vai trò kèm cặp hoặc chia sẻ kinh nghiệm." : pr >= 40 ? "Ở mức giữa của đồng nghiệp: chưa phải ưu tiên can thiệp, nên tập trung vào mảng yếu cụ thể." : pr >= 20 ? "Nằm trong nhóm thấp hơn phần lớn đồng nghiệp: cần một mục tiêu cải thiện rõ ràng trong kỳ tới." : "Thuộc nhóm 20% thấp nhất: nên đưa vào danh sách kèm cặp ưu tiên.";
    lenses.push({ id: "position", name: "Vị thế so với đồng nghiệp", level: lv, insight: pr == null ? "Chưa đủ đồng nghiệp để so sánh." : "Chỉ số năng lực " + vn(p.index) + "%, " + (pr <= 2 ? "thấp nhất trong" : pr >= 98 ? "cao nhất trong" : "cao hơn " + pr + "%") + " đồng nghiệp " + ref.l + " (TB nhóm " + vn(pm) + "%, " + ref.list.length + " người). " + so,
      evidence: [prTeam != null ? "Trong đội của quản lí: cao hơn " + prTeam + "% thành viên (" + G.team.length + " người có bài)." : "", "Chỉ số năng lực tính từ " + p.tests + " bài, bài gần đây tính nặng hơn."].filter(Boolean),
      bar: { me: p.index, peer: pm, label: "TB " + ref.l } });
  } else lenses.push({ id: "position", name: "Vị thế so với đồng nghiệp", level: "na", insight: "Chưa có bài kiểm tra chính thức nào nên chưa đặt được vị trí so với đồng nghiệp.", evidence: [] });

  // ---------- 2. KIẾN THỨC THEO MẢNG: lỗ hổng riêng hay lỗ hổng chung? ----------
  const scope = (p.areas || []).filter((a) => !a.offScope && a.n >= 4);
  const areaRows = scope.map((a) => {
    const peers = (G.role.length >= 5 ? G.role : G.all).map((x) => (x.areas || []).find((y) => y.id === a.id && y.n >= 4)).filter(Boolean).map((y) => y.pct);
    const pm = peers.length >= 3 ? r1(mean(peers)) : null, gap = pm == null ? null : r1(a.pct - pm);
    const kind = pm == null ? "unknown" : a.pct < 65 && pm < 65 ? "shared" : gap <= -12 ? "personal" : gap >= 12 ? "edge" : a.pct < 65 ? "shared" : "par";
    return { id: a.id, name: a.name, pct: a.pct, n: a.n, conf: a.conf, peer: pm, peerN: peers.length, gap, kind, topics: (a.topics || []).filter((t) => t.pct < 60 && t.n >= 2).slice(0, 2).map((t) => t.name) };
  });
  facts.areas = areaRows;
  if (areaRows.length) {
    const personal = areaRows.filter((a) => a.kind === "personal").sort((x, y) => x.gap - y.gap), shared = areaRows.filter((a) => a.kind === "shared"), edge = areaRows.filter((a) => a.kind === "edge").sort((x, y) => y.gap - x.gap);
    const parts = [];
    if (personal.length) parts.push("Lỗ hổng RIÊNG ở " + personal.map((a) => a.name + " (" + vn(a.pct) + "%, thấp hơn đồng nghiệp " + vn(-a.gap) + " điểm)").join("; ") + ": người khác cùng vị trí làm được, nên đây là việc cần kèm cặp cá nhân.");
    if (shared.length) parts.push("Mảng " + shared.map((a) => a.name + " (" + vn(a.pct) + "%, đồng nghiệp TB " + vn(a.peer) + "%)").join("; ") + " yếu ở CẢ nhóm: nguyên nhân nhiều khả năng nằm ở nội dung hoặc cách đào tạo, không nên quy trách nhiệm cá nhân.");
    if (edge.length) parts.push("Nổi trội ở " + edge.slice(0, 2).map((a) => a.name + " (+" + vn(a.gap) + " điểm so với đồng nghiệp)").join("; ") + ".");
    if (!parts.length) parts.push("Các mảng đều xấp xỉ mức đồng nghiệp cùng vị trí, không có lỗ hổng nổi bật.");
    lenses.push({ id: "areas", name: "Kiến thức theo mảng", level: personal.length ? (personal[0].pct < 55 ? "risk" : "watch") : shared.length ? "watch" : edge.length ? "good" : "ok", insight: parts.join(" "),
      evidence: areaRows.map((a) => a.name + ": " + vn(a.pct) + "% (" + a.n + " câu" + (a.peer != null ? ", đồng nghiệp " + vn(a.peer) + "%" : "") + ")" + (a.topics.length ? " · chủ đề yếu: " + a.topics.join(", ") : "")), areas: areaRows });
    personal.slice(0, 2).forEach((a) => plan.push({ hid: "gap", t: "Kèm cặp 1-1 mảng " + a.name + (a.topics.length ? " (trọng tâm: " + a.topics.join(", ") + ")" : "") + ", rồi làm lại bài kiểm tra mảng này.", who: "Quản lí + nhân viên", when: "2–3 tuần", kpi: a.name + " từ " + vn(a.pct) + "% lên ≥ " + Math.min(100, Math.max(70, r0(a.peer))) + "% (mức đồng nghiệp)" }));
    if (shared.length) plan.push({ hid: "content", t: "Báo bộ phận đào tạo rà soát học liệu và câu hỏi mảng " + shared[0].name + " (cả nhóm cùng yếu).", who: "Đào tạo", when: "Kỳ tới", kpi: "Điểm TB cả nhóm mảng " + shared[0].name + " tăng ≥ 10 điểm" });
  } else lenses.push({ id: "areas", name: "Kiến thức theo mảng", level: "na", insight: p.tests ? "Chưa đủ số câu theo từng mảng (cần ≥ 4 câu mỗi mảng) để so sánh." : "Chưa có bài kiểm tra.", evidence: [] });

  // ---------- 3. XU HƯỚNG qua các kỳ: đang đi lên, đi xuống hay dậm chân? ----------
  const idx = (await quiz.getIndex()).filter((r) => r.status === "submitted" && quiz.normCode(r.code) === k && r.pct != null && !r.practice).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
  const byP = new Map(); idx.forEach((r) => { const key = r.period || ""; const o = byP.get(key) || byP.set(key, { first: Number(r.pct), best: Number(r.pct), n: 0, t: r.submittedAt || 0 }).get(key); o.n++; o.best = Math.max(o.best, Number(r.pct)); o.t = Math.max(o.t, r.submittedAt || 0); });
  const series = Array.from(byP.entries()).sort((a, b) => a[1].t - b[1].t).map(([per, o]) => ({ period: per, best: r1(o.best), first: r1(o.first), n: o.n }));
  const ys = series.map((x) => x.best).slice(-6), sl = slope(ys), vol = sd(ys), retakes = series.filter((x) => x.n >= 2), learn = retakes.length ? r1(mean(retakes.map((x) => x.best - x.first))) : null;
  facts.trend = { periods: series.length, series: series.slice(-6), slope: r1(sl), volatility: r1(vol), retakeGain: learn };
  if (series.length >= 2) {
    const d = r1(ys[ys.length - 1] - ys[ys.length - 2]);
    let lv = "ok", txt;
    if (sl != null && sl <= -4) { lv = "risk"; txt = "Đi xuống liên tục: trung bình mất " + vn(-sl) + " điểm mỗi kỳ qua " + ys.length + " kỳ. Một kỳ thấp có thể do đề khó, nhưng giảm đều nhiều kỳ là tín hiệu thật cần hỏi nguyên nhân (động lực, khối lượng việc, kiến thức sản phẩm mới)."; }
    else if (sl != null && sl >= 4) { lv = "good"; txt = "Đi lên đều: trung bình +" + vn(sl) + " điểm mỗi kỳ qua " + ys.length + " kỳ. Cách học hiện tại đang hiệu quả, nên giữ nhịp và nâng mục tiêu."; }
    else if (vol != null && vol >= 12) { lv = "watch"; txt = "Dao động mạnh giữa các kỳ (lệch chuẩn " + vn(vol) + " điểm): kết quả phụ thuộc đề hoặc trạng thái lúc làm, chưa ổn định. Nên xem các kỳ thấp rơi vào mảng nào."; }
    else txt = (d > 0 ? "Kỳ gần nhất tăng " + vn(d) + " điểm" : d < 0 ? "Kỳ gần nhất giảm " + vn(-d) + " điểm" : "Kỳ gần nhất không đổi") + " so với kỳ trước; " + (series.length >= 3 ? "nhìn chung đi ngang." : "cần thêm kỳ để kết luận xu hướng.");
    if (learn != null) txt += learn >= 10 ? " Khi được làm lại, điểm tăng TB " + vn(learn) + " điểm: tiếp thu tốt sau khi biết mình sai, nên cho xem lại bài sai ngay sau mỗi kỳ." : learn <= 3 ? " Làm lại cùng bài gần như không cải thiện (+" + vn(learn) + "): làm lại không giúp được, cần học lại nội dung trước khi làm tiếp." : "";
    lenses.push({ id: "trend", name: "Xu hướng qua các kỳ", level: lv, insight: txt, evidence: series.slice(-6).map((x) => (x.period || "(chưa gắn kỳ)") + ": " + vn(x.best) + "%" + (x.n > 1 ? " (" + x.n + " lượt, lần đầu " + vn(x.first) + "%)" : "")), spark: ys });
    if (lv === "risk") { hyp.push({ id: "decline", score: 60, title: "Năng lực đang giảm dần qua các kỳ", for: ["Giảm TB " + vn(-sl) + " điểm/kỳ qua " + ys.length + " kỳ."], against: [], verify: "Hỏi trong 1-1 điều gì đã thay đổi trong công việc vài tháng gần đây." }); questions.push("Vài tháng gần đây công việc của em có gì thay đổi (địa bàn, sản phẩm mới, khối lượng việc) khiến việc ôn kiến thức bị ảnh hưởng không?"); }
  } else lenses.push({ id: "trend", name: "Xu hướng qua các kỳ", level: "na", insight: series.length === 1 ? "Mới có một kỳ kiểm tra: chưa xác định được đang tiến bộ hay đi xuống." : "Chưa có bài kiểm tra.", evidence: [] });

  // ---------- 4. HÀNH VI LÀM BÀI: biết mà làm ẩu, hay chưa biết thật? ----------
  let beh = null; try { beh = idx.length ? await require("./behavior").forEmployee(p.code, { ai: false }) : null; } catch (e) { beh = null; }
  const bf = ((beh && beh.findings) || []).filter((f) => f.level === "bad" || f.level === "warn").slice(0, 3);
  facts.behavior = bf.map((f) => ({ code: f.code, title: f.title, level: f.level }));
  if (beh) {
    const rush = bf.find((f) => /rush|random|fast/i.test(f.code || ""));
    lenses.push({ id: "behavior", name: "Hành vi làm bài", level: bf.some((f) => f.level === "bad") ? "risk" : bf.length ? "watch" : "ok",
      insight: bf.length ? bf.map((f) => f.title).join(". ") + "." + (rush ? " Điểm thấp có thể một phần do làm vội chứ không hẳn do không biết: kết luận về kiến thức cần thận trọng." : "") : "Không thấy dấu hiệu bất thường trong cách làm bài (tốc độ, đoán, rời màn hình): điểm số phản ánh khá sát kiến thức thật.",
      evidence: bf.reduce((o, f) => o.concat((f.evidence || []).slice(0, 2)), []).slice(0, 4) });
    if (rush) { hyp.push({ id: "rush", score: 45, title: "Làm vội / đoán, điểm chưa phản ánh hết kiến thức", for: [rush.title], against: [], verify: "Cho làm lại có giám sát, yêu cầu đọc kỹ từng câu rồi so sánh điểm." }); questions.push("Lúc làm bài em thấy thời gian có đủ không, có câu nào em chọn nhanh cho xong không?"); }
  } else lenses.push({ id: "behavior", name: "Hành vi làm bài", level: "na", insight: "Chưa có bài làm để phân tích hành vi.", evidence: [] });

  // ---------- 5. KẾT QUẢ KINH DOANH: kiến thức có chuyển thành doanh số không? ----------
  const salesOf = (x) => (x.sales && x.sales.avg3 != null ? x.sales.avg3 : null);
  if (p.sales) {
    const sv = p.sales.avg3, ser = (p.sales.series || []).map((x) => x.v), ssl = slope(ser);
    const tS = peerStat(G.team, salesOf), rS = peerStat(G.role, salesOf);
    const spr = pctile(sv, rS.values.length >= 5 ? rS.values : peerStat(G.all, salesOf).values);
    const kp = facts.position && facts.position.pctile;
    const kGood = p.index != null && (p.index >= 70 || (kp != null && kp >= 60)), kLow = p.index != null && (p.index < 60 || (kp != null && kp < 30)), sGood = sv >= 95;
    facts.sales = { avg3: sv, latest: p.sales.latest, months: p.sales.months, slope: r1(ssl), teamAvg: tS.n >= 3 ? tS.mean : null, rolePctile: spr };
    let txt = "Hoàn thành chỉ tiêu TB 3 tháng " + vn(sv) + "%" + (spr != null ? (spr <= 2 ? ", thấp nhất nhóm đồng nghiệp" : spr >= 98 ? ", cao nhất nhóm đồng nghiệp" : ", cao hơn " + spr + "% đồng nghiệp") : "") + (ssl != null ? "; xu hướng " + (ssl >= 3 ? "tăng" : ssl <= -3 ? "giảm" : "đi ngang") + " (" + signed(ssl) + " điểm/tháng)" : "") + ". ";
    let lv = sGood ? "good" : sv >= 80 ? "watch" : "risk";
    if (p.tests) {
      if (kGood && !sGood) {
        const teamLow = tS.n >= 3 && tS.mean < 85;
        txt += teamLow ? "Kiến thức tốt mà bán chưa đạt, nhưng cả đội cũng chỉ đạt TB " + vn(tS.mean) + "%: nhiều khả năng do địa bàn, hàng hoá, giá hoặc chỉ tiêu giao cao, không phải do năng lực cá nhân." : "Kiến thức tốt mà bán chưa đạt trong khi đội đạt " + (tS.mean != null ? "TB " + vn(tS.mean) + "%" : "khá hơn") + ": điểm nghẽn nằm ở KỸ NĂNG BÁN (tiếp cận, tư vấn, chốt đơn), không phải kiến thức. Đào tạo thêm kiến thức sẽ ít tác dụng.";
        hyp.push(teamLow
          ? { id: "market", score: 55, title: "Yếu tố thị trường / địa bàn kìm doanh số (không phải năng lực)", for: ["Kiến thức ở nửa trên đồng nghiệp.", "Cả đội chỉ đạt TB " + vn(tS.mean) + "% chỉ tiêu."], against: [], verify: "Đối chiếu chỉ tiêu, tồn hàng, giá và đối thủ tại địa bàn với đội khác." }
          : { id: "skill", score: 55 + Math.min(25, Math.max(0, ((tS.mean || 95) - sv) / 2)), title: "Có kiến thức nhưng chưa chuyển thành doanh số (kỹ năng bán)", for: ["Kiến thức ở nửa trên đồng nghiệp.", "Bán " + vn(sv) + "% chỉ tiêu, thấp hơn đội (" + vn(tS.mean) + "%)."], against: [], verify: "Quản lí đi thị trường cùng 1–2 buổi, quan sát cách tư vấn và chốt đơn." });
        questions.push(teamLow ? "Tại điểm bán của em, khó khăn lớn nhất hiện nay là hàng, giá, đối thủ hay khách hàng?" : "Khi khách đã hỏi sản phẩm mà không mua, thường em thấy khách vướng ở điểm nào?");
        plan.push(teamLow ? { hid: "market", t: "Rà soát chỉ tiêu, tồn hàng, giá và đối thủ tại địa bàn của đội.", who: "Quản lí + ASM", when: "2 tuần", kpi: "Có danh sách nguyên nhân ngoài năng lực và đề xuất điều chỉnh" } : { hid: "skill", t: "Đi thị trường cùng nhân viên 2 buổi, góp ý trực tiếp kỹ năng tư vấn và chốt đơn.", who: "Quản lí", when: "2 tuần", kpi: "% hoàn thành chỉ tiêu tháng sau tăng ≥ 10 điểm" });
      } else if (!kGood && sGood) {
        txt += "Bán tốt dù điểm kiến thức chưa cao: thế mạnh nằm ở kỹ năng và quan hệ khách hàng. Rủi ro là tư vấn sai thông số / chính sách khi sản phẩm mới ra, nên cập nhật kiến thức để giữ kết quả bền vững.";
        hyp.push({ id: "natural", score: 40, title: "Bán bằng kỹ năng và quan hệ, kiến thức chưa theo kịp", for: ["Bán " + vn(sv) + "% chỉ tiêu.", "Chỉ số kiến thức " + vn(p.index) + "%."], against: [], verify: "Nghe nhân viên tư vấn một sản phẩm mới, kiểm tra độ chính xác thông tin." });
        plan.push({ hid: "natural", t: "Học nhanh các sản phẩm / chính sách mới (15 phút/tuần) và chia sẻ kinh nghiệm bán cho đội.", who: "Nhân viên", when: "4 tuần", kpi: "Chỉ số kiến thức ≥ 70% ở kỳ tới, giữ ≥ 95% chỉ tiêu" });
      } else if (kLow && !sGood) { txt += "Cả kiến thức và doanh số đều dưới mức: nên kèm cặp tổng hợp, bắt đầu từ sản phẩm bán chạy nhất tại địa bàn để có kết quả sớm."; lv = "risk";
        hyp.push({ id: "both", score: 55, title: "Cả kiến thức và doanh số cùng thấp: cần kèm cặp tổng hợp", for: ["Chỉ số kiến thức " + vn(p.index) + "%.", "Bán " + vn(sv) + "% chỉ tiêu."], against: [], verify: "Xác định 1–2 sản phẩm bán chạy nhất địa bàn để học và bán trước." }); }
      else if (!sGood) { const tGood = tS.n >= 3 && tS.mean >= 95; txt += "Kiến thức ở mức trung bình nhưng doanh số " + (tGood ? "thấp hơn hẳn đội (TB " + vn(tS.mean) + "%): khoảng cách này lớn hơn khoảng cách kiến thức, nên ưu tiên quan sát KỸ NĂNG BÁN tại điểm bán trước khi cho học thêm." : "chưa đạt: cần xem song song kỹ năng bán và điều kiện địa bàn.");
        if (tGood) { hyp.push({ id: "skill", score: 58, title: "Doanh số kém đội nhiều hơn mức chênh kiến thức: điểm nghẽn ở kỹ năng bán", for: ["Bán " + vn(sv) + "% trong khi đội TB " + vn(tS.mean) + "%.", "Kiến thức ở mức giữa đồng nghiệp."], against: [], verify: "Quản lí đi thị trường cùng 1–2 buổi." }); plan.push({ hid: "skill", t: "Đi thị trường cùng nhân viên 2 buổi, góp ý trực tiếp kỹ năng tư vấn và chốt đơn.", who: "Quản lí", when: "2 tuần", kpi: "% hoàn thành chỉ tiêu tháng sau tăng ≥ 10 điểm" }); questions.push("Khi khách đã hỏi sản phẩm mà không mua, thường em thấy khách vướng ở điểm nào?"); } }
      else txt += "Kiến thức và doanh số cùng tốt: hình mẫu để chia sẻ cách làm cho đồng nghiệp.";
    }
    lenses.push({ id: "sales", name: "Kết quả kinh doanh", level: lv, insight: txt, evidence: [(p.sales.series || []).map((x) => x.m.slice(5) + "/" + x.m.slice(2, 4) + ": " + vn(x.v) + "%").join(" · "), tS.n >= 3 ? "TB đội của quản lí: " + vn(tS.mean) + "% (" + tS.n + " người có số bán)." : ""].filter(Boolean),
      bar: tS.n >= 3 ? { me: sv, peer: tS.mean, label: "TB đội" } : null });
  } else lenses.push({ id: "sales", name: "Kết quả kinh doanh", level: "na", insight: "Chưa có số liệu bán hàng khớp mã nhân viên này nên chưa đánh giá được kiến thức có chuyển thành doanh số không. Kiểm tra mã NV trong file số bán.", evidence: [] });

  // ---------- 6. BỐI CẢNH ĐỘI: vấn đề của người, hay của cả đội? ----------
  if (p.tests && G.team.length >= 3) {
    const tm = r1(mean(G.team.map((x) => x.index))), om = r1(mean(G.all.map((x) => x.index))), dTeam = r1(tm - om), dMe = r1(p.index - tm);
    facts.team = { manager: p.manager, n: G.team.length, teamMean: tm, overallMean: om };
    let lv = "ok", txt;
    if (dTeam <= -6 && Math.abs(dMe) <= 6) { lv = "watch"; txt = "Đội của quản lí thấp hơn toàn hệ thống " + vn(-dTeam) + " điểm và người này ở đúng mặt bằng đội: vấn đề nhiều khả năng ở CẤP ĐỘI (cách kèm cặp, thời gian ôn, thông tin sản phẩm đến đội), xử lý từng người riêng lẻ sẽ kém hiệu quả.";
      hyp.push({ id: "team", score: 55, title: "Vấn đề ở cấp đội, không riêng cá nhân", for: ["Đội thấp hơn hệ thống " + vn(-dTeam) + " điểm.", "Cá nhân lệch đội " + signed(dMe) + " điểm."], against: [], verify: "So lịch đào tạo / họp sản phẩm của đội này với đội điểm cao." });
      plan.push({ hid: "team", t: "Tổ chức một buổi ôn chung cho cả đội (thay vì riêng người này).", who: "Quản lí", when: "2 tuần", kpi: "Điểm TB đội kỳ tới tiến sát mức hệ thống (" + vn(om) + "%)" }); }
    else if (dMe <= -10) { lv = "watch"; txt = "Thấp hơn TB đội " + vn(-dMe) + " điểm trong khi đội ở mức " + vn(tm) + "%: cùng môi trường, cùng quản lí mà kết quả kém hơn, nên nguyên nhân thiên về cá nhân. Có thể ghép cặp với người giỏi nhất đội."; }
    else if (dMe >= 10) { lv = "good"; txt = "Cao hơn TB đội " + vn(dMe) + " điểm: là nguồn lực sẵn có để kèm cặp đồng nghiệp trong chính đội."; }
    else txt = "Ngang mặt bằng đội (" + vn(tm) + "%, lệch " + signed(dMe) + " điểm); đội " + (dTeam >= 0 ? "cao hơn" : "thấp hơn") + " toàn hệ thống " + vn(Math.abs(dTeam)) + " điểm.";
    lenses.push({ id: "team", name: "Bối cảnh đội & quản lí", level: lv, insight: txt, evidence: ["Quản lí: " + p.manager + " · " + G.team.length + " người khác có bài.", "TB đội " + vn(tm) + "% · TB hệ thống " + vn(om) + "%."], bar: { me: p.index, peer: tm, label: "TB đội" } });
  } else lenses.push({ id: "team", name: "Bối cảnh đội & quản lí", level: "na", insight: "Đội có dưới 3 người có bài kiểm tra: chưa tách được ảnh hưởng của đội với cá nhân.", evidence: [] });

  // ---------- 7. CHỦ ĐỘNG HỌC TẬP & BỐI CẢNH CÁ NHÂN ----------
  {
    const days = p.lastAt ? Math.floor((Date.now() - p.lastAt) / 864e5) : null, kai90 = (p.kai && p.kai.n90) || 0;
    const kaiPeers = G.role.map((x) => (x.kai && x.kai.n90) || 0), kaiMed = kaiPeers.length ? median(kaiPeers) : null;
    const bits = [], ev = [];
    if (p.tenure != null) { const tPeers = G.role.filter((x) => x.tenure != null && Math.abs(x.tenure - p.tenure) <= 3); const tm = tPeers.length >= 3 ? r1(mean(tPeers.map((x) => x.index))) : null;
      if (p.tenure < 6) { bits.push("Nhân sự mới (" + p.tenure + " tháng)" + (tm != null && p.index != null ? ": so với người cùng thâm niên (TB " + vn(tm) + "%) thì đang " + (p.index >= tm - 5 ? "theo kịp đường cong học tập bình thường" : "chậm hơn " + vn(tm - p.index) + " điểm, cần kèm cặp sát hơn") : "") + ".");
        if (p.index != null && tm != null && p.index < tm - 5) hyp.push({ id: "onboard", score: 50, title: "Nhân sự mới chưa theo kịp đường cong học tập", for: ["Thâm niên " + p.tenure + " tháng.", "Thấp hơn người cùng thâm niên " + vn(tm - p.index) + " điểm."], against: [], verify: "Kiểm tra đã học đủ chương trình hội nhập chưa." }); }
      ev.push("Thâm niên: " + p.tenure + " tháng."); }
    if (kai90) bits.push("Đã chủ động hỏi Trợ lí KAI " + kai90 + " lần trong 90 ngày" + (kaiMed != null ? " (đồng nghiệp trung vị " + vn(kaiMed) + ")" : "") + ": có nhu cầu học, nên gợi ý đúng học liệu cho mảng yếu.");
    else bits.push("Chưa hỏi Trợ lí KAI trong 90 ngày" + (kaiMed ? " trong khi đồng nghiệp trung vị hỏi " + vn(kaiMed) + " lần" : "") + ": chưa tận dụng công cụ tự học.");
    if (days != null && days > 120) bits.push("Bài kiểm tra gần nhất đã " + days + " ngày: dữ liệu năng lực có thể đã cũ, nên cho kiểm tra lại trước khi quyết định đào tạo.");
    if (p.programs) ev.push("Đã đăng ký " + p.programs + " chương trình học.");
    facts.engagement = { tenure: p.tenure, kai90, kaiPeerMedian: kaiMed, programs: p.programs || 0, daysSinceTest: days };
    lenses.push({ id: "engage", name: "Chủ động học tập & bối cảnh", level: days != null && days > 120 ? "watch" : kai90 || p.programs ? "good" : "ok", insight: bits.join(" "), evidence: ev });
    if (!kai90 && (facts.areas || []).some((a) => a.kind === "personal")) plan.push({ hid: "engage", t: "Hướng dẫn dùng Trợ lí KAI để tra nhanh mảng còn yếu khi đang tư vấn khách.", who: "Quản lí", when: "1 tuần", kpi: "Có ≥ 5 câu hỏi KAI về mảng yếu trong tháng" });
  }

  // ---------- TỔNG HỢP: chẩn đoán chính (giả thuyết có điểm cao nhất) + phản bác ----------
  const personal = (facts.areas || []).filter((a) => a.kind === "personal");
  if (personal.length) hyp.push({ id: "gap", score: 50 + Math.min(15, -personal[0].gap / 2), title: "Lỗ hổng kiến thức cá nhân ở " + personal.map((a) => a.name).join(", "), for: personal.map((a) => a.name + " " + vn(a.pct) + "%, đồng nghiệp " + vn(a.peer) + "%."), against: [], verify: "Hỏi nhanh 3 câu tình huống của mảng này trong buổi 1-1." });
  const sharedA = (facts.areas || []).filter((a) => a.kind === "shared");
  if (sharedA.length) hyp.push({ id: "content", score: 35, title: "Nội dung / chương trình đào tạo mảng " + sharedA[0].name + " chưa hiệu quả", for: ["Cả nhóm cùng vị trí chỉ đạt TB " + vn(sharedA[0].peer) + "%."], against: [], verify: "Xem tỉ lệ đúng từng câu của mảng này ở cả hệ thống (có câu hỏi gây nhầm không)." });
  const pos = facts.position || {};
  if (pos.pctile >= 80 && (!facts.sales || facts.sales.avg3 >= 100)) hyp.push({ id: "star", score: 60, title: "Nhân sự nòng cốt: có thể giao vai trò kèm cặp", for: ["Cao hơn " + pos.pctile + "% đồng nghiệp.", facts.sales ? "Bán " + vn(facts.sales.avg3) + "% chỉ tiêu." : ""].filter(Boolean), against: [], verify: "Hỏi nguyện vọng chia sẻ kinh nghiệm / kèm người mới." });
  // phản bác chéo: giả thuyết này yếu đi vì bằng chứng của góc nhìn khác
  const has = (id) => hyp.some((h) => h.id === id);
  hyp.forEach((h) => {
    if (h.id === "gap" && has("team")) { h.against.push("Cả đội cũng thấp: một phần vấn đề ở cấp đội."); h.score -= 10; }
    if (h.id === "gap" && has("rush")) { h.against.push("Có dấu hiệu làm vội: điểm mảng có thể thấp hơn kiến thức thật."); h.score -= 10; }
    if (h.id === "skill" && facts.trend && facts.trend.slope != null && facts.trend.slope < -4) h.against.push("Điểm kiến thức đang giảm: có thể kiến thức cũng là một phần nguyên nhân.");
    if (h.id === "decline" && has("content")) { h.against.push("Mảng yếu cũng yếu ở cả nhóm: đề các kỳ sau có thể khó hơn."); h.score -= 10; }
    if (h.id === "team" && personal.length) h.against.push("Vẫn có mảng thấp hơn đồng nghiệp cùng vị trí: không hoàn toàn do đội.");
  });
  // MÂU THUẪN giữa các góc nhìn: chỗ đáng giá nhất để quản lí đào sâu
  const contra = [], skA = (facts.areas || []).find((a) => a.id === "sk"), tr = facts.trend || {};
  if (skA && skA.pct >= 75 && facts.sales && facts.sales.avg3 < 85) { contra.push("Làm đúng " + vn(skA.pct) + "% câu hỏi về kỹ năng bán nhưng chỉ đạt " + vn(facts.sales.avg3) + "% chỉ tiêu: khoảng cách giữa \"biết\" và \"làm\". Cần huấn luyện tại điểm bán, không phải thêm lớp học."); const h = hyp.find((x) => x.id === "skill"); if (h) { h.for.push("Lý thuyết kỹ năng bán " + vn(skA.pct) + "% nhưng doanh số thấp."); h.score += 5; } }
  if (pos.pctile >= 60 && tr.slope != null && tr.slope <= -3) contra.push("Vẫn đứng nửa trên đồng nghiệp nhưng điểm đang giảm " + vn(-tr.slope) + " điểm/kỳ: thứ hạng hiện tại che khuất xu hướng xấu.");
  if (facts.engagement && facts.engagement.kai90 >= 10 && tr.slope != null && tr.slope <= 0) contra.push("Hỏi KAI nhiều (" + facts.engagement.kai90 + " lần/90 ngày) nhưng điểm không tăng: có thể đang hỏi để xử lý tình huống tức thời chứ chưa học có hệ thống, hoặc hỏi chưa đúng mảng yếu.");
  if (facts.sales && facts.sales.avg3 >= 100 && pos.pctile != null && pos.pctile < 30) contra.push("Bán vượt chỉ tiêu dù kiến thức thuộc nhóm thấp: kinh nghiệm thực tế có thể chưa được bài kiểm tra đo đúng, hoặc rủi ro tư vấn sai khi sản phẩm mới ra.");
  hyp.sort((a, b) => b.score - a.score);
  const rank = {}; hyp.forEach((h, i) => { rank[h.id] = i; });
  plan.sort((a, b) => (rank[a.hid] != null ? rank[a.hid] : 99) - (rank[b.hid] != null ? rank[b.hid] : 99));
  const conf = (() => { const n = p.tests || 0, s = facts.sales ? 1 : 0; return n >= 3 && s ? "cao" : n >= 2 || (n >= 1 && s) ? "vừa" : "thấp"; })();
  const top = hyp[0];
  const headline = top ? { title: top.title, text: "Đối chiếu " + lenses.filter((l) => l.level !== "na").length + " góc nhìn. Bằng chứng chính: " + top.for.join(" ") + " " + (top.against.length ? "Cần lưu ý: " + top.against[0] : "Chưa thấy bằng chứng phản bác từ các góc nhìn khác.") + (top.verify ? " Kiểm chứng trước khi hành động: " + top.verify : ""), confidence: conf }
    : { title: p.tests ? "Chưa thấy vấn đề nổi bật" : "Chưa đủ dữ liệu để chẩn đoán", text: p.tests ? "Các góc nhìn không cho thấy điểm nghẽn rõ ràng; nên đặt mục tiêu nâng cao ở mảng thấp nhất." : "Cần ít nhất một bài kiểm tra chính thức và số liệu bán hàng khớp mã nhân viên.", confidence: conf };
  if (!questions.length && personal.length) questions.push("Trong mảng " + personal[0].name + ", tình huống nào với khách hàng làm em lúng túng nhất?");
  questions.push("Em muốn được hỗ trợ cụ thể điều gì nhất trong tháng tới (tài liệu, đi thị trường cùng, thời gian ôn)?");
  if (!plan.length) plan.push({ t: "Đặt mục tiêu nâng mảng thấp nhất thêm 10 điểm ở kỳ tới.", who: "Nhân viên", when: "Kỳ tới", kpi: "Mảng thấp nhất +10 điểm" });

  const res = { ok: true, code: p.code, generatedAt: Date.now(), cachedAt: H.cachedAt, headline, hypotheses: hyp.slice(0, 4), contradictions: contra, lenses, questions: questions.slice(0, 4), plan: plan.slice(0, 5), facts,
    method: "Đối chiếu 7 góc nhìn; mốc so sánh là đồng nghiệp cùng vị trí (" + (G.role.length) + " người), cùng đội (" + G.team.length + "), toàn hệ thống (" + G.all.length + ")." };
  Object.defineProperty(res, "_names", { value: [p.name, p.manager, p.code], enumerable: false }); // chỉ để ẩn danh khi gửi AI
  return res;
}

// ---------------------------------------------------------------------------------------------
// AI: viết lại thành phân tích sâu, DỰA TRÊN gói bằng chứng ở trên (ẩn danh). Kiểm tra số liệu AI đưa ra.
const llm = require("./llm");
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const SYSTEM = [
  "Bạn là chuyên gia phát triển năng lực đội ngũ bán hàng kênh GT (ngành 1: máy lọc nước Karofi, Livotec; ngành 2: điện gia dụng Livotec), viết cho QUẢN LÍ TRỰC TIẾP đọc trong 2 phút. Tiếng Việt, rõ ràng, không sáo rỗng.",
  "Bạn nhận GÓI BẰNG CHỨNG đã tính sẵn từ 7 góc nhìn. Nhiệm vụ: TAM GIÁC HOÁ các góc nhìn để tìm ĐIỂM NGHẼN THẬT, không liệt kê lại số.",
  "Quy tắc bắt buộc: (1) Mỗi nhận định phải có mốc so sánh (đồng nghiệp, đội, kỳ trước) và trả lời 'vậy thì sao / quản lí nên làm gì khác'. (2) Phân biệt rõ vấn đề nằm ở cá nhân, cấp đội, nội dung đào tạo, kỹ năng bán hay thị trường. (3) Với chẩn đoán chính, nêu ít nhất một giả thuyết cạnh tranh và bằng chứng nào sẽ phân định. (4) Chỉ ra các điểm MÂU THUẪN giữa góc nhìn (vd kiến thức tốt nhưng bán kém) vì đó là chỗ đáng giá nhất. (5) Kế hoạch có người làm, thời hạn và chỉ số đo được.",
  "CẤM các câu chung chung như 'cần cố gắng hơn', 'tiếp tục phát huy', 'nâng cao kiến thức', 'cần chú ý', 'tham gia đào tạo' nếu không nói rõ mảng nào, bằng cách nào, đo bằng gì.",
  "CHỈ dùng số có trong gói bằng chứng, không bịa số. Không kết luận nhân quả chắc chắn; dùng 'nhiều khả năng', 'cần kiểm chứng'. Không đề xuất kỷ luật, hạ bậc, cho nghỉ. Rời màn hình / làm nhanh chỉ là tín hiệu, không phải bằng chứng gian lận.",
  "Chỉ trả về MỘT JSON: {\"ket_luan\":string (1 câu, điểm nghẽn chính và nên làm gì),\"chan_doan\":[{\"gia_thuyet\":string,\"ung_ho\":[string],\"phan_bac\":[string],\"cach_kiem_chung\":string,\"do_tin_cay\":\"cao|vừa|thấp\"}] (2-3 mục, xếp theo khả năng),\"mau_thuan\":[string] (0-3),\"goc_nhin\":[{\"goc\":string,\"nhan_dinh\":string,\"ham_y\":string}] (3-6 mục, chỉ góc có dữ liệu),\"cau_hoi_1_1\":[string] (3-5 câu hỏi mở),\"ke_hoach_30_ngay\":[{\"viec\":string,\"ai\":string,\"thoi_han\":string,\"chi_so\":string}] (2-4),\"neu_khong_lam\":string}."
].join(" ") + " " + require("./hrcontext").CONTEXT;

function pack(r) { // gói bằng chứng ẩn danh: không tên, email, SĐT, tên quản lí
  const o = packRaw(r); let t = JSON.stringify(o);
  (r._names || []).filter((x) => x && String(x).length >= 4).forEach((x, i) => { t = t.split(x).join(i ? "QL" : "NV1"); });
  return JSON.parse(t);
}
function packRaw(r) {
  const f = r.facts || {};
  return { nhan_su: "NV1", goc_nhin: r.lenses.filter((l) => l.level !== "na").map((l) => ({ goc: l.name, muc: LV[l.level], nhan_dinh_luat: l.insight, bang_chung: l.evidence })),
    gia_thuyet_luat: r.hypotheses.map((h) => ({ gia_thuyet: h.title, ung_ho: h.for, phan_bac: h.against })), mau_thuan_luat: r.contradictions || [],
    so_lieu: { vi_the: f.position, mang: (f.areas || []).map((a) => ({ mang: a.name, ty_le: a.pct, so_cau: a.n, dong_nghiep: a.peer, chenh: a.gap, loai: a.kind, chu_de_yeu: a.topics })), xu_huong: f.trend && { so_ky: f.trend.periods, diem_tung_ky: f.trend.series.map((x) => x.best), do_doc: f.trend.slope, dao_dong: f.trend.volatility, tang_khi_lam_lai: f.trend.retakeGain },
      hanh_vi: f.behavior, ban_hang: f.sales, doi: f.team && { so_nguoi: f.team.n, tb_doi: f.team.teamMean, tb_he_thong: f.team.overallMean }, hoc_tap: f.engagement } };
}
function numbersIn(t) { return (String(t || "").match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", "."))); }
async function ai(code, opt) {
  const r = await analyze(code, opt);
  if (!r.ok) return r;
  if (r.left) return { ok: false, error: "Nhân sự đã nghỉ việc." };
  const P = pack(r), allowed = new Set(numbersIn(JSON.stringify(P)).map((x) => Math.round(x)));
  let text; try { text = await llm.chat([{ role: "system", content: SYSTEM }, { role: "user", content: "Gói bằng chứng (JSON):\n" + JSON.stringify(P) + "\n\nViết phân tích đa chiều theo đúng khung JSON." }], { temperature: 0.35, max_tokens: 1800, task: "person-360", json: true, timeoutMs: 30000 }); }
  catch (e) { return { ok: false, error: "AI tạm thời không khả dụng, vui lòng thử lại sau. Nhận định theo luật ở trên vẫn dùng được." }; }
  const t = String(text || ""), a = t.indexOf("{"), b = t.lastIndexOf("}"); let o = null; try { o = JSON.parse(t.slice(a, b + 1)); } catch (e) { o = null; }
  if (!o || !o.ket_luan) return { ok: false, error: "AI trả về kết quả không đọc được, vui lòng thử lại." };
  const L = (v, n, len) => (Array.isArray(v) ? v.slice(0, n).map((x) => s(x, len || 300)).filter(Boolean) : []);
  const out = {
    ket_luan: s(o.ket_luan, 400),
    chan_doan: (Array.isArray(o.chan_doan) ? o.chan_doan : []).slice(0, 3).map((x) => ({ gia_thuyet: s(x.gia_thuyet, 240), ung_ho: L(x.ung_ho, 3), phan_bac: L(x.phan_bac, 3), cach_kiem_chung: s(x.cach_kiem_chung, 300), do_tin_cay: ["cao", "vừa", "thấp"].indexOf(s(x.do_tin_cay, 6)) >= 0 ? s(x.do_tin_cay, 6) : "thấp" })).filter((x) => x.gia_thuyet),
    mau_thuan: L(o.mau_thuan, 3),
    goc_nhin: (Array.isArray(o.goc_nhin) ? o.goc_nhin : []).slice(0, 6).map((x) => ({ goc: s(x.goc, 80), nhan_dinh: s(x.nhan_dinh, 500), ham_y: s(x.ham_y, 300) })).filter((x) => x.nhan_dinh),
    cau_hoi_1_1: L(o.cau_hoi_1_1, 5, 240),
    ke_hoach_30_ngay: (Array.isArray(o.ke_hoach_30_ngay) ? o.ke_hoach_30_ngay : []).slice(0, 4).map((x) => ({ viec: s(x.viec, 300), ai: s(x.ai, 60), thoi_han: s(x.thoi_han, 40), chi_so: s(x.chi_so, 200) })).filter((x) => x.viec),
    neu_khong_lam: s(o.neu_khong_lam, 300)
  };
  // số lạ (không có trong gói bằng chứng, trừ số nhỏ ≤ 31 dùng cho ngày/tuần/số lượng) -> cảnh báo người đọc
  const odd = numbersIn(JSON.stringify(out)).map((x) => Math.round(x)).filter((x) => x > 31 && !allowed.has(x) && !allowed.has(x - 1) && !allowed.has(x + 1));
  return { ok: true, code: r.code, ai: out, warn: odd.length ? "AI có nhắc " + odd.length + " con số không có trong dữ liệu gốc (" + Array.from(new Set(odd)).slice(0, 5).join(", ") + "): hãy đối chiếu trước khi dùng." : "" };
}

module.exports = { analyze, ai, pctile, slope, pack, SYSTEM };

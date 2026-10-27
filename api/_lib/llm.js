// Gọi mô hình ngôn ngữ (Azure OpenAI trước, Groq dự phòng) từ phía máy chủ. Không trả tên mô hình / lỗi gốc ra ngoài.
// Độ ổn định:
//  - CÓ HẠN CHÓT TỔNG (opt.timeoutMs, mặc định 25 giây) và HẠN CHÓT RIÊNG cho từng nhà cung cấp: Azure chậm (không lỗi)
//    không còn chiếm hết thời gian; Groq luôn còn phần thời gian của mình. Yêu cầu quá hạn bị HUỶ thật (AbortController).
//  - 429 / 5xx / mất kết nối: chuyển nguồn dự phòng; nguồn cuối thì thử lại 1 lần (chờ ngắn có ngẫu nhiên) nếu còn thời gian.
//  - opt.json: bật chế độ bắt buộc trả JSON (response_format). Nhà cung cấp không hỗ trợ (lỗi 400) -> tự gửi lại không kèm tuỳ chọn.
//  - Mô hình suy luận trên Groq (gpt-oss): đặt mức suy luận thấp và không trả phần suy luận, để không tốn hết lượt chữ.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function contentOf(j) { const t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; return t ? String(t).trim() : ""; }
async function post(url, headers, body, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), Math.max(200, ms));
  try {
    const r = await fetch(url, { method: "POST", signal: ac.signal, headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body) });
    if (!r.ok) { const e = new Error("upstream " + r.status); e.status = r.status; throw e; }
    const txt = contentOf(await r.json());
    if (!txt) { const e = new Error("empty"); e.status = 502; throw e; }
    return txt;
  } catch (e) {
    if (e && e.name === "AbortError") { const x = new Error("timeout"); x.status = 504; throw x; }
    throw e;
  } finally { clearTimeout(t); }
}
function providers(opt) {
  const list = [];
  const ep = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""), key = process.env.AZURE_OPENAI_KEY, dep = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (ep && key && dep) list.push({ name: "azure", url: ep + "/chat/completions", headers: { "api-key": key, Authorization: "Bearer " + key }, base: { model: dep }, extra: opt.json ? { response_format: { type: "json_object" } } : {} });
  const gk = process.env.GROQ_API_KEY;
  if (gk) {
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b", reasoning = /gpt-oss|qwen|deepseek|r1/i.test(model);
    list.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", headers: { Authorization: "Bearer " + gk }, base: Object.assign({ model }, reasoning ? { reasoning_effort: "low" } : {}),
      extra: Object.assign(opt.json ? { response_format: { type: "json_object" } } : {}, reasoning ? { include_reasoning: false } : {}) });
  }
  return list;
}
async function chat(messages, opt) {
  opt = opt || {};
  if (process.env.AI_MODE === "mock") return mock(opt);   // chỉ dùng khi chạy thử trên máy
  const temperature = typeof opt.temperature === "number" ? opt.temperature : 0.35, max_tokens = Math.min(opt.max_tokens || 900, 4000);
  const list = providers(opt);
  if (!list.length) { const e = new Error("not configured"); e.status = 503; throw e; }
  const deadline = Date.now() + Math.max(1500, opt.timeoutMs || 25000);
  let lastErr = null;
  for (let i = 0; i < list.length; i++) {
    const P = list[i], isLast = i === list.length - 1;
    for (let attempt = 0; attempt < (isLast ? 2 : 1); attempt++) {
      const left = deadline - Date.now();
      if (left < 600) break;
      // Nguồn đầu (khi còn nguồn sau) chỉ dùng tối đa 60% thời gian còn lại, phần còn lại để dành cho nguồn dự phòng
      const budget = isLast ? left : Math.max(800, Math.floor(left * 0.6));
      const body = Object.assign({ messages, temperature, max_tokens }, P.base, P.extra);
      try {
        return await post(P.url, P.headers, body, budget);
      } catch (e) {
        lastErr = e;
        if (e.status === 400 && Object.keys(P.extra).length) { // tuỳ chọn không được hỗ trợ: gửi lại ngay, bỏ tuỳ chọn
          P.extra = {};
          try { return await post(P.url, P.headers, Object.assign({ messages, temperature, max_tokens }, P.base), Math.max(600, deadline - Date.now() - (isLast ? 0 : 1500))); } catch (e2) { lastErr = e2; }
        }
        const retryable = !e.status || e.status === 429 || e.status >= 500;
        if (!(isLast && retryable && attempt === 0)) break;
        await sleep(Math.min(1200, 300 + Math.floor(Math.random() * 500), Math.max(0, deadline - Date.now() - 1000)));
      }
    }
  }
  throw lastErr || Object.assign(new Error("failed"), { status: 502 });
}
function mock(o) {
  if (o.task === "ks_draft") return JSON.stringify({ title: "Khảo sát mẫu (AI giả lập)", description: "Mô tả do AI giả lập soạn.", questions: [
    { id: "q1", type: "nps", text: "Bạn có sẵn lòng giới thiệu chương trình này không?", required: true },
    { id: "q2", type: "text", text: "Điều gì khiến bạn chưa sẵn sàng giới thiệu?", multiline: true, showIf: { mode: "all", rules: [{ q: "q1", op: "lte", v: 6 }] } },
    { id: "q3", type: "multi", text: "Bạn muốn đào tạo thêm nội dung nào?", options: ["Sản phẩm", "Bán hàng", "Chính sách"], max: 2 }] });
  if (o.task === "ks_review") return JSON.stringify({ tong_quan: "Bộ câu hỏi nhìn chung ổn (giả lập).", ghi_chu: [{ cau: 1, loai: "dan_dat", van_de: "Câu hỏi có thể dẫn dắt người trả lời.", goi_y: "Viết trung lập hơn.", viet_lai: "Bạn đánh giá thế nào về chương trình?" }] });
  if (o.task === "ks_analyze") return JSON.stringify({ tom_tat: ["Mức hài lòng nhìn chung khá (giả lập)."], diem_manh: ["Nội dung dễ hiểu"], van_de: ["Thời lượng chưa phù hợp"], chu_de: [{ ten: "Thời lượng", muc_do: "vừa", mo_ta: "Nhiều ý kiến về thời lượng.", trich_dan: [] }], de_xuat: [{ viec: "Rút ngắn mỗi buổi", ly_do: "Nhiều phản hồi về thời lượng", uu_tien: "cao" }], luu_y: "Mẫu nhỏ, kết quả chỉ mang tính tham khảo (giả lập)." });
  if (o.task === "brief") return "- Võ Đăng Khoa: gọi ngay để gỡ vướng đại lý nợ.\n- Huỳnh Quốc Nam: nhắc gửi bù 3 ngày báo cáo.\n- Lê Anh Tuấn: tụt tiến độ, cùng rà 5 đại lý lớn.\nNhận định chung: nhóm đang chậm so với mốc, cần tập trung vào người tụt tiến độ.";
  if (o.task === "analyze") {
    const ids = o.ids || [], ci = ["khan", "chu_y", "chu_y", "thong_tin", "thong_tin", "thong_tin"];
    const cb = ids.slice(0, 6).map((id, i) => ({ id, muc: ci[i], tieu_de: "Mock cảnh báo " + id, ly_do: i === 0 ? id + " có bc_hom_nay = 'quá giờ', doanh_so_ngay = 0" : "Mock: doanh số xu hướng giảm so với tuần trước.", hanh_dong: "Mock: gọi điện và rà 5 đại lý lớn." }));
    cb.push({ id: "team", muc: "chu_y", tieu_de: "Mock cảnh báo chung", ly_do: "Mock: cả nhóm dưới mốc.", hanh_dong: "Mock: họp nhanh đầu ngày." });
    cb.push({ id: ids[0], muc: "chu_y", tieu_de: "Mock lộ", ly_do: "giá trị foo_bar_baz bất thường", hanh_dong: "x" });
    return JSON.stringify({ canh_bao: cb, uu_tien: ["Mock ưu tiên 1", "Mock ưu tiên 2"], nhan_dinh: "Mock: nhóm đang chậm so với mốc." });
  }
  if (o.task === "plan") return JSON.stringify((o.ids || []).map((id) => ({ id, text: "Mock trọng tâm cho " + id + ": chốt đơn đã hẹn." })));
  if (o.task === "coach") return "- Điểm tốt: giữ đều lượt ghé.\n- Rủi ro: độ phủ thấp hơn tiến độ.\n- Hành động: mở thêm 2 điểm bán mới mỗi ngày.";
  return "Mock: ưu tiên chốt các đơn đã hẹn trong ngày mai.";
}
module.exports = { chat };

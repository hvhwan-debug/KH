// Gọi mô hình ngôn ngữ (Azure OpenAI trước, Groq dự phòng) từ phía máy chủ. Không trả tên mô hình / lỗi gốc ra ngoài.
async function chat(messages, opt) {
  opt = opt || {};
  if (process.env.AI_MODE === "mock") return mock(opt);   // chỉ dùng khi chạy thử trên máy
  const temperature = typeof opt.temperature === "number" ? opt.temperature : 0.35, max_tokens = Math.min(opt.max_tokens || 900, 1500);
  const ep = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""), key = process.env.AZURE_OPENAI_KEY, dep = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (ep && key && dep) {
    try {
      const r = await fetch(ep + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "api-key": key, Authorization: "Bearer " + key }, body: JSON.stringify({ model: dep, messages, temperature, max_tokens }) });
      if (r.ok) { const j = await r.json(); const t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; if (t) return String(t).trim(); }
    } catch (e) { /* thử nguồn dự phòng */ }
  }
  const gk = process.env.GROQ_API_KEY;
  if (!gk) { const e = new Error("not configured"); e.status = 503; throw e; }
  const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + gk }, body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", messages, temperature, max_tokens, reasoning_effort: "low" }) });
  if (!r2.ok) { const e = new Error("upstream " + r2.status); e.status = r2.status; throw e; }
  const j2 = await r2.json(); const t2 = j2 && j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content;
  if (!t2) { const e = new Error("empty"); e.status = 502; throw e; }
  return String(t2).trim();
}
function mock(o) {
  if (o.task === "brief") return "- Võ Đăng Khoa: gọi ngay để gỡ vướng đại lý nợ.\n- Huỳnh Quốc Nam: nhắc gửi bù 3 ngày báo cáo.\n- Lê Anh Tuấn: tụt tiến độ, cùng rà 5 đại lý lớn.\nNhận định chung: nhóm đang chậm so với mốc, cần tập trung vào người tụt tiến độ.";
  if (o.task === "plan") return JSON.stringify((o.ids || []).map((id) => ({ id, text: "Mock trọng tâm cho " + id + ": chốt đơn đã hẹn." })));
  if (o.task === "coach") return "- Điểm tốt: giữ nhịp ghé đều.\n- Rủi ro: độ phủ thấp hơn tiến độ.\n- Hành động: mở thêm 2 điểm bán mới mỗi ngày.";
  return "Mock: ưu tiên chốt các đơn đã hẹn trong ngày mai.";
}
module.exports = { chat };

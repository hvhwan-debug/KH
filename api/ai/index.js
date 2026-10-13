// Proxy goi AI (Azure OpenAI truoc, Groq du phong). Khong bao gio tra ve cho trinh duyet: ten mo hinh,
// nha cung cap, hay noi dung loi goc tu nha cung cap - chi tra ve phan noi dung tra loi (choices) va thong bao loi an toan.
module.exports = async function (context, req) {
  const body = req.body || {};
  if (!Array.isArray(body.messages) || !body.messages.length) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Thiếu messages trong yêu cầu." } };
    return;
  }

  // Chặn lạm dụng: giới hạn số tin nhắn và tổng độ dài (áp dụng chung cho cả 2 nguồn)
  const totalChars = body.messages.reduce((a, m) => a + String((m && m.content) || "").length, 0);
  if (body.messages.length > 12 || totalChars > 24000) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Yêu cầu quá dài." } };
    return;
  }

  const temperature = typeof body.temperature === "number" ? body.temperature : 0.4;
  const max_tokens = typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2000) : 1200;

  // Chỉ giữ lại phần nội dung trả lời (choices) trước khi gửi về trình duyệt - không để lộ tên mô hình,
  // id, nhà cung cấp hay bất kỳ trường nào khác trong response gốc.
  const sanitize = (data) => ({ choices: Array.isArray(data && data.choices) ? data.choices.map((c) => ({ message: { role: "assistant", content: c && c.message && c.message.content } })) : [] });
  const genericError = (status) => (status === 429 ? "Đang có nhiều người hỏi cùng lúc, thử lại sau ít phút." : "Trợ lý đang bận, thử lại sau.");

  const azureEndpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
  const azureKey = process.env.AZURE_OPENAI_KEY;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  // ---- 1) Thử Azure OpenAI trước (nguồn chính) ----
  if (azureEndpoint && azureKey && azureDeployment) {
    try {
      const url = azureEndpoint + "/chat/completions";
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": azureKey, "Authorization": "Bearer " + azureKey },
        body: JSON.stringify({ model: azureDeployment, messages: body.messages, temperature, max_tokens })
      });
      if (upstream.ok) {
        const data = await upstream.json();
        context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: sanitize(data) };
        return;
      }
      context.log("Azure OpenAI trả lỗi HTTP " + upstream.status + ", chuyển sang Groq dự phòng.");
    } catch (e) {
      context.log("Azure OpenAI lỗi kết nối: " + (e && e.message) + ", chuyển sang Groq dự phòng.");
    }
  }

  // ---- 2) Dự phòng: Groq ----
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Trợ lý AI chưa được cấu hình trên server." } };
    return;
  }
  const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  try {
    const upstream2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + groqKey },
      body: JSON.stringify({ model: GROQ_MODEL, messages: body.messages, temperature, max_tokens, reasoning_effort: "low" })
    });
    if (!upstream2.ok) {
      context.log("Groq trả lỗi HTTP " + upstream2.status);
      context.res = { status: upstream2.status, headers: { "Content-Type": "application/json" }, body: { error: genericError(upstream2.status) } };
      return;
    }
    const data2 = await upstream2.json();
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: sanitize(data2) };
  } catch (e2) {
    context.log("Groq lỗi kết nối: " + (e2 && e2.message));
    context.res = { status: 502, headers: { "Content-Type": "application/json" }, body: { error: "Trợ lý đang bận, thử lại sau." } };
  }
};

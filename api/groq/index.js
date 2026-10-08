module.exports = async function (context, req) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "GROQ_API_KEY chưa được cấu hình trên server (Configuration > Application settings)." }
    };
    return;
  }

  // Model do server quyết định (đổi qua biến môi trường GROQ_MODEL, không cần sửa code khi Groq ngừng model)
  const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const body = req.body || {};
  if (!Array.isArray(body.messages) || !body.messages.length) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Thiếu messages trong yêu cầu." }
    };
    return;
  }

  // Chặn lạm dụng: giới hạn số tin nhắn và tổng độ dài
  const totalChars = body.messages.reduce((a, m) => a + String((m && m.content) || "").length, 0);
  if (body.messages.length > 12 || totalChars > 24000) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Yêu cầu quá dài." }
    };
    return;
  }

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: MODEL,
        messages: body.messages,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
        // gpt-oss là model suy luận: cần dư token để không bị cắt trước khi ra câu trả lời
        max_tokens: typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2000) : 1200,
        reasoning_effort: "low"
      })
    });

    const data = await upstream.json();
    context.res = {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
      body: data
    };
  } catch (e) {
    context.res = {
      status: 502,
      headers: { "Content-Type": "application/json" },
      body: { error: "Không gọi được Groq: " + (e && e.message ? e.message : String(e)) }
    };
  }
};

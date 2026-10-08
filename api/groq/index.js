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

  const body = req.body || {};
  if (!Array.isArray(body.messages) || !body.messages.length) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Thiếu messages trong yêu cầu." }
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
        model: body.model || "llama-3.3-70b-versatile",
        messages: body.messages,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 500
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

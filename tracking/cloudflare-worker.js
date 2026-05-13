const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

function textLine(label, value) {
  return `${label}: ${value || "-"}`;
}

function buildMessage(payload) {
  return [
    "Portfolio click",
    textLine("site", payload.site),
    textLine("id", payload.id),
    textLine("category", payload.category),
    textLine("label", payload.label),
    textLine("page", payload.page),
    textLine("href", payload.href),
    textLine("external", String(Boolean(payload.external))),
    textLine("target", payload.target),
    textLine("time", payload.timestamp)
  ].join("\n");
}

async function sendTelegramMessage(env, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: env.CHAT_ID,
      text: buildMessage(payload),
      disable_web_page_preview: true
    })
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result || !result.ok) {
    throw new Error("Telegram API request failed");
  }
}

function isAllowedOrigin(request, env) {
  const allowedOrigin = String(env.ALLOWED_ORIGIN || "").trim();

  if (!allowedOrigin) {
    return true;
  }

  const origin = request.headers.get("Origin");
  return origin === allowedOrigin;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (url.pathname !== "/track" || request.method !== "POST") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    if (!isAllowedOrigin(request, env)) {
      return json({ ok: false, error: "Origin not allowed" }, 403);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON payload" }, 400);
    }

    if (!payload || typeof payload.id !== "string" || typeof payload.page !== "string") {
      return json({ ok: false, error: "Missing required fields" }, 400);
    }

    try {
      await sendTelegramMessage(env, payload);
      return json({ ok: true });
    } catch (error) {
      return json({ ok: false, error: error.message || "Unknown error" }, 502);
    }
  }
};

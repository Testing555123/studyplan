// P7 · OpenCode Zen chat 半验证（20 行级 PoC）
// 对应 TECH-SELECTION.md P7 行 / L8 候选表：Vercel AI SDK 直连 Zen 的 space-bunny-free。
// 这里绕过 SDK，直接用 OpenAI 兼容端点验证「key + 模型可用」这一半。
//
// 运行：
//   set OPENCODE_API_KEY=你的key
//   node poc/p7-zen-chat.mjs
//
// 预期：HTTP 200 + 一段非空回复文本 → P7 chat 半通过。

const KEY = process.env.OPENCODE_API_KEY;
if (!KEY) {
  console.error("✗ OPENCODE_API_KEY 未设置（先 `set OPENCODE_API_KEY=...`）");
  process.exit(1);
}

const MODEL = process.env.OPENCODE_MODEL || "opencode/space-bunny-free";
const URL = "https://opencode.ai/zen/v1/chat/completions";

const res = await fetch(URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${KEY}`,
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 32,
  }),
});

console.log(`HTTP ${res.status} ${res.statusText}`);
const text = await res.text();
console.log(text.slice(0, 1000));

if (!res.ok) {
  console.error("✗ P7 chat 半未通过");
  process.exit(1);
}
try {
  const json = JSON.parse(text);
  const out = json?.choices?.[0]?.message?.content ?? "";
  if (!out.trim()) throw new Error("空回复");
  console.log(`✓ P7 chat 半通过（model=${MODEL}，回复 ${out.length} 字）`);
} catch (e) {
  console.error("✗ 响应解析失败：", e.message);
  process.exit(1);
}

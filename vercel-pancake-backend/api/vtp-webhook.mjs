// Webhook nhận hành trình đơn từ Viettel Post.
// VTP gửi POST JSON { DATA: {...}, TOKEN: "<token>" } mỗi khi vận đơn đổi trạng thái.
// Yêu cầu của VTP: trả HTTP 200 trong dưới 1 giây; bản trùng / sau trạng thái cuối cũng trả 200.
// Dữ liệu lưu vào Supabase qua hàm RPC public.vtp_ingest (bảng vtp_events + vtp_orders).
//
// Biến môi trường:
//   VTP_WEBHOOK_TOKEN  Token bảo mật khai trên Partner VTP (trường TOKEN trong body).
//   VTP_SUPABASE_URL   URL project Supabase.
//   VTP_SUPABASE_KEY   Publishable/anon key của Supabase.
//   VTP_INGEST_KEY     Khoá nội bộ khớp với bảng vtp_config.

const TOKEN = (process.env.VTP_WEBHOOK_TOKEN || '').trim();
const SB_URL = (process.env.VTP_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SB_KEY = (process.env.VTP_SUPABASE_KEY || '').trim();
const INGEST_KEY = (process.env.VTP_INGEST_KEY || '').trim();

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function ingest(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/vtp_ingest`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: INGEST_KEY, p_payload: payload }),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // GET/HEAD: để kiểm tra URL còn sống ("Kiểm tra kết nối").
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ ok: true, service: 'vtp-webhook' });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!TOKEN || !SB_URL || !SB_KEY || !INGEST_KEY) {
    console.error('[vtp-webhook] Thiếu biến môi trường');
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    // Body hỏng: trả 200 để VTP không kẹt hàng đợi, nhưng ghi log.
    console.warn('[vtp-webhook] Body không phải JSON');
    return res.status(200).json({ ok: true, result: 'invalid_json' });
  }

  if (!safeEqual(body?.TOKEN, TOKEN)) {
    console.warn('[vtp-webhook] Sai TOKEN');
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }

  // Request kiểm tra kết nối có thể không kèm DATA/ORDER_NUMBER.
  if (!body?.DATA?.ORDER_NUMBER) {
    return res.status(200).json({ ok: true, result: 'ping' });
  }

  try {
    const result = await ingest(body);
    console.log(`[vtp-webhook] ${body.DATA.ORDER_NUMBER} ${body.DATA.ORDER_STATUS} -> ${result}`);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    // Lỗi lưu: trả 500 để VTP gửi lại (tối đa 5 lần).
    console.error('[vtp-webhook] Lỗi lưu:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Store failed' });
  }
}

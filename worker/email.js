// Outbound email through Resend (https://resend.com). Optional: set the RESEND_API_KEY secret
// (and EMAIL_FROM, e.g. "Pravahax Suite <hub@yourdomain.com>", once your domain is verified).
export const emailConfigured = (env) => !!(env && env.RESEND_API_KEY);

const MAX_RECIPIENTS = 20;
const list = (v) => [].concat(v || []).flatMap((x) => (typeof x === 'string' ? x.split(',') : [x && (x.email || x.address)])).map((s) => String(s || '').trim()).filter((s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s));

export async function sendEmail(env, msg, who) {
  const to = list(msg.to), cc = list(msg.cc), bcc = list(msg.bcc);
  if (!to.length) return { delivered: [], failed: [], message: 'No valid recipient.' };
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) return { delivered: [], failed: to, message: 'Too many recipients.' };
  const from = env.EMAIL_FROM || 'Pravahax Suite <onboarding@resend.dev>';
  const body = {
    from, to, subject: String(msg.subject || '(no subject)').slice(0, 300),
    text: msg.text ? String(msg.text) : undefined,
    html: msg.html ? String(msg.html) : undefined,
  };
  if (cc.length) body.cc = cc;
  if (bcc.length) body.bcc = bcc;
  const reply = list(msg.reply_to || msg.replyTo)[0];
  if (reply) body.reply_to = reply;
  if (!body.text && !body.html) body.text = ' ';
  if (Array.isArray(msg.attachments) && msg.attachments.length) {
    body.attachments = [];
    for (const a of msg.attachments.slice(0, 10)) {
      let content = a.content;
      if (content && typeof content !== 'string') {
        const bytes = content instanceof Uint8Array ? content : typeof content.arrayBuffer === 'function' ? new Uint8Array(await content.arrayBuffer()) : null;
        if (!bytes) continue;
        let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
        content = btoa(s);
      }
      if (content) body.attachments.push({ filename: String(a.filename || 'attachment').slice(0, 120), content });
    }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { delivered: [], failed: to, message: (j && (j.message || (j.error && j.error.message))) || ('Mail service error ' + r.status) };
  return { delivered: to.concat(cc, bcc), failed: [], suppressed: [], id: j.id };
}

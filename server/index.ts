import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Nodemailer transport — sends via Mailpit's SMTP on localhost:1025
const transport = nodemailer.createTransport({
  host: 'localhost',
  port: 1025,
  secure: false,
  tls: false,
} as nodemailer.TransportOptions);

interface SendBody {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

// POST /api/send — send an email via Nodemailer (caught by Mailpit)
app.post('/api/send', async (req, res) => {
  const { to, cc, bcc, subject, html, text, from } = req.body as SendBody;
  if (!to || !subject) {
    return res.status(400).json({ error: 'Missing "to" or "subject" field' });
  }

  try {
    const info = await transport.sendMail({
      from: from || 'Typhoonpost <you@typhoonpost.app>',
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      html: html || text || '',
      text: text || undefined,
    });
    res.json({ success: true, messageId: info.messageId, response: info.response });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown SMTP error';
    res.status(502).json({ error: 'Failed to send email', detail: message });
  }
});

// GET /api/emails — fetch received messages from Mailpit REST API
app.get('/api/emails', async (_req, res) => {
  try {
    const resp = await fetch('http://localhost:8025/api/v1/messages', {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: 'Mailpit fetch failed',
        detail: `Mailpit returned ${resp.status}`,
      });
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown fetch error';
    res.status(502).json({
      error: 'Cannot reach Mailpit',
      detail: message,
    });
  }
});

// GET /api/emails/:id — fetch a single message detail from Mailpit
app.get('/api/emails/:id', async (req, res) => {
  try {
    const resp = await fetch(`http://localhost:8025/api/v1/message/${req.params.id}`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: 'Mailpit message fetch failed',
        detail: `Mailpit returned ${resp.status}`,
      });
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown fetch error';
    res.status(502).json({ error: 'Cannot reach Mailpit', detail: message });
  }
});

// DELETE /api/emails/:id — delete a message from Mailpit
app.delete('/api/emails/:id', async (req, res) => {
  try {
    const resp = await fetch(`http://localhost:8025/api/v1/message/${req.params.id}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: 'Mailpit delete failed',
        detail: `Mailpit returned ${resp.status}`,
      });
    }
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown delete error';
    res.status(502).json({ error: 'Cannot reach Mailpit', detail: message });
  }
});

app.listen(PORT, () => {
  console.log(`Typhoonpost backend running on http://localhost:${PORT}`);
});

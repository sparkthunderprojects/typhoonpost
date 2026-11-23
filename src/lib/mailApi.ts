export interface MailpitMessage {
  ID: string;
  From: { Address: string; Name: string };
  To: { Address: string; Name: string }[];
  Cc?: { Address: string; Name: string }[];
  Bcc?: { Address: string; Name: string }[];
  Subject: string;
  Size: number;
  Created: string;
  Read: boolean;
  Tags?: string[];
  Snippet: string;
}

export interface MailpitMessagesResponse {
  messages: MailpitMessage[];
  total: number;
  unread: number;
}

export interface MailpitMessageDetail {
  ID: string;
  From: { Address: string; Name: string };
  To: { Address: string; Name: string }[];
  Cc?: { Address: string; Name: string }[];
  Bcc?: { Address: string; Name: string }[];
  Subject: string;
  Date: string;
  HTML: string;
  Text: string;
  Attachments?: { ID: string; FileName: string; Size: number; ContentType: string }[];
}

export interface SendEmailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

const API_BASE = '/api';

export async function sendEmail(payload: SendEmailPayload): Promise<{ success: boolean; messageId?: string }> {
  const resp = await fetch(`${API_BASE}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Send failed' }));
    throw new Error(err.detail || err.error || 'Failed to send email');
  }
  return resp.json();
}

export async function fetchEmails(): Promise<MailpitMessagesResponse> {
  const resp = await fetch(`${API_BASE}/emails`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.detail || err.error || 'Failed to fetch emails');
  }
  return resp.json();
}

export async function fetchEmailDetail(id: string): Promise<MailpitMessageDetail> {
  const resp = await fetch(`${API_BASE}/emails/${id}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.detail || err.error || 'Failed to fetch email detail');
  }
  return resp.json();
}

export async function deleteEmail(id: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/emails/${id}`, { method: 'DELETE' });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(err.detail || err.error || 'Failed to delete email');
  }
}

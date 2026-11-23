// Webhook receiver for Resend "email.received" events.
// Secrets required: RESEND_API_KEY, RESEND_WEBHOOK_SECRET (whsec_...)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleInbound, type InboundDb } from './handler.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const db: InboundDb = {
  async findRecipients(addresses) {
    const { data: boxes, error } = await supabase.from('mailboxes').select('user_id, address').in('address', addresses);
    if (error) throw new Error(error.message);
    if (!boxes?.length) return [];
    const { data: keys, error: keyErr } = await supabase
      .from('user_keys')
      .select('user_id, public_key')
      .in('user_id', boxes.map((b) => b.user_id));
    if (keyErr) throw new Error(keyErr.message);
    const byUser = new Map((keys ?? []).map((k) => [k.user_id, k.public_key as string]));
    return boxes.map((b) => ({ user_id: b.user_id, address: b.address, public_key: byUser.get(b.user_id) ?? null }));
  },
  async insertEmail(row) {
    const { data, error } = await supabase
      .from('emails')
      .upsert(row, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(error.message);
    // Only a freshly inserted row is returned; a retried webhook inserts nothing twice.
    return (data?.length ?? 0) > 0;
  },
};

Deno.serve(async (req) => {
  try {
    return await handleInbound(
      req,
      { webhookSecret: Deno.env.get('RESEND_WEBHOOK_SECRET'), apiKey: Deno.env.get('RESEND_API_KEY') },
      db,
    );
  } catch (e) {
    // Never echo details of the message back; a 500 makes Resend retry.
    console.error('inbound failed:', e instanceof Error ? e.message : 'unknown error');
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

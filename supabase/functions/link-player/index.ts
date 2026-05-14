import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { action, email, player_id } = await req.json();

  if (action === 'list-users') {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return jsonResponse({ error: error.message }, 400);

    const safeUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      display_name: u.user_metadata?.display_name || null,
      created_at: u.created_at,
    }));
    return jsonResponse({ users: safeUsers });
  }

  if (action === 'link') {
    const { data: { users }, error: userErr } = await supabaseAdmin.auth.admin.listUsers();
    if (userErr) return jsonResponse({ error: userErr.message }, 400);
    const user = users.find(u => u.email === email);
    if (!user) return jsonResponse({ error: 'Usuário não encontrado com este email' }, 404);

    const { error } = await supabaseAdmin.from('players').update({ user_id: user.id }).eq('id', player_id);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ success: true, user_id: user.id, email });
  }

  if (action === 'unlink') {
    const { error } = await supabaseAdmin.from('players').update({ user_id: null }).eq('id', player_id);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: 'Invalid action' }, 400);
});

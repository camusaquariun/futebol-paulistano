import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const url = new URL(req.url);
  const email = url.searchParams.get('email') || 'admin@futebol.com';
  const password = url.searchParams.get('password') || 'admin123';

  const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { error: roleError } = await supabaseAdmin.from('user_roles').upsert({ user_id: user.user.id, role: 'admin' }, { onConflict: 'user_id' });

  return new Response(JSON.stringify({ userId: user.user.id, email: user.user.email, roleError: roleError?.message }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

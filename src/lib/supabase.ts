import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://euufoowdghcczoovulfq.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1dWZvb3dkZ2hjY3pvb3Z1bGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NTY3ODAsImV4cCI6MjA5MDIzMjc4MH0.D4ue1yXLWulLSW7pKHf_8S9NkdSgwg0yDM2QisRZmP8'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

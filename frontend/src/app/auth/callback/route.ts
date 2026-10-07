import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    try {
      const cookieStore = await cookies()
      const supabase = createClient(cookieStore)
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(`${origin}/app`)
      }
    } catch (e) {
      // Unconfigured Supabase env — fall through to the landing page.
      console.error(e)
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
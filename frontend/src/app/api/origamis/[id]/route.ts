import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ORIGAMI_TTL_MS } from "@/types/origami";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/origamis/:id — fetch a single origami (owner only).
 * Returns 404 and deletes the row if the origami has expired.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("origamis")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Expired — delete and report gone.
  const created = new Date(data.created_at).getTime();
  if (Date.now() - created > ORIGAMI_TTL_MS) {
    await supabase
      .from("origamis")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/** DELETE /api/origamis/:id — delete an origami (owner only). */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("origamis")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

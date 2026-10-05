import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ORIGAMI_TTL_MS, type OrigamiInsert } from "@/types/origami";

/** Cutoff timestamp — origamis created before this are expired. */
function cutoffIso(): string {
  return new Date(Date.now() - ORIGAMI_TTL_MS).toISOString();
}

/**
 * GET /api/origamis — list current user's live origamis (newest first).
 * Expired origamis are deleted as a side effect (lazy cleanup).
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lazy cleanup: delete anything past its 24-hour TTL.
  await supabase
    .from("origamis")
    .delete()
    .eq("user_id", user.id)
    .lt("created_at", cutoffIso());

  const { data, error } = await supabase
    .from("origamis")
    // Exclude fold_audio from the list — it's heavy; fetch on selection.
    .select("id,user_id,title,text,sections,voice,speed,created_at,updated_at")
    .eq("user_id", user.id)
    .gte("created_at", cutoffIso())
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** POST /api/origamis — create a new origami for the current user. */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: OrigamiInsert;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const insert = {
    user_id: user.id,
    title: body.title || "Untitled",
    text: body.text,
    sections: body.sections ?? [],
    voice: body.voice ?? null,
    speed: body.speed ?? 1.0,
    fold_audio: body.fold_audio ?? [],
  };

  const { data, error } = await supabase
    .from("origamis")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

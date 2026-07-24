import { NextResponse } from "next/server";
import { rotateSession } from "@/lib/auth/session";

export async function POST() {
  const user = await rotateSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true });
}

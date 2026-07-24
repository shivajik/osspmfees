import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { permissionsForRole } from "@/lib/auth/rbac";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      instituteId: user.instituteId,
      permissions: permissionsForRole(user.role),
    },
  });
}

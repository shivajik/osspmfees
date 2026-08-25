import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { ChangePasswordGate } from "./_form";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  if (!user.mustChangePassword) redirect("/dashboard");
  return <ChangePasswordGate email={user.email} />;
}

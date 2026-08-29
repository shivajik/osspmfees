import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordForm } from "./_change-password";
import { EditProfileForm } from "./_edit-profile";
import { store } from "@/lib/db/store";
import { formatDate } from "@/lib/utils";

export default async function ProfilePage() {
  const user = await requireUser();
  const inst = user.instituteId ? store.institutes.get(user.instituteId) : null;
  return (
    <>
      <PageHeader title="My profile" description="Account details and security" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Account</CardTitle>
              <CardDescription>Email is your sign-in ID and can&apos;t be changed here</CardDescription>
            </div>
          </CardHeader>
          <dl className="mb-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fg-muted)]">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fg-muted)]">Role</dt>
              <dd><Badge tone="brand">{user.role.replace("_", " ")}</Badge></dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fg-muted)]">Institute</dt>
              <dd className="font-medium">{inst?.name ?? "— Platform"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fg-muted)]">Member since</dt>
              <dd className="font-medium">{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
          <div className="border-t border-[var(--color-border)] pt-4">
            <EditProfileForm name={user.name} phone={user.phone} />
          </div>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Min 10 chars, upper + lower + digit</CardDescription>
            </div>
          </CardHeader>
          <ChangePasswordForm />
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Security</CardTitle>
              <CardDescription>Session hardening</CardDescription>
            </div>
          </CardHeader>
          <ul className="space-y-2 text-sm text-[var(--color-fg-muted)]">
            <li>✓ HTTP-only, SameSite=Lax session cookies</li>
            <li>✓ Access + rotating refresh tokens (JWT / HS256)</li>
            <li>✓ Bcrypt password hashing (12 rounds)</li>
            <li>✓ Auto-lock after 5 failed logins (15 min cooldown)</li>
            <li>✓ Per-IP rate limiting on API routes</li>
            <li>✓ Security headers (X-Frame-Options, nosniff, referrer, permissions)</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

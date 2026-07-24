import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Profile" description="Your account details and session." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Account</CardTitle><CardDescription>Signed-in identity</CardDescription></div>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <Row k="Name" v={user.name} />
            <Row k="Email" v={user.email} />
            <Row k="Role" v={<Badge tone="brand">{user.role.replace("_", " ")}</Badge>} />
            <Row k="Tenant" v={user.instituteId ?? "Platform"} />
            <Row k="Created" v={new Date(user.createdAt).toLocaleString()} />
          </dl>
        </Card>
        <Card>
          <CardHeader>
            <div><CardTitle>Security</CardTitle><CardDescription>Session hardening</CardDescription></div>
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

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2 last:border-b-0">
      <dt className="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

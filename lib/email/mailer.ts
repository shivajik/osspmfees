import "server-only";
import nodemailer from "nodemailer";

function gmailCredentials() {
  const user = process.env.GOOGLE_EMAIL?.trim();
  const pass = process.env.GOOGLE_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

export function isEmailConfigured() {
  return gmailCredentials() !== null;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  name,
}: {
  to: string;
  resetUrl: string;
  name?: string;
}) {
  const credentials = gmailCredentials();
  if (!credentials) throw new Error("Gmail SMTP credentials are not configured");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: credentials,
  });

  await transporter.sendMail({
    from: `Ledgerly <${credentials.user}>`,
    to,
    subject: "Reset your Ledgerly password",
    text: [
      `Hello${name ? ` ${name}` : ""},`,
      "",
      "We received a request to reset your Ledgerly password.",
      `Reset your password: ${resetUrl}`,
      "",
      "This link expires in 30 minutes. If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="background:#f6f8fb;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
          <p style="margin:0 0 24px;font-size:18px;font-weight:700">Ledgerly</p>
          <h1 style="margin:0 0 12px;font-size:24px">Reset your password</h1>
          <p style="margin:0 0 20px;line-height:1.6">Hello${name ? ` ${name}` : ""}, we received a request to reset your Ledgerly password.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:600">Reset password</a>
          <p style="margin:24px 0 0;color:#475569;font-size:13px;line-height:1.6">This link expires in 30 minutes. If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
}

export async function sendUserInviteEmail({
  to,
  name,
  email,
  tempPassword,
  loginUrl,
  instituteName,
  role,
}: {
  to: string;
  name: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  instituteName?: string;
  role: string;
}) {
  const credentials = gmailCredentials();
  if (!credentials) throw new Error("Gmail SMTP credentials are not configured");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: credentials,
  });

  const roleLabel = role.replace("_", " ");
  const scopeLine = instituteName ? `${roleLabel} · ${instituteName}` : roleLabel;

  await transporter.sendMail({
    from: `Ledgerly <${credentials.user}>`,
    to,
    subject: "You've been added to Ledgerly",
    text: [
      `Hello ${name},`,
      "",
      `You've been added to Ledgerly as ${scopeLine}.`,
      "",
      `Sign in: ${loginUrl}`,
      `Email: ${email}`,
      `Temporary password: ${tempPassword}`,
      "",
      "You'll be asked to set your own password the first time you sign in.",
    ].join("\n"),
    html: `
      <div style="background:#f6f8fb;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
          <p style="margin:0 0 24px;font-size:18px;font-weight:700">Ledgerly</p>
          <h1 style="margin:0 0 12px;font-size:24px">You've been added to Ledgerly</h1>
          <p style="margin:0 0 8px;line-height:1.6">Hello ${name}, an account has been created for you.</p>
          <p style="margin:0 0 20px;color:#475569;font-size:13px;line-height:1.6">${scopeLine}</p>
          <div style="background:#f2f4f8;border-radius:8px;padding:16px 20px;margin:0 0 24px">
            <p style="margin:0 0 6px;font-size:13px;color:#475569">Email</p>
            <p style="margin:0 0 14px;font-size:15px;font-weight:600">${email}</p>
            <p style="margin:0 0 6px;font-size:13px;color:#475569">Temporary password</p>
            <p style="margin:0;font-size:15px;font-weight:600;font-family:monospace">${tempPassword}</p>
          </div>
          <a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:600">Sign in</a>
          <p style="margin:24px 0 0;color:#475569;font-size:13px;line-height:1.6">You'll be asked to set your own password the first time you sign in.</p>
        </div>
      </div>
    `,
  });
}
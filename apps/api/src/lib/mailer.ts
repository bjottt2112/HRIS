import nodemailer, { type Transporter } from "nodemailer";

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM ?? "Montreux HRIS <no-reply@montreux.co>";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth:
        SMTP_USER && SMTP_PASSWORD
          ? { user: SMTP_USER, pass: SMTP_PASSWORD }
          : undefined,
    });
  }
  return transporter;
}

/**
 * Kirim email. Jika SMTP belum dikonfigurasi (mode development), isi email
 * ditulis ke log server supaya tautan reset password tetap bisa diuji.
 * Password dan token tidak pernah dicatat di audit log database.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    console.info(
      [
        "[mail:dev] SMTP belum dikonfigurasi, email tidak benar-benar dikirim.",
        `  to      : ${input.to}`,
        `  subject : ${input.subject}`,
        `  body    : ${input.text.replace(/\s+/g, " ").slice(0, 500)}`,
      ].join("\n"),
    );
    return false;
  }

  await transport.sendMail({
    from: SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return true;
}

export function mailConfigured(): boolean {
  return Boolean(SMTP_HOST);
}

import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envs } from "../../config/envs.js";
import type { EmailSender } from "../../core/interfaces/email-sender.interface.js";
import type { EmailPayload } from "../../core/interfaces/email.interface.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ATTACHMENTS = [
  { filename: 'email-logo.png',    path: path.resolve(__dirname, '../templates/images/email-logo.png'),    cid: 'logo' },
  { filename: 'linkedin-icon.png', path: path.resolve(__dirname, '../templates/images/linkedin-icon.png'), cid: 'linkedin' },
  { filename: 'github-icon.png',   path: path.resolve(__dirname, '../templates/images/github-icon.png'),   cid: 'github' },
];

export class NodemailerSender implements EmailSender {
  private transporter;
  private templateCache = new Map<string, string>();

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: envs.smtpHost,
      port: envs.smtpPort,
      secure: envs.smtpPort === 465,
      pool: true,
      maxConnections: 3,
      auth: {
        user: envs.smtpUser,
        pass: envs.smtpPass,
      },
    });
  }

  public async send(payload: EmailPayload): Promise<boolean> {
    try {
      const html = this.getHtmlContent(payload.template, payload.params);

      await this.transporter.sendMail({
        from: `"Daniel Santacruz" <${envs.smtpUser}>`,
        to: payload.to,
        subject: payload.subject,
        html,
        attachments: ATTACHMENTS,
      });
      return true;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  }

  private getHtmlContent(templateName: string, replacements: Record<string, string>): string {
    let html = this.templateCache.get(templateName);

    if (!html) {
      const templatePath = path.resolve(__dirname, `../templates/${templateName}.html`);
      if (!fs.existsSync(templatePath)) throw new Error(`Template ${templateName} not found`);
      html = fs.readFileSync(templatePath, "utf8");
      this.templateCache.set(templateName, html);
    }

    Object.entries(replacements).forEach(([key, value]) => {
      html = html!.replaceAll(`{{${key}}}`, value);
    });

    return html;
  }
}

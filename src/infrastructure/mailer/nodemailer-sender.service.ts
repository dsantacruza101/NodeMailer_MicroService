import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envs } from "../../config/envs.js";
import type { EmailSender } from "../../core/interfaces/email-sender.interface.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class NodemailerSender implements EmailSender {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: envs.smtpHost,
      port: envs.smtpPort,
      secure: envs.smtpPort === 465,
      auth: {
        user: envs.smtpUser,
        pass: envs.smtpPass,
      },
    });
  }

  public async send(payload: any): Promise<boolean> {
    try {
      // Si el payload trae un templateName, lo procesamos
      const htmlBody = payload.template
        ? this.getHtmlContent(payload.template, payload.params || {})
        : payload.html;

      await this.transporter.sendMail({
        from: `"Daniel Santacruz" <${envs.smtpUser}>`,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: htmlBody,
      });
      return true;
    } catch (error) {
      console.error("Error enviando correo con template:", error);
      return false;
    }
  }

  // Método privado para leer el HTML y reemplazar variables
  private getHtmlContent(
    templateName: string,
    replacements: Record<string, string>,
  ): string {
    // Ruta hacia la carpeta de templates
    const templatePath = path.resolve(
      __dirname,
      `../templates/${templateName}.html`,
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template ${templateName} not found`);
    }

    let html = fs.readFileSync(templatePath, "utf8");

    // Reemplazo dinámico: {{name}} -> Daniel
    Object.entries(replacements).forEach(([key, value]) => {
      html = html.replaceAll(`{{${key}}}`, value);
    });

    return html;
  }
}

import nodemailer from "nodemailer";
import type { IEmailPayload } from "../interfaces/email.interface.js";
import { envs } from "../config/envs.js";

export class MailerService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: envs.smtpHost,
      port: envs.smtpPort,
      secure: false,
      auth: {
        user: envs.smtpUser,
        pass: envs.smtpPass,
      },
    });
  }

  async sendEmail(data: IEmailPayload) {
    try {
      const info = await this.transporter.sendMail({
        from: `"Sistema de Notificaciones" <${envs.smtpUser}>`,
        ...data,
      });
      return info;
    } catch (error) {
      console.error("Error in MailerService:", error);
      throw error;
    }
  }
}

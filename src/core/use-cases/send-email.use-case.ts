import type { EmailSender } from "../interfaces/email-sender.interface.js";
import type { IEmailPayload } from "../interfaces/email.interface.js";


export class SendEmailUseCase {
  constructor(private readonly emailSender: EmailSender) {}

  async execute(payload: IEmailPayload) {
    // Aquí podrías agregar lógica de negocio (ej. guardar en DB, auditoría)
    return await this.emailSender.send(payload);
  }
}
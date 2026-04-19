import type { EmailSender } from "../interfaces/email-sender.interface.js";
import type { ContactPayload } from "../interfaces/contact.interface.js";

export class SendEmailUseCase {
  constructor(
    private readonly emailSender: EmailSender,
    private readonly ownerEmail: string,
  ) {}

  async execute(contact: ContactPayload): Promise<boolean> {
    const year = new Date().getFullYear().toString();

    const [sentToUser, sentToOwner] = await Promise.all([
      this.emailSender.send({
        to: contact.email,
        subject: `We received your message, ${contact.name}`,
        template: 'contact-confirmation',
        params: { name: contact.name, subject: contact.subject, year },
      }),
      this.emailSender.send({
        to: this.ownerEmail,
        subject: `New contact from portfolio: ${contact.subject}`,
        template: 'contact-notification',
        params: {
          name: contact.name,
          email: contact.email,
          subject: contact.subject,
          message: contact.message,
          year,
        },
      }),
    ]);

    return sentToUser && sentToOwner;
  }
}

import type { EmailPayload } from "./email.interface.js";

export interface EmailSender {
  send(payload: EmailPayload): Promise<boolean>;
}
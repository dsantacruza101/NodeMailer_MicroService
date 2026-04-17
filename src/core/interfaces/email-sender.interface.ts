import type { IEmailPayload } from "./email.interface.js";

export interface EmailSender {
  send(payload: IEmailPayload): Promise<boolean>;
}
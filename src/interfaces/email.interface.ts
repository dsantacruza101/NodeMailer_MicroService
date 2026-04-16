export interface IEmailPayload {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}
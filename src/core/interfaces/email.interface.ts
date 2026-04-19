export interface EmailPayload {
    to: string;
    subject: string;
    template: string;
    params: Record<string, string>;
}
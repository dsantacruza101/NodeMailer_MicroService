import { 
    connect, 
    JSONCodec 
} from 'nats';
import type { 
    NatsConnection, 
    Subscription 
} from 'nats';
import { envs } from '../../config/envs.js';
import { SendEmailUseCase } from '../../core/use-cases/send-email.use-case.js';
import type { ContactPayload } from '../../core/interfaces/contact.interface.js';

export class NatsAdapter {
  private natsConnection?: NatsConnection;
  private jsonCodec = JSONCodec();

  constructor(private readonly sendEmailUseCase: SendEmailUseCase) {}

  async start() {
    try {
      this.natsConnection = await connect({ 
        servers: envs.natsServers,
        name: 'Email-Service-Worker' 
      });
      
      console.log(`🚀 NATS connected: ${this.natsConnection.getServer()}`);

      // Suscripción al subject
      const sub = this.natsConnection.subscribe("mail.send", { queue: "email-service-group" });
      
      this.handleMessages(sub);

    } catch (error) {
      console.error('🚨 NATS Connection Error:', error);
      process.exit(1);
    }
  }

  private async handleMessages(sub: Subscription) {
    
    for await (const mail of sub) {
      try {
        
        const decoded = this.jsonCodec.decode(mail.data) as any;
        const contact: ContactPayload = decoded.data ?? decoded;
        // console.log(`📩 Message received for: ${contact.email}`);

        // Respond immediately so the gateway is not blocked by SMTP latency
        if (mail.reply) {
          mail.respond(this.jsonCodec.encode({ status: 'received' }));
        }

        const start = Date.now();
        this.sendEmailUseCase.execute(contact).then((success) => {
          console.log(`✉️  Emails ${success ? 'sent' : 'failed'} in ${Date.now() - start}ms`);
        }).catch((err) => {
          console.error('❌ Error sending emails:', err);
        });
      } catch (err) {
        console.error("❌ Error processing NATS message:", err);
      }
    }
  }

  async close() {
    if (this.natsConnection) {
      console.log('Closing NATS connection...');
      await this.natsConnection.drain();
    }
  }
}
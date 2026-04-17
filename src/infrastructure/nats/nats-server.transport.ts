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

export class NatsAdapter {
  private nc?: NatsConnection;
  private jc = JSONCodec();

  constructor(private readonly sendEmailUseCase: SendEmailUseCase) {}

  async start() {
    try {
      this.nc = await connect({ 
        servers: envs.natsServers,
        name: 'Email-Service-Worker' 
      });
      
      console.log(`🚀 NATS connected: ${this.nc.getServer()}`);

      // Suscripción al subject
      const sub = this.nc.subscribe("mail.send", { queue: "email-service-group" });
      
      this.handleMessages(sub);

    } catch (error) {
      console.error('🚨 NATS Connection Error:', error);
      process.exit(1);
    }
  }

  private async handleMessages(sub: Subscription) {
    for await (const m of sub) {
      try {
        const payload = this.jc.decode(m.data) as any;
        console.log(`📩 Message received for: ${payload.to}`);

        // Aquí es donde la infraestructura llama al Core
        const success = await this.sendEmailUseCase.execute(payload);

        if (m.reply) {
          m.respond(this.jc.encode({ status: success ? 'sent' : 'error' }));
        }
      } catch (err) {
        console.error("❌ Error processing NATS message:", err);
      }
    }
  }

  async close() {
    if (this.nc) {
      console.log('Closing NATS connection...');
      await this.nc.drain();
    }
  }
}
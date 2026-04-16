import { connect, JSONCodec } from 'nats';
import { envs } from './config/envs.js';
import type { IEmailPayload } from './interfaces/email.interface.js';
import { MailerService } from './services/mailer.service.js';

const jc = JSONCodec<IEmailPayload>();
const mailer = new MailerService();

async function start() {
    try {
        const nc = await connect({ 
            servers: envs.natsServers,
            name: 'Email-Service-Worker'
        });
        
        console.log(`🚀 Email Service connected to NATS: ${nc.getServer()}`);

        const shutdown = async () => {
            console.log('\nClosing NATS connection...');
            await nc.drain();
            process.exit();
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        const sub = nc.subscribe("mail.send", { queue: "email-service-group" });
        console.log("📥 Worker listening on [mail.send]...");

        for await (const m of sub) {
            try {

                const data = jc.decode(m.data);

                console.log(`📩 Processing email for: ${data.to}`);

                await mailer.sendEmail(data);
                
                if (m.reply) {

                    m.respond(jc.encode({ status: 'sent', to: data.to } as any));
                }
            } catch (err) {
                console.error("❌ Error processing message:", err);

                if (m.reply) {
                    
                    m.respond(jc.encode({ status: 'error', message: 'Failed to send email' } as any));
                }
            }
        }
    } catch (err) {
        console.error("🚨 Critical error connecting to NATS:", err);
        process.exit(1);
    }
}

start();
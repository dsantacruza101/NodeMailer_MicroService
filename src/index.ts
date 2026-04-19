import { envs } from './config/envs.js';
import { NodemailerSender } from './infrastructure/mailer/nodemailer-sender.service.js';
import { SendEmailUseCase } from './core/use-cases/send-email.use-case.js';
import { NatsAdapter } from './infrastructure/nats/nats-server.transport.js';

async function bootstrap() {
  // 1. Dependencias de Infraestructura
  const mailerSender = new NodemailerSender();

  // 2. Lógica de Negocio (Core)
  const sendEmailUseCase = new SendEmailUseCase(mailerSender, envs.ownerEmail);

  // 3. Adaptador de Entrada (NATS)
  const natsAdapter = new NatsAdapter(sendEmailUseCase);

  // 4. Iniciar servicio
  await natsAdapter.start();

  // Manejo de cierre limpio
  process.on('SIGINT', () => natsAdapter.close());
  process.on('SIGTERM', () => natsAdapter.close());
}

bootstrap();
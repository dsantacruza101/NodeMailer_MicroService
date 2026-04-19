import "dotenv/config";
import joi from "joi";

interface EnvVars {
  NATS_SERVERS: string[];
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  OWNER_EMAIL: string;
}

const envsSchema = joi
  .object({
    NATS_SERVERS: joi.array().items(joi.string()).required(),
    SMTP_HOST: joi.string().required(),
    SMTP_PORT: joi.number().required(),
    SMTP_USER: joi.string().email().required(),
    SMTP_PASS: joi.string().required(),
    OWNER_EMAIL: joi.string().email().required(),
  })
  .unknown(true);

const { error, value } = envsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS?.split(','),
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars: EnvVars = value;

export const envs = {
  natsServers: envVars.NATS_SERVERS,
  smtpHost: envVars.SMTP_HOST,
  smtpPort: envVars.SMTP_PORT,
  smtpUser: envVars.SMTP_USER,
  smtpPass: envVars.SMTP_PASS,
  ownerEmail: envVars.OWNER_EMAIL,
};
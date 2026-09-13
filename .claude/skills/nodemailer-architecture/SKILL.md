---
name: nodemailer-architecture
description: Architecture guide for this NodeMailer email microservice — layered core/infrastructure structure, the NATS-to-SMTP data flow, and conventions to follow when adding use cases, adapters, or email templates. Use before making any change to src/ in this repo.
---

# NodeMailer MicroService — Architecture Guide

This is an async **email-sending worker**, not an HTTP API. It has one job: receive a
`ContactPayload` over NATS and send two templated emails (visitor confirmation + owner
notification) via SMTP. Read this before touching `src/`.

## Layering — respect the direction of dependency

```
src/core/            domain layer — zero infra imports, zero framework imports
  interfaces/         ContactPayload, EmailPayload, EmailSender (the port)
  use-cases/           SendEmailUseCase — the one business rule

src/infrastructure/   adapters — implement or call into core interfaces
  mailer/               NodemailerSender implements EmailSender
  nats/                 NatsAdapter — inbound transport, calls SendEmailUseCase
  templates/            *.html templates + images/ (cid attachments)

src/config/           envs.ts — Joi-validated env vars, imported by infra only
src/index.ts          composition root — the ONLY place concrete classes are `new`'d
```

Rule: `core/` never imports from `infrastructure/` or `config/`. New business logic goes
in a use case that depends on interfaces (e.g. `EmailSender`), never on `NodemailerSender`
directly. Wire concrete implementations together only in `index.ts`, matching the existing
`mailerSender → sendEmailUseCase → natsAdapter` construction order.

## Data flow (how a message becomes two emails)

1. Portfolio backend publishes to NATS subject **`mail.send`** (queue group
   `email-service-group`), request/reply style, payload = `ContactPayload`
   (`name`, `email`, `subject`, `message`).
2. `NatsAdapter.handleMessages` ([src/infrastructure/nats/nats-server.transport.ts](../../../src/infrastructure/nats/nats-server.transport.ts))
   decodes the JSON, **replies immediately** with `{ status: 'received' }` so the caller
   isn't blocked on SMTP latency, then calls `sendEmailUseCase.execute(contact)`
   **without awaiting it** before replying — only logs success/failure afterward.
3. `SendEmailUseCase.execute` ([src/core/use-cases/send-email.use-case.ts](../../../src/core/use-cases/send-email.use-case.ts))
   fires two `EmailSender.send()` calls in parallel via `Promise.all`: one to
   `contact.email` using template `contact-confirmation`, one to `envs.ownerEmail` using
   template `contact-notification`. Both share a `year` param.
4. `NodemailerSender.send` ([src/infrastructure/mailer/nodemailer-sender.service.ts](../../../src/infrastructure/mailer/nodemailer-sender.service.ts))
   loads the named `.html` file from `infrastructure/templates/` (cached in memory after
   first read per template name), does a plain `{{key}}` → value `replaceAll` for every
   entry in `params`, then sends via a pooled SMTP transporter with three logo/social
   images attached as inline `cid` attachments (`logo`, `linkedin`, `github` — same three
   on every email, not per-template).
5. Errors are caught inside `send()`, logged, and turned into `return false` — they never
   throw up to the NATS handler. Preserve this contract if you touch `send()`.

## Conventions to follow

- **New use case** → add an interface in `core/interfaces/` if it needs a new
  capability, a class in `core/use-cases/`, constructor-injected dependencies only
  (see `SendEmailUseCase`'s `(emailSender, ownerEmail)` pattern).
- **New email template** → add `<name>.html` to `infrastructure/templates/`, reference it
  by that bare filename as `EmailPayload.template`, and use `{{paramName}}` placeholders —
  there is no templating engine, just string replacement, so keep placeholders simple
  (no loops/conditionals in templates).
- **New env var** → add it to the Joi schema and `EnvVars` interface in
  [src/config/envs.ts](../../../src/config/envs.ts) AND to [.env.template](../../../.env.template).
  Config is validated at process startup; an invalid/missing var crashes the process
  immediately rather than failing later.
- **Imports** use explicit `.js` extensions (native ESM, `"type": "module"`,
  `module: nodenext`) — e.g. `import { envs } from './config/envs.js'` even though the
  source file is `envs.ts`. Don't drop the extension.
- TypeScript is `strict: true`. No test framework is currently configured — don't assume
  `npm test` does anything (`--if-present` no-op in CI).

## Known gaps — check before assuming these are fine

- **Prod Docker image may be missing templates**: [dockerfile.prod](../../../dockerfile.prod)'s
  `build` stage runs `tsc` (which only emits `dist/`, not `.html`/image assets) and the
  `prod` stage only copies `dist/` + prod `node_modules`. If `src/infrastructure/templates/`
  isn't otherwise copied into `dist/templates/` by the build, `NodemailerSender` will throw
  `Template not found` in production. Verify this before shipping template changes.
- **No runtime validation of the inbound NATS payload** — `nats-server.transport.ts` casts
  the decoded message to `any` before treating it as `ContactPayload`, unlike `envs.ts`
  which validates with Joi. A malformed message fails late/silently inside the use case.
- **Unescaped template interpolation** — `{{key}}` replacement in `nodemailer-sender.service.ts`
  does a raw string substitution of user-supplied contact-form fields into HTML with no
  escaping. Keep this in mind if adding new user-controlled params to a template.

See [context.md](../../../context.md) at the repo root for the fuller narrative writeup
this skill is distilled from (deploy pipeline, dependency list, etc.).

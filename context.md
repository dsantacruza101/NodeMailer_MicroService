# Context — NodeMailer MicroService

## What this is

A small, standalone **email-sending microservice** for Daniel Santa Cruz's portfolio site. It has no HTTP API of its own — it listens for messages on **NATS** and reacts by sending templated emails via **SMTP (Nodemailer)**. Its only real job: when someone submits the portfolio's contact form, send a confirmation email to the visitor and a notification email to the site owner.

- **Name:** `email-service` (package.json), repo folder `NodeMailer_MicroService`
- **Runtime:** Node.js, **TypeScript**, native ESM (`"type": "module"`)
- **Entry point:** [src/index.ts](src/index.ts)
- **Trigger:** NATS subject `mail.send` (queue group `email-service-group`)
- **Side effect:** two emails sent per message, via SMTP

## Architecture

Clean/layered architecture, three folders under `src/`:

```
src/
├── config/
│   └── envs.ts                     # env var loading + Joi validation
├── core/                           # domain layer — no infra dependencies
│   ├── interfaces/
│   │   ├── contact.interface.ts    # ContactPayload (inbound NATS message shape)
│   │   ├── email.interface.ts      # EmailPayload (to/subject/template/params)
│   │   └── email-sender.interface.ts # EmailSender port (send(payload): Promise<boolean>)
│   └── use-cases/
│       └── send-email.use-case.ts  # SendEmailUseCase — the one business rule
├── infrastructure/                 # adapters — implement/consume core interfaces
│   ├── mailer/
│   │   └── nodemailer-sender.service.ts  # EmailSender impl using Nodemailer + HTML templates
│   ├── nats/
│   │   └── nats-server.transport.ts      # NatsAdapter — subscribes, decodes, dispatches
│   └── templates/
│       ├── contact-confirmation.html     # sent to the visitor
│       ├── contact-notification.html     # sent to the owner
│       └── images/ (logo, github-icon, linkedin-icon — sent as cid attachments)
└── index.ts                         # composition root / bootstrap
```

This follows the Dependency Inversion pattern described in the project's CLAUDE.md: `SendEmailUseCase` depends on the `EmailSender` interface, not on `NodemailerSender` directly. `index.ts` wires the concrete implementations together.

### Data flow

1. **Portfolio backend** publishes a NATS message on subject `mail.send` with a `ContactPayload` (`name`, `email`, `subject`, `message`), request/reply style.
2. `NatsAdapter.handleMessages` ([src/infrastructure/nats/nats-server.transport.ts](src/infrastructure/nats/nats-server.transport.ts)) decodes the JSON payload, **immediately replies** `{ status: 'received' }` so the caller isn't blocked on SMTP latency, then asynchronously calls `SendEmailUseCase.execute(...)` (fire-and-forget with logging, not awaited before replying).
3. `SendEmailUseCase.execute` ([src/core/use-cases/send-email.use-case.ts](src/core/use-cases/send-email.use-case.ts)) builds two `EmailPayload`s in parallel via `Promise.all`:
   - To the visitor (`contact.email`) using the `contact-confirmation` template.
   - To the owner (`envs.ownerEmail`) using the `contact-notification` template.
4. `NodemailerSender.send` ([src/infrastructure/mailer/nodemailer-sender.service.ts](src/infrastructure/mailer/nodemailer-sender.service.ts)) loads the HTML template file (cached in-memory after first read), does `{{key}}` string-replacement with the payload's `params`, and sends via a pooled Nodemailer SMTP transporter with three logo/social-icon images attached as inline `cid` attachments.
5. Success/failure of both sends is logged; on any error, `send()` swallows the error, logs it, and returns `false` rather than throwing.

## Configuration

Validated at startup with Joi in [src/config/envs.ts](src/config/envs.ts) — throws and crashes the process on invalid config. Required env vars (see [.env.template](.env.template)):

| Var | Purpose |
|---|---|
| `NATS_SERVERS` | comma-separated list of NATS server URLs |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server (port 465 ⇒ `secure: true`) |
| `SMTP_USER` / `SMTP_PASS` | SMTP auth (also used as the "from" address) |
| `OWNER_EMAIL` | where the notification email is sent |

A real `.env` exists locally but is gitignored (not read/inspected here).

## Key dependencies

- `nodemailer` — SMTP sending, connection pooling (`maxConnections: 3`)
- `nats` — messaging transport, `JSONCodec` for payload (de)serialization
- `joi` — env var schema validation
- `dotenv` — loads `.env` in development
- Dev tooling: `ts-node` (ESM loader) for `dev`/`watch`, `tsc` for `build`, `nodemon` for `watch`

No test framework, linter, or formatter is currently configured (`npm run lint`/`npm test` in CI are `--if-present` no-ops).

## Build & run

```bash
npm run dev     # ts-node ESM loader, no build step
npm run watch   # nodemon + ts-node, hot reload
npm run build   # tsc → dist/
npm start       # node dist/index.js (requires build first)
```

`tsconfig.json`: `strict: true`, `module: nodenext`, `target: esnext`, output to `dist/`.

## Docker

- [dockerfile](dockerfile) — single-stage dev image, runs `npm run dev` directly against source (no build).
- [dockerfile.prod](dockerfile.prod) — 3-stage build (`deps` → `build` → `prod`) matching the CLAUDE.md standard pattern: `node:21-alpine3.19`, only `dist/` + prod `node_modules` copied into the final image, runs as `USER node`. **Note:** this file does not yet copy the `src/infrastructure/templates/` HTML/image assets into the final image explicitly — since `tsc` only builds `dist/`, template files must either be copied by the build step or added as an explicit `COPY` in the `prod` stage, otherwise `NodemailerSender` will fail to find templates at runtime in production (`fs.existsSync` check throws `Template not found`). Worth verifying/fixing.

## CI/CD

[github/workflows/ci-pipeline.yml](github/workflows/ci-pipeline.yml) — GitHub Actions:
- On push/PR to `main`: install, lint (if present), test (if present), `npm run build`.
- On push to `main` only: triggers a deploy via a signed webhook (`webhook.dsantacruz.com/deploy/backend`, HMAC-SHA256 signed with `WEBHOOK_SECRET`), then hits a health-check endpoint (`api.dsantacruz.com/api/portfolio/contact-me`).

This confirms the microservice is deployed as part of a larger **portfolio backend system** — this service is the async email worker, decoupled from the API via NATS so contact-form submissions don't block on SMTP.

## Notable design choices / risks

- **Fire-and-forget dispatch:** the NATS handler replies before emails are actually sent, then handles the promise separately with only console logging — a failure produces no NATS-level feedback to the caller (by design, for latency, but means failures are only visible in this service's logs).
- **`any` cast on decode:** `nats-server.transport.ts:44` casts the decoded NATS payload to `any` before extracting `ContactPayload` — no runtime validation (e.g. Joi) of the inbound message shape, unlike `envs.ts` which does validate env vars. A malformed message would fail late/silently inside the use case.
- **Template injection surface:** `{{key}}` replacement in `nodemailer-sender.service.ts` does a raw `replaceAll` with user-supplied values (`name`, `subject`, `message` come straight from the contact form) into HTML — no escaping. Since this only affects the rendered HTML of outbound emails, impact is limited to formatting bugs, but a `<script>`-laced form field would land unescaped in the recipient's inbox HTML.
- **No tests** exist for `SendEmailUseCase` or `NodemailerSender`, despite CLAUDE.md's testing conventions (Jest for Node/Express-style services) — CI's test step is a silent no-op.

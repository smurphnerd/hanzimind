# HanziMind

A Chinese language learning application built with Next.js that uses @xenova/transformers for checking definitions.

## Prerequisites

Before you begin, ensure you have the following installed:

- **[pnpm](https://pnpm.io/)** - Fast, disk space efficient package manager
- **[Docker](https://www.docker.com/)** - For running development containers (PostgreSQL, etc.)

## Getting Started

### 1. Start Development Containers

First, start the required services (PostgreSQL, MinIO, MailHog) using Docker Compose:

```bash
pnpm dev-containers
```

This will start all the necessary containers defined in `development/docker-compose.yaml`.

**📧 Mail Server**: A local SMTP server (MailHog) will be available at [http://localhost:8025](http://localhost:8025) for viewing emails sent during development.

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up the Database

First, apply the migrations in `drizzle/` to create the tables:

```bash
pnpm db:migrate
```

Then, populate the database with the initial vocabulary list:

```bash
pnpm db:seed
```

This will import Chinese characters, compounds, and example sentences into the database.

### 4. Run the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Environment
NODE_ENV=development
LOG_LEVEL=info                          # Optional: trace, debug, info, warn, error, fatal
GIT_SHA=dev                             # Git commit SHA (use "dev" for local development)

# Application
BASE_URL=http://localhost:3000          # Base URL of the application

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres

# S3/MinIO Storage (for audio files)
S3_OPTIONS={"credentials":{"accessKeyId":"arbitrary-key","secretAccessKey":"arbitrary-secret"},"endpoint":"http://localhost:9090","region":"local","bucketName":"default-bucket","forcePathStyle":true}

# Email
EMAIL_CONNECTION_URL=smtp://admin:admin@localhost:1025  # Or "ses" for production
SYSTEM_EMAIL_FROM="HanziMind <no-reply@hanzimind.app>"

# Authentication
AUTH_SECRET=your-secret-key-here        # Generate with: openssl rand -hex 32

# DeepL Translation API
DEEPL_API_KEY=your-deepl-api-key-here   # Get from https://www.deepl.com/pro-api
```

### Required API Keys

- **DeepL API Key**: Sign up for a free DeepL API account at https://www.deepl.com/pro-api to get your API key for translation services.

### Development Defaults

The default values above work with the Docker development containers. For production deployment, you'll need to:

1. Set `NODE_ENV=production`
2. Configure production database URL
3. Set up AWS S3 or compatible object storage
4. Use `EMAIL_CONNECTION_URL=ses` for AWS SES
5. Generate a secure `AUTH_SECRET`
6. Obtain a DeepL API key

## Available Scripts

- `pnpm dev` - Start the Next.js development server
- `pnpm dev-containers` - Start development containers (Docker)
- `pnpm db:seed` - Seed the database with vocabulary
- `pnpm db:migrate` - Apply the checked-in migrations in `drizzle/`
- `pnpm db:generate` - Write a new migration after editing `schema.ts`
- `pnpm db:push:scratch` - Shove `schema.ts` straight into a throwaway database, writing no
  migration. For a scratch database you are willing to drop; anything shared, and anything
  another person or a CI job will connect to, wants `db:migrate` instead.
- `pnpm email` - Start the email development server
- `pnpm build` - Build the application for production
- `pnpm start` - Start the production server
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run unit tests
- `pnpm test-e2e` - Run end-to-end tests

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

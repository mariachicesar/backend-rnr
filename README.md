# RnR Electrical Admin API

A Node.js Express backend API for managing electrical service estimates, contracts, invoices, and payments with PostgreSQL.

## Features

- **Authentication**: JWT-based auth with role-based access control (admin/user)
- **Client Management**: CRUD operations for client information
- **Estimates**: Create, send, and track estimate acceptance
- **Contracts**: Generate contracts from estimates
- **Invoices**: Create invoices with payment tracking
- **Payments**: Track client payments with multiple payment methods (cash, check, credit card, Zelle)
- **Email Integration**: Using Resend for sending estimates and invoices
- **Payment Reminders**: Automated alerts for overdue invoices (3, 7, 14 days)

## Prerequisites

- Node.js 18+
- PostgreSQL 12+ (AWS RDS recommended)
- Resend API key (for email)

## Setup

### 1. Clone and Install

```bash
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string
  - Format: `postgresql://username:password@host:port/database?schema=public`
- `JWT_SECRET`: Secret key for JWT signing
- `RESEND_API_KEY`: Your Resend API key
- `ADMIN_EMAIL`: Email address for sending from
- `FRONTEND_URL`: URL of your frontend application (for email links)
- `STRIPE_SECRET_KEY`: Stripe API secret key used to create Checkout sessions
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/api/stripe/webhook`

Stripe notes:
- `STRIPE_SECRET_KEY` starts with `sk_...`
- `STRIPE_WEBHOOK_SECRET` starts with `whsec_...`
- The webhook secret is created per webhook endpoint. It is not the same as your API key.
- For local testing, run `stripe listen --forward-to localhost:5000/api/stripe/webhook` and copy the printed `whsec_...` value into `.env`

### 3. Database Setup

#### Option A: Local Development (PostgreSQL locally)

Install PostgreSQL and create a database:

```bash
createdb rnr_electrical
```

Update `DATABASE_URL` in `.env`:
```
DATABASE_URL="postgresql://username:password@localhost:5432/rnr_electrical?schema=public"
```

#### Option B: AWS RDS Setup

1. Create an RDS PostgreSQL instance in AWS Console
2. Get the connection string from RDS
3. Update `DATABASE_URL` in `.env`:
   ```
   DATABASE_URL="postgresql://admin:YourPassword@rnr-db.xxx.us-east-1.rds.amazonaws.com:5432/rnr_electrical?schema=public"
   ```

### 4. Initialize Database

```bash
npm run prisma:migrate
```

This will create all tables and set up the database schema.

### 5. (Optional) Seed Database

To add initial test data:

```bash
npm run seed
```

## Development

Start the dev server with hot reload:

```bash
npm run dev
```

Server runs on `http://localhost:5000` by default.

View database in Prisma Studio:

```bash
npm run prisma:studio
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user profile

### Clients (Protected)
- `GET /api/clients` - List all clients
- `GET /api/clients/:id` - Get client details
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Estimates (Protected)
- `GET /api/estimates` - List your estimates
- `GET /api/estimates/:id` - Get estimate details
- `POST /api/estimates` - Create estimate
- `PUT /api/estimates/:id` - Update estimate
- `DELETE /api/estimates/:id` - Delete estimate
- `POST /api/estimates/:id/send` - Send estimate to client
- `POST /api/estimates/:id/accept` - Client accepts estimate

### Contracts (Protected)
- `GET /api/contracts` - List your contracts
- `GET /api/contracts/:id` - Get contract details
- `POST /api/contracts` - Create contract
- `PUT /api/contracts/:id` - Update contract
- `DELETE /api/contracts/:id` - Delete contract

### Invoices (Protected)
- `GET /api/invoices` - List your invoices
- `GET /api/invoices/:id` - Get invoice details
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice
- `POST /api/invoices/:id/send` - Send invoice to client

### Payments (Protected)
- `GET /api/payments` - List all payments
- `GET /api/payments/:id` - Get payment details
- `POST /api/payments` - Record a payment
- `DELETE /api/payments/:id` - Delete payment record

### Public Payment Tracking
- `GET /api/public/track/invoice/:id?clientId=...` - Fetch invoice for client payment page
- `POST /api/public/track/invoice/:id/checkout` - Create Stripe Checkout session for ACH or card

### Stripe Webhooks
- `POST /api/stripe/webhook` - Receive Stripe payment events and mark invoices as paid/partial

## Building for Production

```bash
npm run build
npm start
```

## Deployment

### AWS EC2/ECS

1. Build Docker image (Dockerfile needed)
2. Push to ECR
3. Deploy to ECS service

### Heroku

```bash
heroku create rnr-electrical-api
heroku addons:create heroku-postgresql:standard-0
git push heroku main
heroku run npm run prisma:migrate
```

### DigitalOcean App Platform

1. Connect GitHub repo
2. Set environment variables in dashboard
3. Deploy via dashboard

## Environment Configuration

### Production Environment Variables

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=your_very_secure_random_string_here
RESEND_API_KEY=re_...
ADMIN_EMAIL=rnrelectrical2@gmail.com
FRONTEND_URL=https://yourdomain.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Stripe Local Testing

Install the Stripe CLI, authenticate it, and forward webhook events to your local API:

```bash
stripe login
stripe listen --forward-to localhost:5000/api/stripe/webhook
```

Stripe prints a webhook signing secret like `whsec_...` when the listener starts. Use that value for `STRIPE_WEBHOOK_SECRET` in your local `.env`, then restart the backend.

## Database Backup

### AWS RDS Automated Backups

RDS automatically backs up your database. Configure:
- Backup retention period: 30 days
- Backup window: Off-peak hours
- Enable automated backups in RDS console

### Manual Backup

```bash
pg_dump YOUR_DATABASE_URL > backup.sql
```

Restore:
```bash
psql YOUR_DATABASE_URL < backup.sql
```

## Monitoring & Logging

- Check server logs: `npm run dev` (development)
- Application logs go to stdout
- Set up CloudWatch for AWS deployment

## Testing

Create a `.env.test` file for testing configuration:

```env
DATABASE_URL="postgresql://...test_db"
JWT_SECRET="test_secret"
NODE_ENV="test"
```

## Common Issues

### Database Connection Errors

- Verify `DATABASE_URL` format
- Check PostgreSQL is running (local) or RDS security groups allow your IP
- Ensure database and user exist

### Email Not Sending

- Verify `RESEND_API_KEY` is valid
- Check `ADMIN_EMAIL` format
- Verify sender email is authenticated in Resend

### Port Already in Use

Change `PORT` in `.env` or kill existing process:
```bash
lsof -ti:5000 | xargs kill -9
```

## Documentation

- [Prisma Docs](https://www.prisma.io/docs)
- [Express Docs](https://expressjs.com)
- [Resend Docs](https://resend.com/docs)

## License

MIT

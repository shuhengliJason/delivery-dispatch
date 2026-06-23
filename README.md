# Delivery Dispatch Platform

A full-stack food delivery operations platform for customers, restaurants, drivers, dispatchers, and admins. The app models the real delivery workflow from checkout through restaurant preparation, driver assignment, live order status, delay handling, and operational intervention.

## Live Demo

Open the deployed app:

[https://delivery-dispatch-two.vercel.app](https://delivery-dispatch-two.vercel.app)

Start from the sign-in page:

[https://delivery-dispatch-two.vercel.app/sign-in?redirectTo=/customer](https://delivery-dispatch-two.vercel.app/sign-in?redirectTo=/customer)

## Demo Accounts

All seeded demo accounts use the same password:

```text
demo1234
```

| Role | Email | Workspace |
| --- | --- | --- |
| Customer | `sarah.chen@example.com` | Browse restaurants, checkout, and track orders |
| Vendor | `vendor@example.com` | Manage restaurant orders, menu, staff, and profile |
| Driver | `alex.driver@example.com` | Claim pickups and update delivery progress |
| Dispatcher | `dispatcher@example.com` | Monitor exceptions, delays, and driver capacity |
| Admin | `admin@example.com` | Access dispatcher/admin workflows and user management |

The login screen includes a workspace switcher so reviewers can quickly move between roles.

## What This App Does

### Customers

- Browse restaurants and menus.
- Add items to cart and place delivery orders.
- Pay through Stripe Checkout using test-mode payments.
- Track order status and delivery timeline updates.
- Manage profile and delivery address details.

### Vendors

- View incoming, preparing, attention, and completed order queues.
- Confirm orders, update preparation status, mark orders ready for pickup, and adjust ETA.
- Manage dishes, option groups, restaurant profile details, and staff access.
- Enforce restaurant-level permissions so vendor users only access authorized restaurants.

### Drivers

- View assigned deliveries and ready orders available for claim.
- Accept, pick up, and complete delivery assignments.
- Respect driver capacity rules and active delivery limits.
- See operational delay indicators and route-relevant order information.

### Dispatchers and Admins

- Monitor late, stuck, unclaimed, and capacity-risk orders.
- Manually assign drivers and adjust order status or ETA.
- Manage dispatcher users and role permissions.
- Review operational exceptions instead of only the happy path.

## Engineering Highlights

- **Role-based access control:** Customer, vendor, driver, dispatcher, and admin workflows with server-side permission checks.
- **Google Maps integration:** Address autocomplete, address metadata, and route/ETA support.
- **Stripe payments:** Checkout sessions, webhook verification, payment status updates, and refund job support.
- **Background jobs:** Database-backed job queue for dispatch, delay sync, notifications, and refunds.
- **Rate limiting:** Auth, admin, dispatcher, and vendor mutation routes use IP/user rate-limit policies.
- **Circuit breakers:** External-service calls can fail safely with persisted circuit-breaker state.
- **Prisma transactions:** Critical order, driver, payment, and timeline updates are handled transactionally.
- **Testing:** Vitest coverage for core business rules such as permissions, driver assignment, delay rules, queue workers, payment handling, and rate limiting.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma 7
- PostgreSQL
- Better Auth
- Stripe
- Google Maps APIs
- Brevo email
- Tailwind CSS
- Vitest

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Update `.env` with your local database and API keys, then prepare the database:

```bash
npx prisma generate
npm run prisma:migrate
npm run prisma:seed
```

Start the app:

```bash
npm run dev
```

Open:

[http://localhost:3000](http://localhost:3000)

Run the background worker in a separate terminal when testing queued jobs:

```bash
npm run jobs:worker
```

## Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run prisma:seed
npm run jobs:worker
```

## Payment Testing

Use Stripe test mode. A successful test payment can use:

```text
4242 4242 4242 4242
Any future expiration date
Any 3-digit CVC
Any postal code
```

## Environment Variables

See [.env.example](./.env.example) for the required configuration. Real secrets should stay in `.env` locally or in your deployment provider's environment settings.

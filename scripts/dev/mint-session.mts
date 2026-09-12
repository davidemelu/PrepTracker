/**
 * Dev helper: prints a valid session cookie so pages can be smoke-tested with
 * curl without driving the login form. Never used by the application itself.
 */
import path from 'node:path';
import { SignJWT } from 'jose';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma';

for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(process.cwd(), f)); } catch {}
}

// Minting a session for the first account it finds is exactly the thing a
// production box must not offer, whatever the reason it was run there. Checked
// after the env files load, so a .env that declares production is believed.
if (process.env.NODE_ENV === 'production') {
  console.error('mint-session is a development helper and refuses to run with NODE_ENV=production.');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env, or run this from the repository root.');
  process.exit(1);
}

const authSecret = process.env.AUTH_SECRET;
if (!authSecret) {
  console.error('AUTH_SECRET is not set, so the token would not verify. Set it in .env first.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const user = await prisma.user.findFirstOrThrow();
const token = await new SignJWT({ username: user.username, sessionVersion: user.sessionVersion })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(user.id)
  .setIssuer('preptracker')
  .setIssuedAt()
  .setExpirationTime('1d')
  .sign(new TextEncoder().encode(authSecret));
console.log(token);
await prisma.$disconnect();

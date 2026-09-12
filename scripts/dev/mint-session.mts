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

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const user = await prisma.user.findFirstOrThrow();
const token = await new SignJWT({ username: user.username })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(user.id)
  .setIssuer('preptracker')
  .setIssuedAt()
  .setExpirationTime('1d')
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
console.log(token);
await prisma.$disconnect();

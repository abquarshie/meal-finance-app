import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma only reads the tables here. Cashew's Python side (ensure_schema) creates and upgrades them,
// so there are no Prisma migrations: never run `prisma migrate` or `prisma db push` against this database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});

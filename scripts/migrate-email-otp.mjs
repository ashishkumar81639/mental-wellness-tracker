import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envFile = readFileSync(".env", "utf8");
const get = (k) => {
  const m = envFile.match(new RegExp(`^${k}=(.*)$`, "m"));
  if (!m) throw new Error(`missing ${k} in .env`);
  return m[1].trim();
};
const DATABASE_URL = get("DATABASE_URL");
const sql = neon(DATABASE_URL);

console.log("Running migration-email-otp.sql ...");
const migration = readFileSync("db/migration-email-otp.sql", "utf8");
// Neon serverless executes one statement per query() call. Split on semicolons
// and run each non-empty statement.
const stmts = migration
  .split(/^--.*$/m) // strip comment lines
  .join("")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const s of stmts) {
  try {
    await sql(s);
    console.log("  ok:", s.slice(0, 70).replace(/\s+/g, " "));
  } catch (e) {
    console.error("  FAILED:", e.message, "| stmt:", s.slice(0, 100));
  }
}

console.log("\nVerifying columns:");
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'users' AND column_name IN ('email','email_verified')
`;
console.log("  users columns:", cols.map((r) => r.column_name));

const tbls = await sql`
  SELECT table_name FROM information_schema.tables WHERE table_name = 'otp_codes'
`;
console.log("  otp_codes table exists:", tbls.length > 0);

console.log("\nDemo user row:");
const demo = await sql`SELECT id, email, email_verified FROM users WHERE id = 'demo_user'`;
console.log("  ", demo[0]);

console.log("\nDONE");

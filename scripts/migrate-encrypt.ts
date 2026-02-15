/**
 * One-time migration script to encrypt existing plaintext rows in access_codes.
 *
 * Run:  npx tsx scripts/migrate-encrypt.ts
 *
 * Prerequisites:
 *   - ENCRYPTION_KEY env var set (64-char hex)
 *   - NEXT_PUBLIC_SUPABASE_URL env var set
 *   - SUPABASE_SERVICE_ROLE_KEY env var set
 *   - New columns already added:
 *       ALTER TABLE access_codes ADD COLUMN encrypted_code text;
 *       ALTER TABLE access_codes ADD COLUMN encrypted_email text;
 */

import { createClient } from "@supabase/supabase-js";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load env from .env.local (Next.js convention) ────────────────────────
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local may not exist if env vars are set externally
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.error("ENCRYPTION_KEY must be a 64-char hex string.");
  process.exit(1);
}
const key = Buffer.from(ENCRYPTION_KEY, "hex");

function hmacHash(value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch all rows
  const { data: rows, error } = await supabase
    .from("access_codes")
    .select("id, code, customer_email, encrypted_code");

  if (error) {
    console.error("Failed to fetch rows:", error);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("No rows to migrate.");
    return;
  }

  console.log(`Found ${rows.length} rows. Migrating...`);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    // Skip rows that were already migrated (encrypted_code is set)
    if (row.encrypted_code) {
      skipped++;
      continue;
    }

    const plaintextCode = row.code;
    const plaintextEmail = row.customer_email;

    const updates: Record<string, string | null> = {
      code: hmacHash(plaintextCode),
      encrypted_code: encrypt(plaintextCode),
    };

    if (plaintextEmail) {
      updates.customer_email = hmacHash(plaintextEmail.toLowerCase().trim());
      updates.encrypted_email = encrypt(plaintextEmail.toLowerCase().trim());
    }

    const { error: updateError } = await supabase
      .from("access_codes")
      .update(updates)
      .eq("id", row.id);

    if (updateError) {
      console.error(`Failed to update row ${row.id}:`, updateError);
    } else {
      migrated++;
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped (already migrated).`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

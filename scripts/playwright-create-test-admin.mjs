// One-off, idempotent: creates (or resets the password for) the dedicated
// Playwright test-admin account, then writes its credentials to
// .env.test.local (gitignored via the repo's .env*.local rule).
//
// Run with: node --env-file=.env.local scripts/playwright-create-test-admin.mjs
//
// Uses the production Supabase project directly (decisions/playwright-retrofit-decisions.md
// §2/§4 — no isolated branch). The account is separate from any real admin: it exists only
// so local Playwright runs can log in without touching a real person's credentials.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const TEST_ADMIN_EMAIL = "claudioschmid777+playwright-admin@gmail.com";
const ENV_TEST_LOCAL_PATH = new URL("../.env.test.local", import.meta.url);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with --env-file=.env.local).");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePassword() {
  return randomBytes(24).toString("base64url");
}

async function findExistingUser(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  const password = generatePassword();
  let userId;

  const existing = await findExistingUser(TEST_ADMIN_EMAIL);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (error) throw error;
    userId = existing.id;
    console.log(`Reset password for existing test admin (${TEST_ADMIN_EMAIL}).`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_ADMIN_EMAIL,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created test admin auth user (${TEST_ADMIN_EMAIL}).`);
  }

  const { error: upsertError } = await supabase
    .from("admin_users")
    .upsert({ user_id: userId, email: TEST_ADMIN_EMAIL, display_name: "Playwright Test Admin" }, { onConflict: "user_id" });
  if (upsertError) throw upsertError;
  console.log("Ensured admin_users row exists.");

  const envLines = [
    `PLAYWRIGHT_ADMIN_EMAIL=${TEST_ADMIN_EMAIL}`,
    `PLAYWRIGHT_ADMIN_PASSWORD=${password}`,
    "",
  ];

  let existingEnvContent = "";
  if (existsSync(ENV_TEST_LOCAL_PATH)) {
    existingEnvContent = readFileSync(ENV_TEST_LOCAL_PATH, "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("PLAYWRIGHT_ADMIN_EMAIL=") && !line.startsWith("PLAYWRIGHT_ADMIN_PASSWORD="))
      .join("\n");
  }

  writeFileSync(ENV_TEST_LOCAL_PATH, existingEnvContent.trimEnd() + "\n" + envLines.join("\n"));
  console.log(`Credentials written to .env.test.local (not printed here, not committed).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

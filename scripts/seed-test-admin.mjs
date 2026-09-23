/**
 * Development & QA Only Seed Script: Provision Test Admin User
 * 
 * Usage:
 *   node scripts/seed-test-admin.mjs
 * 
 * Required Environment Variables (in .env or system environment):
 *   VITE_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 * 
 * Optional Overrides:
 *   TEST_ADMIN_EMAIL (default: testadmin@pairuporleave.com)
 *   TEST_ADMIN_PASSWORD (default: TestAdmin2026!Secure)
 *   TEST_ADMIN_ROLE (default: SUPER_ADMIN)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

// 1. Simple .env parser to avoid extra dependencies
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.TEST_ADMIN_EMAIL || "testadmin@pairuporleave.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const adminRole = process.env.TEST_ADMIN_ROLE || "SUPER_ADMIN";

console.log("==================================================");
console.log("PAIR UP OR LEAVE — TEST ADMIN SEED SCRIPT");
console.log("Target Environment: Development / QA Only");
console.log("==================================================");

// Environment & Configuration Validation
if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
  console.error("\n❌ ERROR: SUPABASE_URL / VITE_SUPABASE_URL is not configured.");
  console.error("Please provide your development Supabase URL in your .env file.");
  console.error("Example: VITE_SUPABASE_URL=https://xyzcompany.supabase.co\n");
  process.exit(1);
}

if (!serviceRoleKey || serviceRoleKey === "your-service-role-key") {
  console.error("\n❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is not configured.");
  console.error("The Service Role Key is required to manage Auth users and assign roles.");
  console.error("Find this key in your Supabase Dashboard -> Project Settings -> API.\n");
  console.error("⚠️  NEVER commit this key to Git or expose it to frontend code!\n");
  process.exit(1);
}

if (!adminPassword || adminPassword === "your-secure-test-admin-password") {
  console.error("\n❌ ERROR: TEST_ADMIN_PASSWORD is not configured.");
  console.error("Please provide the test password in your untracked .env file or environment variables.");
  console.error("Example: TEST_ADMIN_PASSWORD=TestAdmin2026!Secure\n");
  process.exit(1);
}

// Safety check against inadvertent production modifications
if (process.env.NODE_ENV === "production" && !process.argv.includes("--force-dev-seed")) {
  console.error("\n🛑 STOP: NODE_ENV is set to 'production'.");
  console.error("This test admin account must only be used in development / staging environments.");
  console.error("Aborting to protect production security.\n");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function run() {
  try {
    console.log(`Connecting to: ${supabaseUrl}`);
    console.log(`Target Admin Email: ${adminEmail}`);
    console.log(`Target Role: ${adminRole}`);

    // 1. Check if user already exists
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      throw new Error(`Failed to list users from Supabase Auth: ${listError.message}`);
    }

    const existingUser = usersData.users.find(
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase()
    );

    let userId = "";

    if (existingUser) {
      userId = existingUser.id;
      console.log(`\n✓ Found existing Supabase Auth user (UUID: ${userId}). Updating credentials...`);

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          role: adminRole,
          name: "Test Administrator",
        },
      });

      if (updateError) {
        throw new Error(`Failed to update existing user: ${updateError.message}`);
      }
      console.log("✓ Supabase Auth user credentials and email confirmation synchronized.");
    } else {
      console.log("\nCreating new Supabase Auth user...");
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          role: adminRole,
          name: "Test Administrator",
        },
      });

      if (createError || !createData.user) {
        throw new Error(`Failed to create Auth user: ${createError?.message}`);
      }

      userId = createData.user.id;
      console.log(`✓ Created new Supabase Auth user (UUID: ${userId}).`);
    }

    // 2. Provision or update admin_users table
    console.log("\nConfiguring 'admin_users' authorization record...");
    const { error: upsertError } = await supabaseAdmin
      .from("admin_users")
      .upsert(
        {
          id: userId,
          email: adminEmail,
          role: adminRole,
        },
        { onConflict: "id" }
      );

    if (upsertError) {
      throw new Error(`Failed to upsert into admin_users table: ${upsertError.message}`);
    }

    console.log(`✓ 'admin_users' record verified with role: ${adminRole}`);

    // 3. Verification check
    const { data: verifyRecord, error: verifyError } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, role, created_at")
      .eq("id", userId)
      .single();

    if (verifyError || !verifyRecord) {
      throw new Error("Verification query failed after upsert.");
    }

    console.log("\n==================================================");
    console.log("🎉 TEST ADMIN PROVISIONING COMPLETE");
    console.log("==================================================");
    console.log(`Auth UUID   : ${verifyRecord.id}`);
    console.log(`Email       : ${verifyRecord.email}`);
    console.log(`Role        : ${verifyRecord.role}`);
    console.log(`Verified At : ${new Date().toISOString()}`);
    console.log("==================================================");
    console.log("You can now log in at /admin/login with your test credentials.");
    console.log("Security Note: Do not share or commit test credentials.\n");
  } catch (err) {
    console.error("\n❌ Provisioning failed:", err.message);
    process.exit(1);
  }
}

run();

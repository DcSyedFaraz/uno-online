// One-command production setup + deploy (Vercel + Neon + Ably).
//
//   npm run deploy
//
// Before the first run, log in once:  vercel login   and   npx --yes neonctl auth
// Re-running is safe: it reuses the Neon project and Vercel project, keeps existing
// environment variables (pass --reset-env to overwrite them) and redeploys.
//
// Secrets are passed to the Vercel CLI over stdin and are never printed.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";

const PROJECT = process.env.PROJECT_NAME ?? "neono";
const RESET_ENV = process.argv.includes("--reset-env");

/** Neon region → nearest Vercel function region. */
const REGIONS = {
  "aws-us-east-1": "iad1",
  "aws-us-east-2": "cle1",
  "aws-us-west-2": "pdx1",
  "aws-eu-central-1": "fra1",
  "aws-eu-west-2": "lhr1",
  "aws-ap-southeast-1": "sin1",
  "aws-ap-southeast-2": "syd1",
  "aws-sa-east-1": "gru1",
};

function run(cmd, args, { input, quiet = false, allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: true, stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (!quiet) process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      err += d;
      if (!quiet) process.stderr.write(d);
    });
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on("close", (code) => {
      if (code === 0 || allowFail) resolve({ code, out, err });
      else reject(new Error(`${cmd} ${args.join(" ")} failed (${code})\n${(err || out).slice(-600)}`));
    });
  });
}

const neon = (args, opts) => run("npx", ["--yes", "neonctl", ...args], opts);
const vercel = (args, opts) => run("vercel", args, opts);

function ask(question, { hidden = false, fallback = "" } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : s.replace(/[^\r\n]/g, "*"));
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a.trim() || fallback);
    });
  });
}

function parseJson(text) {
  const i = text.search(/[[{]/);
  return JSON.parse(text.slice(i));
}

const step = (n, msg) => console.log(`\n\x1b[35m[${n}/6]\x1b[0m ${msg}`);

async function main() {
  step(1, "Checking logins");
  const who = await vercel(["whoami"], { quiet: true, allowFail: true });
  if (who.code !== 0) throw new Error("Vercel CLI is not logged in. Run:  vercel login");
  console.log(`  Vercel: ${who.out.trim().split("\n").pop()}`);
  const me = await neon(["me", "--output", "json"], { quiet: true, allowFail: true });
  if (me.code !== 0) throw new Error("Neon CLI is not logged in. Run:  npx --yes neonctl auth");
  console.log(`  Neon:   ${parseJson(me.out).login ?? parseJson(me.out).email ?? "ok"}`);

  step(2, "Neon database");
  const list = parseJson((await neon(["projects", "list", "--output", "json"], { quiet: true })).out);
  const projects = Array.isArray(list) ? list : (list.projects ?? []);
  let project = projects.find((p) => p.name === PROJECT);
  if (project) {
    console.log(`  Reusing Neon project "${PROJECT}" (${project.region_id})`);
  } else {
    const region = await ask(`  Region for the new database [aws-us-east-1] (${Object.keys(REGIONS).join(", ")}): `, {
      fallback: "aws-us-east-1",
    });
    if (!REGIONS[region]) throw new Error(`Unknown region ${region}`);
    const created = parseJson((await neon(["projects", "create", "--name", PROJECT, "--region-id", region, "--output", "json"], { quiet: true })).out);
    project = created.project ?? created;
    console.log(`  Created Neon project "${PROJECT}" in ${region}`);
  }
  const dbUrl = (await neon(["connection-string", "--project-id", project.id, "--pooled"], { quiet: true })).out.trim().split(/\s+/).pop();
  if (!/^postgres(ql)?:\/\//.test(dbUrl)) throw new Error("Could not read the Neon connection string");

  step(3, "Vercel project");
  await vercel(["link", "--yes", "--project", PROJECT], { quiet: true });
  console.log(`  Linked to Vercel project "${PROJECT}"`);

  // keep functions next to the database
  const fnRegion = REGIONS[project.region_id] ?? "iad1";
  const vj = JSON.parse(await readFile("vercel.json", "utf8"));
  if (vj.regions?.[0] !== fnRegion) {
    vj.regions = [fnRegion];
    await writeFile("vercel.json", JSON.stringify(vj, null, 2) + "\n");
    console.log(`  Function region set to ${fnRegion} (next to Neon ${project.region_id})`);
  }

  step(4, "Environment variables");
  const existing = (await vercel(["env", "ls", "production"], { quiet: true, allowFail: true })).out;
  const has = (name) => new RegExp(`\\b${name}\\b`).test(existing);
  let ably = process.env.ABLY_API_KEY ?? "";
  if (!ably && (RESET_ENV || !has("ABLY_API_KEY"))) {
    console.log("  Ably: create a free app at https://ably.com → API Keys, and copy the root key.");
    ably = await ask("  Paste your Ably API key (hidden): ", { hidden: true });
    if (!/^[\w-]+\.[\w-]+:.+$/.test(ably)) throw new Error("That doesn't look like an Ably key (appId.keyId:secret)");
  }
  const vars = {
    DATABASE_URL: dbUrl,
    ABLY_API_KEY: ably,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    CRON_SECRET: randomBytes(24).toString("hex"),
  };
  for (const [name, value] of Object.entries(vars)) {
    if (has(name) && !RESET_ENV) {
      console.log(`  ${name}: already set (kept)`);
      continue;
    }
    if (!value) continue;
    await vercel(["env", "add", name, "production", "--sensitive", "--force"], { input: value, quiet: true });
    console.log(`  ${name}: set`);
  }

  step(5, "Deploying to production (this takes a minute)");
  const dep = await vercel(["deploy", "--prod", "--yes"], { quiet: true });
  const url = (dep.out + dep.err).match(/https:\/\/[^\s]+\.vercel\.app/g)?.pop();

  step(6, "Done");
  console.log(`  Your game is live: \x1b[32m${url ?? "(see the Vercel dashboard)"}\x1b[0m`);
  console.log("  Share a room link like  <url>/r/ABC123  with your friends.");
}

main().catch((e) => {
  console.error(`\n\x1b[31m✖ ${e.message}\x1b[0m`);
  process.exit(1);
});

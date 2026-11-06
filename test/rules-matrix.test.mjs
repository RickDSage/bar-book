// Every collection in firestore.rules, found by reading the rules file itself, so a collection added later is checked
// without anyone remembering to list it here:
//   - a visitor who isn't logged in, and someone signed in who isn't on the team, can't read, list or write any of it
//     (one username lookup is the only public read, for logging in);
//   - where the rules say managers only (allow read: if isManager()), staff can't read or list it either.
// Run with the rest: npm run test:rules
import { test, before, after, describe } from "node:test";
import fs from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, collection, serverTimestamp } from "firebase/firestore";

const RULES = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: "demo-bar-book-matrix", firestore: { host, port: +port, rules: RULES } }); });
after(() => env?.cleanup());
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

// Each match block's path, made concrete ({day} becomes a date, any other {x} becomes "a"), and its read rule.
const blocks = [];
for (const m of RULES.matchAll(/^ {4}match (\/[^ ]+) \{\n([\s\S]*?)^ {4}\}/gm)) {
  const path = m[1].slice(1).replace(/\{day\}/g, "2026-11-06").replace(/\{[a-z]+\}/gi, "a");
  const read = (m[2].match(/allow (?:read|list)[^:]*: if ([^;]+);/) || [])[1]?.trim() || "";
  blocks.push({ path, read, coll: path.split("/").slice(0, -1).join("/") });
}

test("the rules file names the collections this checks", () => {
  if (blocks.length < 40) throw new Error(`only ${blocks.length} collections found: has the rules file's layout changed?`);
});

describe("nobody outside the team gets anything", () => {
  before(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const s = ctx.firestore();
      await setDoc(doc(s, "staff/sam"), { name: "Sam Staff", username: "sam", role: "staff" });
      for (const b of blocks) await setDoc(doc(s, b.path), { name: "x", uid: "sam", at: new Date() });
    });
  });
  for (const who of [null, "stranger"]) {
    const label = who ? "someone not on the team" : "a visitor";
    for (const b of blocks) {
      if (b.path === "usernames/a") continue;
      test(`${label} can't read ${b.path}`, () => assertFails(getDoc(doc(db(who), b.path))));
      test(`${label} can't list ${b.coll}`, () => assertFails(getDocs(collection(db(who), b.coll))));
    }
    for (const b of blocks) test(`${label} can't write ${b.path}`, () => assertFails(setDoc(doc(db(who), b.path), { name: "x", uid: who || "x", at: serverTimestamp() })));
  }
});

describe("managers-only collections stay with managers", () => {
  const managersOnly = blocks.filter((b) => b.read === "isManager()");
  test("there are some", () => { if (managersOnly.length < 8) throw new Error(`only ${managersOnly.length} found`); });
  before(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const s = ctx.firestore();
      await setDoc(doc(s, "staff/sam"), { name: "Sam Staff", username: "sam", role: "staff" });
      for (const b of managersOnly) await setDoc(doc(s, b.path), { name: "x", uid: "mia", at: new Date() });
    });
  });
  for (const b of managersOnly) {
    test(`staff can't read ${b.path}`, () => assertFails(getDoc(doc(db("sam"), b.path))));
    test(`staff can't list ${b.coll}`, () => assertFails(getDocs(collection(db("sam"), b.coll))));
  }
});

import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api.js";

const url = process.env.VITE_CONVEX_URL;
console.log("convex url present:", !!url);
const client = new ConvexHttpClient(url);

const seedRes = await client.action(api.seed.seed, {});
console.log("seed:", JSON.stringify(seedRes));

const events = await client.query(api.events.listPublic, {});
console.log("events:", events.map((e) => `${e.slug} (${e.status})`).join(", "));

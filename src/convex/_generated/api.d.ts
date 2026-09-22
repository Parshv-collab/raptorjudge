/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acceptance from "../acceptance.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as certificates from "../certificates.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as crypto from "../crypto.js";
import type * as events from "../events.js";
import type * as exports from "../exports.js";
import type * as http from "../http.js";
import type * as httpPublic from "../httpPublic.js";
import type * as judging from "../judging.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_common from "../lib/common.js";
import type * as normalization from "../normalization.js";
import type * as pairwise from "../pairwise.js";
import type * as seed from "../seed.js";
import type * as submissions from "../submissions.js";
import type * as teams from "../teams.js";
import type * as tracks from "../tracks.js";
import type * as users from "../users.js";
import type * as voting from "../voting.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acceptance: typeof acceptance;
  audit: typeof audit;
  auth: typeof auth;
  certificates: typeof certificates;
  comments: typeof comments;
  crons: typeof crons;
  crypto: typeof crypto;
  events: typeof events;
  exports: typeof exports;
  http: typeof http;
  httpPublic: typeof httpPublic;
  judging: typeof judging;
  "lib/audit": typeof lib_audit;
  "lib/common": typeof lib_common;
  normalization: typeof normalization;
  pairwise: typeof pairwise;
  seed: typeof seed;
  submissions: typeof submissions;
  teams: typeof teams;
  tracks: typeof tracks;
  users: typeof users;
  voting: typeof voting;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

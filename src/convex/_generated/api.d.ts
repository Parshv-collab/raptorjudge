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
import type * as admin from "../admin.js";
import type * as adminReset from "../adminReset.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as branding from "../branding.js";
import type * as certificates from "../certificates.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as crypto from "../crypto.js";
import type * as events from "../events.js";
import type * as exports from "../exports.js";
import type * as help from "../help.js";
import type * as http from "../http.js";
import type * as httpPublic from "../httpPublic.js";
import type * as imports from "../imports.js";
import type * as judging from "../judging.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authProvider from "../lib/authProvider.js";
import type * as lib_common from "../lib/common.js";
import type * as lib_defaultRubric from "../lib/defaultRubric.js";
import type * as lib_fixturesData from "../lib/fixturesData.js";
import type * as lib_jwt from "../lib/jwt.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_results from "../lib/results.js";
import type * as lib_secretBox from "../lib/secretBox.js";
import type * as lib_securityChecks from "../lib/securityChecks.js";
import type * as lib_signInErrors from "../lib/signInErrors.js";
import type * as lib_timeWindows from "../lib/timeWindows.js";
import type * as lib_webhookSignature from "../lib/webhookSignature.js";
import type * as lib_wellKnown from "../lib/wellKnown.js";
import type * as mfa from "../mfa.js";
import type * as normalization from "../normalization.js";
import type * as notifications from "../notifications.js";
import type * as pairwise from "../pairwise.js";
import type * as participate from "../participate.js";
import type * as seed from "../seed.js";
import type * as submissions from "../submissions.js";
import type * as teamChat from "../teamChat.js";
import type * as teams from "../teams.js";
import type * as tracks from "../tracks.js";
import type * as users from "../users.js";
import type * as voting from "../voting.js";
import type * as webhooks from "../webhooks.js";
import type * as winnerOverrides from "../winnerOverrides.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acceptance: typeof acceptance;
  admin: typeof admin;
  adminReset: typeof adminReset;
  audit: typeof audit;
  auth: typeof auth;
  branding: typeof branding;
  certificates: typeof certificates;
  comments: typeof comments;
  crons: typeof crons;
  crypto: typeof crypto;
  events: typeof events;
  exports: typeof exports;
  help: typeof help;
  http: typeof http;
  httpPublic: typeof httpPublic;
  imports: typeof imports;
  judging: typeof judging;
  "lib/audit": typeof lib_audit;
  "lib/authProvider": typeof lib_authProvider;
  "lib/common": typeof lib_common;
  "lib/defaultRubric": typeof lib_defaultRubric;
  "lib/fixturesData": typeof lib_fixturesData;
  "lib/jwt": typeof lib_jwt;
  "lib/rbac": typeof lib_rbac;
  "lib/results": typeof lib_results;
  "lib/secretBox": typeof lib_secretBox;
  "lib/securityChecks": typeof lib_securityChecks;
  "lib/signInErrors": typeof lib_signInErrors;
  "lib/timeWindows": typeof lib_timeWindows;
  "lib/webhookSignature": typeof lib_webhookSignature;
  "lib/wellKnown": typeof lib_wellKnown;
  mfa: typeof mfa;
  normalization: typeof normalization;
  notifications: typeof notifications;
  pairwise: typeof pairwise;
  participate: typeof participate;
  seed: typeof seed;
  submissions: typeof submissions;
  teamChat: typeof teamChat;
  teams: typeof teams;
  tracks: typeof tracks;
  users: typeof users;
  voting: typeof voting;
  webhooks: typeof webhooks;
  winnerOverrides: typeof winnerOverrides;
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

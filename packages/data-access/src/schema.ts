/**
 * FlowPilot — Drizzle schema (SQLite dialect for desktop).
 *
 * Authored once; the Postgres build (cloud, §21) mirrors this file using
 * drizzle-orm/pg-core with `text` → `uuid`/`timestamptz` and RLS policies keyed
 * on `team_id` (see ADR 0005). Repositories in this package are the only code
 * that imports these tables — services depend on repository interfaces (ADR 0003).
 *
 * Conventions:
 *  - IDs are UUIDv7 strings (time-sortable), generated in the app layer.
 *  - Timestamps are UTC ISO-8601 strings.
 *  - Every tenant-scoped table carries team_id (ADR 0005).
 *  - JSON columns hold flexible/evolving payloads; query-critical fields are columns.
 */

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ---------- shared column helpers ---------- */

const id = () =>
  text("id").primaryKey().notNull(); // UUIDv7, generated in app layer

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

/* ---------- teams & users ---------- */

export const teams = sqliteTable(
  "teams",
  {
    id: id(),
    name: text("name").notNull(),
    plan: text("plan", { enum: ["free", "pro", "enterprise"] }).notNull().default("free"),
    seatsLimit: integer("seats_limit").notNull().default(1),
    ssoConfig: text("sso_config", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({ planIdx: index("teams_plan_idx").on(t.plan) }),
);

export const users = sqliteTable(
  "users",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role", { enum: ["owner", "admin", "editor", "viewer"] }).notNull().default("owner"),
    authProvider: text("auth_provider", { enum: ["local", "oidc", "saml"] }).notNull().default("local"),
    status: text("status", { enum: ["active", "invited", "disabled"] }).notNull().default("active"),
    lastLoginAt: text("last_login_at"),
    ...timestamps,
  },
  (t) => ({
    teamIdx: index("users_team_idx").on(t.teamId),
    emailUq: uniqueIndex("users_team_email_uq").on(t.teamId, t.email),
  }),
);

/* ---------- projects & websites ---------- */

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    environment: text("environment", { enum: ["prod", "staging", "local", "custom"] }).notNull().default("prod"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    defaultBrowserId: text("default_browser_id"),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (t) => ({
    teamIdx: index("projects_team_idx").on(t.teamId),
    nameIdx: index("projects_team_name_idx").on(t.teamId, t.name),
  }),
);

export const websites = sqliteTable(
  "websites",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    authType: text("auth_type", { enum: ["none", "basic", "cookie", "token", "form"] }).notNull().default("none"),
    secretRef: text("secret_ref"), // OS keychain reference — NOT the secret
    headers: text("headers", { mode: "json" }),
    crawlScope: text("crawl_scope", { mode: "json" }),
    defaultProfileId: text("default_profile_id"),
    ...timestamps,
  },
  (t) => ({ projectIdx: index("websites_project_idx").on(t.projectId) }),
);

export const profiles = sqliteTable(
  "profiles",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    websiteId: text("website_id").references(() => websites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    viewport: text("viewport", { mode: "json" }).$type<{ width: number; height: number; dpr: number }>(),
    userAgent: text("user_agent"),
    locale: text("locale"),
    timezone: text("timezone"),
    throttle: text("throttle", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({ websiteIdx: index("profiles_website_idx").on(t.websiteId) }),
);

/* ---------- browsers ---------- */

export const browsers = sqliteTable(
  "browsers",
  {
    id: id(),
    engine: text("engine", { enum: ["chromium", "firefox", "webkit"] }).notNull(),
    channel: text("channel", { enum: ["stable", "beta", "dev"] }).notNull().default("stable"),
    version: text("version").notNull(),
    executablePath: text("executable_path"),
    checksum: text("checksum"),
    installedAt: text("installed_at"),
    ...timestamps,
  },
  (t) => ({ engineUq: uniqueIndex("browsers_engine_channel_version_uq").on(t.engine, t.channel, t.version) }),
);

/* ---------- scenarios & versions ---------- */

export const scenarios = sqliteTable(
  "scenarios",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    currentVersionId: text("current_version_id"),
    type: text("type", { enum: ["test", "audit", "crawl", "screenshot", "composite"] }).notNull().default("test"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("scenarios_project_idx").on(t.projectId),
    typeIdx: index("scenarios_project_type_idx").on(t.projectId, t.type),
  }),
);

export const scenarioVersions = sqliteTable(
  "scenario_versions",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    scenarioId: text("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: text("definition", { mode: "json" }).notNull(), // Scenario JSON (§10.6)
    authorId: text("author_id").references(() => users.id),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({ versionUq: uniqueIndex("scenario_versions_uq").on(t.scenarioId, t.version) }),
);

/* ---------- schedules ---------- */

export const schedules = sqliteTable(
  "schedules",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    conditions: text("conditions", { mode: "json" }),
    notify: text("notify", { mode: "json" }),
    nextRunAt: text("next_run_at"),
    lastRunAt: text("last_run_at"),
    ...timestamps,
  },
  (t) => ({ pollIdx: index("schedules_poll_idx").on(t.enabled, t.nextRunAt) }),
);

/* ---------- runs (central fact table) ---------- */

export const runs = sqliteTable(
  "runs",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").notNull().references(() => scenarios.id),
    scenarioVersionId: text("scenario_version_id").references(() => scenarioVersions.id),
    browserId: text("browser_id").references(() => browsers.id),
    profileId: text("profile_id").references(() => profiles.id),
    trigger: text("trigger", { enum: ["manual", "schedule", "api", "ci"] }).notNull().default("manual"),
    scheduleId: text("schedule_id").references(() => schedules.id),
    status: text("status", {
      enum: ["queued", "running", "passed", "failed", "error", "canceled"],
    }).notNull().default("queued"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    durationMs: integer("duration_ms"),
    stepCount: integer("step_count"),
    passedSteps: integer("passed_steps"),
    failedSteps: integer("failed_steps"),
    summary: text("summary", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({
    projectStartedIdx: index("runs_project_started_idx").on(t.projectId, t.startedAt),
    scenarioStartedIdx: index("runs_scenario_started_idx").on(t.scenarioId, t.startedAt),
    statusIdx: index("runs_status_idx").on(t.status),
  }),
);

/* ---------- logs / screenshots / metrics / network / errors / diffs ---------- */

export const logs = sqliteTable(
  "logs",
  {
    id: id(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["app", "automation", "browser", "network", "console", "crash"] }).notNull(),
    level: text("level", { enum: ["debug", "info", "warn", "error", "fatal"] }).notNull().default("info"),
    stepIndex: integer("step_index"),
    message: text("message"),
    context: text("context", { mode: "json" }),
    ts: text("ts").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    runTsIdx: index("logs_run_ts_idx").on(t.runId, t.ts),
    runSourceLevelIdx: index("logs_run_source_level_idx").on(t.runId, t.source, t.level),
  }),
);

export const screenshots = sqliteTable(
  "screenshots",
  {
    id: id(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index"),
    kind: text("kind", { enum: ["full", "element", "viewport", "baseline", "diff"] }).notNull(),
    fileHash: text("file_hash").notNull(), // content-address into file store
    width: integer("width"),
    height: integer("height"),
    device: text("device"),
    meta: text("meta", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({
    runIdx: index("screenshots_run_idx").on(t.runId),
    hashIdx: index("screenshots_hash_idx").on(t.fileHash),
  }),
);

export const performanceMetrics = sqliteTable(
  "performance_metrics",
  {
    id: id(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    ttfbMs: real("ttfb_ms"),
    fcpMs: real("fcp_ms"),
    lcpMs: real("lcp_ms"),
    domReadyMs: real("dom_ready_ms"),
    loadMs: real("load_ms"),
    cls: real("cls"),
    tbtMs: real("tbt_ms"),
    inpMs: real("inp_ms"),
    requestsTotal: integer("requests_total"),
    requestsFailed: integer("requests_failed"),
    transferBytes: integer("transfer_bytes"),
    jsHeapBytes: integer("js_heap_bytes"),
    cpuMs: integer("cpu_ms"),
    collectedAt: text("collected_at"),
    ...timestamps,
  },
  (t) => ({
    runIdx: index("perf_run_idx").on(t.runId),
    urlTrendIdx: index("perf_url_collected_idx").on(t.url, t.collectedAt),
  }),
);

export const networkLogs = sqliteTable(
  "network_logs",
  {
    id: id(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    method: text("method"),
    status: integer("status"),
    resourceType: text("resource_type"),
    durationMs: real("duration_ms"),
    sizeBytes: integer("size_bytes"),
    fromCache: integer("from_cache", { mode: "boolean" }),
    harRef: text("har_ref"), // pointer to HAR file; bodies never inline
  },
  (t) => ({
    runStatusIdx: index("network_run_status_idx").on(t.runId, t.status),
    runTypeIdx: index("network_run_type_idx").on(t.runId, t.resourceType),
  }),
);

export const errors = sqliteTable(
  "errors",
  {
    id: id(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["assertion", "js_exception", "network", "timeout", "a11y", "seo", "visual"],
    }).notNull(),
    fingerprint: text("fingerprint"), // hash for clustering
    severity: text("severity", { enum: ["critical", "high", "medium", "low", "info"] }).notNull().default("medium"),
    message: text("message"),
    stack: text("stack"),
    stepIndex: integer("step_index"),
    context: text("context", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({
    runSeverityIdx: index("errors_run_severity_idx").on(t.runId, t.severity),
    fingerprintIdx: index("errors_fingerprint_idx").on(t.fingerprint),
  }),
);

export const visualDiffs = sqliteTable(
  "visual_diffs",
  {
    id: id(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    baselineScreenshotId: text("baseline_screenshot_id").references(() => screenshots.id),
    candidateScreenshotId: text("candidate_screenshot_id").references(() => screenshots.id),
    diffScreenshotId: text("diff_screenshot_id").references(() => screenshots.id),
    mismatchPct: real("mismatch_pct"),
    status: text("status", { enum: ["match", "changed", "approved", "rejected"] }).notNull().default("changed"),
    ignoreRegions: text("ignore_regions", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({
    runIdx: index("visual_diffs_run_idx").on(t.runId),
    statusIdx: index("visual_diffs_status_idx").on(t.status),
  }),
);

/* ---------- plugins & settings ---------- */

export const plugins = sqliteTable(
  "plugins",
  {
    id: id(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    source: text("source", { enum: ["builtin", "marketplace", "local"] }).notNull().default("local"),
    manifest: text("manifest", { mode: "json" }),
    signature: text("signature"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    installedAt: text("installed_at"),
    ...timestamps,
  },
  (t) => ({ nameUq: uniqueIndex("plugins_name_uq").on(t.name) }),
);

export const pluginSettings = sqliteTable(
  "plugin_settings",
  {
    id: id(),
    pluginId: text("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    config: text("config", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({ scopeUq: uniqueIndex("plugin_settings_scope_uq").on(t.pluginId, t.projectId) }),
);

export const settings = sqliteTable(
  "settings",
  {
    id: id(),
    scope: text("scope", { enum: ["app", "team", "project"] }).notNull(),
    scopeId: text("scope_id"),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }),
    ...timestamps,
  },
  (t) => ({ scopeKeyUq: uniqueIndex("settings_scope_key_uq").on(t.scope, t.scopeId, t.key) }),
);

/* ---------- audit log (append-only, hash-chained) & AI history ---------- */

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: text("metadata", { mode: "json" }),
    prevHash: text("prev_hash"), // hash chain for tamper evidence (§14.6)
    hash: text("hash"),
    ts: text("ts").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    teamTsIdx: index("audit_team_ts_idx").on(t.teamId, t.ts),
    actorTsIdx: index("audit_actor_ts_idx").on(t.actorId, t.ts),
  }),
);

export const aiHistory = sqliteTable(
  "ai_history",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => teams.id),
    runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    feature: text("feature", {
      enum: ["failure_analysis", "test_gen", "summary", "a11y_fix", "seo_fix", "performance"],
    }).notNull(),
    provider: text("provider"),
    model: text("model"),
    promptRef: text("prompt_ref"), // redacted pointer
    response: text("response", { mode: "json" }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    accepted: integer("accepted", { mode: "boolean" }),
    createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    projectCreatedIdx: index("ai_history_project_created_idx").on(t.projectId, t.createdAt),
    featureIdx: index("ai_history_feature_idx").on(t.feature),
  }),
);

/* ---------- export a barrel for repositories & drizzle-kit ---------- */

export const schema = {
  teams,
  users,
  projects,
  websites,
  profiles,
  browsers,
  scenarios,
  scenarioVersions,
  schedules,
  runs,
  logs,
  screenshots,
  performanceMetrics,
  networkLogs,
  errors,
  visualDiffs,
  plugins,
  pluginSettings,
  settings,
  auditLogs,
  aiHistory,
};

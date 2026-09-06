import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  verificationCodeHash: text('verification_code_hash'),
  verificationExpiresAt: integer('verification_expires_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_users_email').on(table.email)]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
}, (table) => [
  uniqueIndex('idx_sessions_token_hash').on(table.tokenHash),
  index('idx_sessions_user_id').on(table.userId),
  index('idx_sessions_expires_at').on(table.expiresAt),
]);

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
}, (table) => [uniqueIndex('idx_organizations_slug').on(table.slug)]);

export const organizationMembers = sqliteTable('organization_members', {
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  status: text('status').notNull().default('active'),
  joinedAt: integer('joined_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
  index('idx_organization_members_user').on(table.userId, table.status),
]);

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  severity: text('severity').notNull().default('SEV-1'),
  status: text('status').notNull().default('open'),
  visibility: text('visibility').notNull().default('restricted'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_rooms_organization_slug').on(table.organizationId, table.slug),
  index('idx_rooms_organization_status').on(table.organizationId, table.status),
]);

export const roomMembers = sqliteTable('room_members', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('observer'),
  canInvite: integer('can_invite', { mode: 'boolean' }).notNull().default(false),
  joinedAt: integer('joined_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.roomId, table.userId] }),
  index('idx_room_members_user').on(table.userId),
]);

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  kind: text('kind').notNull().default('human'),
  accent: text('accent').notNull().default('violet'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_teams_organization_name').on(table.organizationId, table.name),
  index('idx_teams_organization_kind').on(table.organizationId, table.kind),
]);

export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  addedAt: integer('added_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.teamId, table.userId] }),
  index('idx_team_members_user').on(table.userId),
]);

export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
  email: text('email'),
  targetType: text('target_type').notNull(),
  roomRole: text('room_role').notNull().default('observer'),
  tokenHash: text('token_hash').notNull(),
  invitedBy: text('invited_by').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  acceptedBy: text('accepted_by').references(() => users.id),
  acceptedAt: integer('accepted_at'),
}, (table) => [
  uniqueIndex('idx_invitations_token_hash').on(table.tokenHash),
  index('idx_invitations_room_status').on(table.roomId, table.status),
  index('idx_invitations_email_status').on(table.email, table.status),
]);

export const roomAgents = sqliteTable('room_agents', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  addedBy: text('added_by').notNull().references(() => users.id),
  addedAt: integer('added_at').notNull(),
}, (table) => [primaryKey({ columns: [table.roomId, table.profileId] })]);

export const dailyUsage = sqliteTable('daily_usage', {
  id: text('id').primaryKey(),
  usageDate: text('usage_date').notNull(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  count: integer('count').notNull().default(0),
  limitValue: integer('limit_value').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_daily_usage_identity').on(table.usageDate, table.organizationId, table.userId, table.scope),
  index('idx_daily_usage_user_date').on(table.userId, table.usageDate),
]);

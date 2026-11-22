import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import type { WorkflowDefinition } from '../shared/workflowSchema.ts';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const models = pgTable('models', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filename: text('filename').notNull(),
  storagePath: text('storage_path').notNull(),
  format: text('format').notNull(), // 'onnx' | 'pt'
  task: text('task').notNull(), // 'detect' | 'segment' | 'pose'
  classNames: jsonb('class_names').$type<string[]>().notNull(),
  inputShape: jsonb('input_shape').$type<number[]>().notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workflows = pgTable('workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('draft'), // 'draft' | 'deployed'
  definition: jsonb('definition').$type<WorkflowDefinition>().notNull(),
  apiKey: text('api_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const streams = pgTable('streams', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .references(() => workflows.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  rtspUrl: text('rtsp_url').notNull(),
  sourceType: text('source_type').notNull().default('rtsp'),
  sinkType: text('sink_type').notNull().default('mjpeg'),
  sinkConfig: jsonb('sink_config').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('stopped'),
  fpsTarget: real('fps_target').notNull().default(2),
  framesProcessed: integer('frames_processed').notNull().default(0),
  lastFrameAt: timestamp('last_frame_at'),
  lastResult: jsonb('last_result').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inferenceRuns = pgTable('inference_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').references(() => workflows.id, {
    onDelete: 'cascade',
  }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  sourceType: text('source_type').notNull(),
  durationMs: integer('duration_ms').notNull(),
  detectionCount: integer('detection_count').notNull().default(0),
  resultSummary: jsonb('result_summary').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

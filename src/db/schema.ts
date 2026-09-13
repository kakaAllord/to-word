import {
  boolean,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** uploaded -> transcribing -> proofreading -> delivered -> paid, plus failed. */
export const TASK_STATUSES = [
  'uploaded',
  'transcribing',
  'proofreading',
  'delivered',
  'paid',
  'failed',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const JOB_STATES = ['queued', 'running', 'done', 'failed'] as const;
export type JobState = (typeof JOB_STATES)[number];

/** One row per audio file per invoice. */
export const task = pgTable('task', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('uploaded'),
  sourceFilename: text('source_filename'),
  audioPath: text('audio_path'),
  durationSeconds: real('duration_seconds'),
  language: text('language').default('swa'),
  provider: text('provider').default('elevenlabs'),
  providerModel: text('provider_model').default('scribe_v1'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});

/** One row per diarized turn. This is the unit of editing. */
export const segment = pgTable(
  'segment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    startSeconds: real('start_seconds').notNull(),
    endSeconds: real('end_seconds').notNull(),
    rawSpeaker: text('raw_speaker'),
    /** Never mutated after insert. */
    originalText: text('original_text').notNull(),
    editedText: text('edited_text').notNull(),
    /**
     * Per-segment speaker fix (spec 9). Diarization occasionally misattributes a
     * single turn; this overrides the speaker_map for this row only.
     */
    speakerOverride: text('speaker_override'),
    confirmed: boolean('confirmed').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('segment_task_idx_unique').on(t.taskId, t.idx)],
);

/** Maps provider speaker ids to the labels the client expects. Many-to-one. */
export const speakerMap = pgTable(
  'speaker_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    rawSpeaker: text('raw_speaker').notNull(),
    label: text('label').notNull(),
  },
  (t) => [unique('speaker_map_task_raw_unique').on(t.taskId, t.rawSpeaker)],
);

/** Find-and-replace terms. task_id null = applies to every task. */
export const glossaryTerm = pgTable('glossary_term', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => task.id, { onDelete: 'cascade' }),
  wrong: text('wrong').notNull(),
  right: text('right').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Queue. The worker claims rows with FOR UPDATE SKIP LOCKED. */
export const job = pgTable('job', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => task.id, { onDelete: 'cascade' }),
  state: text('state').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof task.$inferSelect;
export type Segment = typeof segment.$inferSelect;
export type SpeakerMap = typeof speakerMap.$inferSelect;
export type GlossaryTerm = typeof glossaryTerm.$inferSelect;
export type Job = typeof job.$inferSelect;

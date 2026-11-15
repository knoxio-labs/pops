CREATE TABLE `upload_store` (
	`id` integer PRIMARY KEY NOT NULL,
	`guard_id` text NOT NULL,
	CONSTRAINT "upload_store_singleton" CHECK("upload_store"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`input` text NOT NULL,
	`state` text NOT NULL,
	`claim` text,
	`task_id` text,
	`document_id` integer,
	`reason` text,
	`content_available` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "uploads_known_state" CHECK("uploads"."state" IN ('awaiting_content', 'admitted', 'dispatching', 'outcome_unknown', 'accepted', 'done', 'duplicate', 'failed')),
	CONSTRAINT "uploads_positive_document" CHECK("uploads"."document_id" IS NULL OR "uploads"."document_id" > 0),
	CONSTRAINT "uploads_original_proof" CHECK("uploads"."state" NOT IN ('done', 'duplicate') OR ("uploads"."task_id" IS NOT NULL AND "uploads"."document_id" IS NOT NULL)),
	CONSTRAINT "uploads_task_proof" CHECK("uploads"."state" NOT IN ('accepted', 'failed') OR "uploads"."task_id" IS NOT NULL)
);

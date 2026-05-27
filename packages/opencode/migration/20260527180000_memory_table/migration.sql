CREATE TABLE `memory` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`memory_type` text DEFAULT 'semantic' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`importance` real DEFAULT 0.5 NOT NULL,
	`project_id` text DEFAULT 'default' NOT NULL,
	`source` text DEFAULT 'chat' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`confidence` real DEFAULT 1.0 NOT NULL,
	`embedding` text,
	`embedding_model` text
);--> statement-breakpoint
CREATE INDEX `memory_project_id_idx` ON `memory` (`project_id`);--> statement-breakpoint
CREATE INDEX `memory_memory_type_idx` ON `memory` (`memory_type`);--> statement-breakpoint
CREATE INDEX `memory_confidence_idx` ON `memory` (`confidence`);--> statement-breakpoint
CREATE INDEX `memory_importance_idx` ON `memory` (`importance`);--> statement-breakpoint
CREATE INDEX `memory_created_at_idx` ON `memory` (`created_at`);

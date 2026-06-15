ALTER TABLE `memory` ADD `feedback` text;--> statement-breakpoint
ALTER TABLE `memory` ADD `cue_variants` text;--> statement-breakpoint
ALTER TABLE `memory` ADD `search_count` integer DEFAULT 0 NOT NULL;

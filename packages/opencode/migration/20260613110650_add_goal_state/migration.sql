CREATE TABLE `eval_run` (
	`id` text PRIMARY KEY,
	`suite_id` text NOT NULL,
	`suite_name` text NOT NULL,
	`pass_rate` real NOT NULL,
	`total_scenarios` integer NOT NULL,
	`passed` integer NOT NULL,
	`failed` integer NOT NULL,
	`avg_duration_ms` real NOT NULL,
	`total_duration_ms` real NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`total_tool_calls` integer DEFAULT 0 NOT NULL,
	`agent` text,
	`model` text,
	`created_at` integer NOT NULL,
	`tags` text,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `eval_scenario_result` (
	`id` text PRIMARY KEY,
	`run_id` text NOT NULL,
	`scenario_id` text NOT NULL,
	`scenario_name` text NOT NULL,
	`passed` integer NOT NULL,
	`behaviors_matched` integer NOT NULL,
	`behaviors_total` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`tokens_used` integer DEFAULT 0,
	`tool_calls` integer DEFAULT 0,
	`errors` text,
	`output` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_eval_scenario_result_run_id_eval_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `eval_run`(`id`)
);
--> statement-breakpoint
ALTER TABLE `session` ADD `goal_state` text;--> statement-breakpoint
CREATE INDEX `eval_run_suite_idx` ON `eval_run` (`suite_id`);--> statement-breakpoint
CREATE INDEX `eval_run_created_idx` ON `eval_run` (`created_at`);--> statement-breakpoint
CREATE INDEX `eval_scenario_run_idx` ON `eval_scenario_result` (`run_id`);--> statement-breakpoint
CREATE INDEX `eval_scenario_id_idx` ON `eval_scenario_result` (`scenario_id`);
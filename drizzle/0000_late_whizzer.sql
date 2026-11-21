CREATE TABLE `ornament_allocator` (
	`id` integer PRIMARY KEY NOT NULL,
	`next_slot` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ornaments` (
	`id` text PRIMARY KEY NOT NULL,
	`initials` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`slot` integer NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`byte_size` integer NOT NULL,
	`preview_key` text NOT NULL,
	`preview_byte_size` integer NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ornaments_object_key_unique` ON `ornaments` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ornaments_preview_key_unique` ON `ornaments` (`preview_key`);--> statement-breakpoint
CREATE INDEX `ornaments_slot_idx` ON `ornaments` (`slot`);--> statement-breakpoint
CREATE INDEX `ornaments_created_at_idx` ON `ornaments` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ornaments_active_slot_idx` ON `ornaments` (`slot`) WHERE "ornaments"."archived_at" IS NULL AND "ornaments"."deleted_at" IS NULL;
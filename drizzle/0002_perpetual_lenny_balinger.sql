ALTER TABLE `activities` ADD `recordStatus` enum('active','inactive') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `inactivatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `interactions` ADD `recordStatus` enum('active','inactive') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `interactions` ADD `inactivatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `recordStatus` enum('active','inactive') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `inactivatedAt` timestamp;
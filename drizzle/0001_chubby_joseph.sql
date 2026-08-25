CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('task','appointment') NOT NULL DEFAULT 'task',
	`title` varchar(200) NOT NULL,
	`description` text,
	`clientId` int,
	`opportunityId` int,
	`assigneeId` int NOT NULL,
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
	`dueAt` timestamp,
	`completedAt` timestamp,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int NOT NULL,
	`summary` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('person','company') NOT NULL,
	`name` varchar(200) NOT NULL,
	`document` varchar(32),
	`email` varchar(320),
	`phone` varchar(40),
	`city` varchar(120),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`inactivatedAt` timestamp,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`jobTitle` varchar(120),
	`email` varchar(320),
	`phone` varchar(40),
	`isPrimary` enum('yes','no') NOT NULL DEFAULT 'no',
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`inactivatedAt` timestamp,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('call','meeting','email','message','note') NOT NULL,
	`description` text NOT NULL,
	`clientId` int,
	`opportunityId` int,
	`authorId` int NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`estimatedValue` decimal(14,2) NOT NULL DEFAULT '0',
	`stage` enum('prospecting','qualification','proposal','negotiation','won','lost') NOT NULL DEFAULT 'prospecting',
	`expectedCloseDate` date,
	`lossReason` varchar(250),
	`ownerId` int NOT NULL,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `opportunities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `activities_client_idx` ON `activities` (`clientId`);--> statement-breakpoint
CREATE INDEX `activities_opportunity_idx` ON `activities` (`opportunityId`);--> statement-breakpoint
CREATE INDEX `activities_assignee_idx` ON `activities` (`assigneeId`);--> statement-breakpoint
CREATE INDEX `activities_status_idx` ON `activities` (`status`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`name`);--> statement-breakpoint
CREATE INDEX `clients_document_idx` ON `clients` (`document`);--> statement-breakpoint
CREATE INDEX `contacts_client_idx` ON `contacts` (`clientId`);--> statement-breakpoint
CREATE INDEX `contacts_status_idx` ON `contacts` (`status`);--> statement-breakpoint
CREATE INDEX `interactions_client_idx` ON `interactions` (`clientId`);--> statement-breakpoint
CREATE INDEX `interactions_opportunity_idx` ON `interactions` (`opportunityId`);--> statement-breakpoint
CREATE INDEX `opportunities_client_idx` ON `opportunities` (`clientId`);--> statement-breakpoint
CREATE INDEX `opportunities_stage_idx` ON `opportunities` (`stage`);--> statement-breakpoint
CREATE INDEX `opportunities_owner_idx` ON `opportunities` (`ownerId`);
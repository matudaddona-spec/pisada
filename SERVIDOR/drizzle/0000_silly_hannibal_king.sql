CREATE TABLE `catalog_categories` (
	`path` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_categories_name_unique` ON `catalog_categories` (`name`);--> statement-breakpoint
CREATE TABLE `catalog_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`create_key` text NOT NULL,
	`data` text NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`last_operation` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_products_path_unique` ON `catalog_products` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_products_create_key_unique` ON `catalog_products` (`create_key`);--> statement-breakpoint
CREATE TABLE `inventory_events` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);

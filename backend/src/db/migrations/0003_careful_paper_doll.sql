ALTER TABLE `notification_outbox` ADD `permanent_at` integer;
--> statement-breakpoint
UPDATE `notification_outbox`
SET `permanent_at` = `created_at`
WHERE `state` = 'permanent';

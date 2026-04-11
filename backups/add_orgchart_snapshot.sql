CREATE TABLE IF NOT EXISTS `dc_orgchart_snapshot` (
  `guild_id`    VARCHAR(20)  NOT NULL,
  `role_id`     VARCHAR(20)  NOT NULL,
  `days`        INT          NOT NULL,
  `top_members` JSON         NOT NULL,
  `computed_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guild_id`, `role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

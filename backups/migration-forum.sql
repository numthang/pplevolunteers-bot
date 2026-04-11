-- Forum Search System — DB Migration
-- รัน: mysql -u pple_dcbot -p pple_volunteers < scripts/migration-forum.sql

CREATE TABLE IF NOT EXISTS dc_forum_config (
  guild_id         VARCHAR(20)  NOT NULL,
  channel_id       VARCHAR(20)  NOT NULL,
  dashboard_msg_id VARCHAR(20)  DEFAULT NULL,
  items_per_page   INT          NOT NULL DEFAULT 10,
  PRIMARY KEY (guild_id, channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dc_forum_posts (
  id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  guild_id    VARCHAR(20)      NOT NULL,
  channel_id  VARCHAR(20)      NOT NULL,
  post_id     VARCHAR(20)      NOT NULL,
  post_name   VARCHAR(500)     NOT NULL,
  post_url    VARCHAR(200)     NOT NULL,
  author_id   VARCHAR(20)      DEFAULT NULL,
  created_at  DATETIME         NOT NULL,
  indexed_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_post_id (post_id),
  INDEX idx_guild_channel (guild_id, channel_id),
  FULLTEXT KEY ft_post_name (post_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

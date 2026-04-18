-- Migration: Make campaign_id optional in calling tables
-- Run after migration.sql

-- Allow NULL campaign_id in calling_logs
ALTER TABLE calling_logs
  MODIFY COLUMN campaign_id INT NULL;

-- Allow NULL campaign_id in calling_assignments
ALTER TABLE calling_assignments
  MODIFY COLUMN campaign_id INT NULL;

-- Replace unique key (campaign_id + member_id) with unique on member_id only
ALTER TABLE calling_assignments
  DROP INDEX uq_campaign_member;

ALTER TABLE calling_assignments
  ADD UNIQUE KEY uq_member (member_id);

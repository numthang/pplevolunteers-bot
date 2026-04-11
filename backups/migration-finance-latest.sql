-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Apr 09, 2026 at 03:12 PM
-- Server version: 8.0.35-0ubuntu0.22.04.1
-- PHP Version: 8.2.15

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `pple_volunteers`
--
CREATE DATABASE IF NOT EXISTS `pple_volunteers` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `pple_volunteers`;

-- --------------------------------------------------------

--
-- Table structure for table `finance_accounts`
--

CREATE TABLE `finance_accounts` (
  `id` int NOT NULL,
  `guild_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bank` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visibility` enum('private','internal','public') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `province` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notify_income` tinyint NOT NULL DEFAULT '1',
  `notify_expense` tinyint NOT NULL DEFAULT '1',
  `email_inbox` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usage_count` int NOT NULL DEFAULT '0',
  `updated_by` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `finance_accounts`
--

INSERT INTO `finance_accounts` (`id`, `guild_id`, `owner_id`, `name`, `bank`, `account_no`, `visibility`, `province`, `notify_income`, `notify_expense`, `email_inbox`, `usage_count`, `updated_by`, `updated_at`, `created_at`) VALUES
(1, '1340903354037178410', '1098111730015543386', 'อรรณพ ศรีเจริญชัย (โชคชัย 4)', 'กสิกรไทย', '7212180453', 'private', NULL, 1, 1, 'unnop.sricharoenchai@gmail.com', 0, '1098111730015543386', '2026-04-09 16:26:20', '2026-04-09 12:19:55'),
(2, '1340903354037178410', '1098111730015543386', 'บัญชีหลักราชบุรี', 'กสิกรไทย', '1778864882', 'internal', 'ราชบุรี', 1, 1, 'unnop.sricharoenchai@gmail.com', 0, '1098111730015543386', '2026-04-09 21:49:49', '2026-04-09 13:01:37'),
(3, '1340903354037178410', '1098111730015543386', 'อาสาประชาชน', 'กสิกรไทย', '2211246459', 'public', NULL, 1, 1, 'somseed.ratchaburi@gmail.com', 0, '1098111730015543386', '2026-04-09 20:47:14', '2026-04-09 16:25:26'),
(4, '1340903354037178410', '1098111730015543386', 'อรรณพ ศรีเจริญชัย (เงินสด)', NULL, NULL, 'private', NULL, 0, 0, 'unnop.sricharoenchai@gmail.com', 0, '1098111730015543386', '2026-04-09 20:02:16', '2026-04-09 20:02:16');

-- --------------------------------------------------------

--
-- Table structure for table `finance_account_rules`
--

CREATE TABLE `finance_account_rules` (
  `id` int NOT NULL,
  `account_id` int NOT NULL,
  `match_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` int DEFAULT NULL,
  `usage_count` int NOT NULL DEFAULT '0',
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `finance_categories`
--

CREATE TABLE `finance_categories` (
  `id` int NOT NULL,
  `guild_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_global` tinyint NOT NULL DEFAULT '0',
  `usage_count` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `finance_categories`
--

INSERT INTO `finance_categories` (`id`, `guild_id`, `owner_id`, `name`, `icon`, `is_global`, `usage_count`, `created_at`) VALUES
(1, NULL, NULL, 'ค่าอาหาร', 'Utensils', 1, 0, '2026-04-09 11:53:01'),
(2, NULL, NULL, 'ค่าเดินทาง', 'Car', 1, 0, '2026-04-09 11:53:01'),
(3, NULL, NULL, 'ค่าอุปกรณ์', 'Package', 1, 0, '2026-04-09 11:53:01'),
(4, NULL, NULL, 'ค่าเช่าสถานที่', 'Building2', 1, 0, '2026-04-09 11:53:01'),
(5, NULL, NULL, 'สื่อ/สิ่งพิมพ์', 'Newspaper', 1, 0, '2026-04-09 11:53:01'),
(6, NULL, NULL, 'บริจาค', 'Heart', 1, 2, '2026-04-09 11:53:01'),
(7, NULL, NULL, 'ค่าสมาชิกพรรค', 'Users', 1, 0, '2026-04-09 11:53:01'),
(8, NULL, NULL, 'อื่นๆ', 'MoreHorizontal', 1, 0, '2026-04-09 11:53:01'),
(9, '1340903354037178410', NULL, 'ลงทุน', 'TrendingUp', 1, 0, '2026-04-09 20:54:09'),
(10, '1340903354037178410', NULL, 'ค่าวิทยากร', 'Mic', 1, 0, '2026-04-09 20:54:52'),
(11, '1340903354037178410', NULL, 'สูญหาย', 'AlertTriangle', 1, 0, '2026-04-09 20:55:39'),
(12, '1340903354037178410', NULL, 'ค่าอินเตอร์เน็ต/ซอฟต์แวร์', 'Globe', 1, 1, '2026-04-09 20:56:16'),
(13, '1340903354037178410', '1098111730015543386', 'ค่ายา/สุขภาพ', 'Pill', 0, 0, '2026-04-09 20:56:40'),
(14, '1340903354037178410', '1098111730015543386', 'เครื่องสำอางค์', 'Sparkles', 0, 0, '2026-04-09 20:56:51'),
(15, '1340903354037178410', '1098111730015543386', 'เสื้อผ้า/เครื่องแต่งกาย', 'Shirt', 0, 0, '2026-04-09 20:57:02'),
(16, '1340903354037178410', '1098111730015543386', 'ค่าน้ำ/ค่าไฟ', 'Zap', 0, 0, '2026-04-09 20:57:16'),
(17, '1340903354037178410', '1098111730015543386', 'โทรศัพท์/คอมพิวเตอร์', 'Smartphone', 0, 0, '2026-04-09 20:57:42'),
(18, '1340903354037178410', NULL, 'ค่าเบี้ยเลี้ยง', 'Wallet', 1, 0, '2026-04-09 21:01:17'),
(19, '1340903354037178410', NULL, 'งบเขต/งบจังหวัด', 'Map', 1, 0, '2026-04-09 21:16:50');

-- --------------------------------------------------------

--
-- Table structure for table `finance_config`
--

CREATE TABLE `finance_config` (
  `guild_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `thread_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_ids` text COLLATE utf8mb4_unicode_ci,
  `dashboard_msg_id` text COLLATE utf8mb4_unicode_ci,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `finance_config`
--

INSERT INTO `finance_config` (`guild_id`, `channel_id`, `thread_id`, `account_ids`, `dashboard_msg_id`, `updated_at`) VALUES
('1340903354037178410', '1444313601165758585', '1491771792069755001', '3', '{\"3\":\"1491771794162712739\"}', '2026-04-09 19:08:31');

-- --------------------------------------------------------

--
-- Table structure for table `finance_transactions`
--

CREATE TABLE `finance_transactions` (
  `id` int NOT NULL,
  `guild_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_id` int NOT NULL,
  `type` enum('income','expense') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category_id` int DEFAULT NULL,
  `counterpart_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `counterpart_account` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `counterpart_bank` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fee` decimal(8,2) DEFAULT NULL,
  `balance_after` decimal(12,2) DEFAULT NULL,
  `evidence_url` text COLLATE utf8mb4_unicode_ci,
  `ref_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discord_msg_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `txn_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `finance_transactions`
--

INSERT INTO `finance_transactions` (`id`, `guild_id`, `account_id`, `type`, `amount`, `description`, `category_id`, `counterpart_name`, `counterpart_account`, `counterpart_bank`, `fee`, `balance_after`, `evidence_url`, `ref_id`, `discord_msg_id`, `txn_at`, `updated_by`, `updated_at`, `created_at`) VALUES
(1, '1340903354037178410', 1, 'expense', 2.00, 'โอนให้ นาย อรรณพ ยศโสภณ', 6, 'นาย อรรณพ ยศโสภณ', '3392177492', 'ธนาคารกสิกรไทย', 0.00, 30068.99, NULL, '016099154505ATF00891', NULL, '2026-04-09 01:45:00', '1098111730015543386', '2026-04-09 21:51:02', '2026-04-09 16:59:28'),
(117, '1340903354037178410', 1, 'expense', 1.00, 'โอนให้ อาสาประชาชน โดย น.ส. ประภาวดี เอกวงศ์ และ นาย อรรณพ ศรีเจริญชัย และ น.ส. วรรณอนงค์ หาญพงษ์ธรรม', 6, 'อาสาประชาชน โดย น.ส. ประภาวดี เอกวงศ์ และ นาย อรรณพ ศรีเจริญชัย และ น.ส. วรรณอนงค์ หาญพงษ์ธรรม', '2211246459', 'ธนาคารกสิกรไทย', 0.00, 30067.99, NULL, '016099190941BTF09657', NULL, '2026-04-08 15:09:00', '1098111730015543386', '2026-04-09 21:51:18', '2026-04-09 19:10:11'),
(118, '1340903354037178410', 2, 'expense', 1850.00, 'โอนให้ นาย อรรณพ ศรีเจริญชัย (Canva Pro)', 12, 'นาย อรรณพ ศรีเจริญชัย', '9777270845', 'ธนาคารกรุงเทพ', 0.00, 2795.08, NULL, '016099200546AOR05441', NULL, '2026-04-09 06:05:00', '1098111730015543386', '2026-04-09 21:45:46', '2026-04-09 20:06:33');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `finance_accounts`
--
ALTER TABLE `finance_accounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_guild` (`guild_id`),
  ADD KEY `idx_owner` (`owner_id`);

--
-- Indexes for table `finance_account_rules`
--
ALTER TABLE `finance_account_rules`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_account` (`account_id`),
  ADD KEY `category_id` (`category_id`);

--
-- Indexes for table `finance_categories`
--
ALTER TABLE `finance_categories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_guild` (`guild_id`);

--
-- Indexes for table `finance_config`
--
ALTER TABLE `finance_config`
  ADD PRIMARY KEY (`guild_id`);

--
-- Indexes for table `finance_transactions`
--
ALTER TABLE `finance_transactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_ref` (`ref_id`),
  ADD KEY `idx_guild` (`guild_id`),
  ADD KEY `idx_account` (`account_id`),
  ADD KEY `idx_txn_at` (`txn_at`),
  ADD KEY `category_id` (`category_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `finance_accounts`
--
ALTER TABLE `finance_accounts`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `finance_account_rules`
--
ALTER TABLE `finance_account_rules`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `finance_categories`
--
ALTER TABLE `finance_categories`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `finance_transactions`
--
ALTER TABLE `finance_transactions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=119;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `finance_account_rules`
--
ALTER TABLE `finance_account_rules`
  ADD CONSTRAINT `finance_account_rules_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `finance_accounts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `finance_account_rules_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `finance_categories` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `finance_transactions`
--
ALTER TABLE `finance_transactions`
  ADD CONSTRAINT `finance_transactions_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `finance_accounts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `finance_transactions_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `finance_categories` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

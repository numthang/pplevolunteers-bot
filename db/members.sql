-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Mar 13, 2026 at 05:03 PM
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
-- Database: `pplevolunteers`
--

-- --------------------------------------------------------

--
-- Table structure for table `members`
--

CREATE TABLE `members` (
  `id` int NOT NULL,
  `discord_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firstname` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastname` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specialty` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roles` text COLLATE utf8mb4_unicode_ci,
  `registered_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `referred_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `interests` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `members`
--

INSERT INTO `members` (`id`, `discord_id`, `username`, `nickname`, `firstname`, `lastname`, `member_id`, `specialty`, `province`, `region`, `roles`, `registered_at`, `updated_at`, `referred_by`, `interests`) VALUES
(1, '1098111730015543386', 'unnopsri', 'Tee', 'อรรณพ', 'ศรีเจริญชัย', '6770000011', '#permaculture #socialist #programming #spiritual #cooking #minimalist #politics', 'ราชบุรี, นครปฐม, กาญจนบุรี', NULL, 'ทีมตัวแทนสมาชิก (101), ทีมภาคกลาง, ทีมคอนเทนต์, ทีมกระบวนกร, ทีมกาญจนบุรี, ทีม9geek, ทีมสื่อ, ทีมนครปฐม, ทีมราชบุรี, Server Booster, อาสาประชาชน, ทีมตัดต่อ, ทีมกราฟิก, ทีมภาคกลางตะวันตก, ทีมสมาชิกสัมพันธ์, Moderator, ทีมระดมทุน', '2026-03-13 02:44:44', '2026-03-13 14:37:36', 'Tee', 'ทีมตัวแทนสมาชิก (101), ทีมคอนเทนต์, ทีมกระบวนกร, ทีม9geek, อาสาประชาชน, ทีมตัดต่อ, ทีมกราฟิก, ทีมสมาชิกสัมพันธ์, ทีมระดมทุน'),
(24, '802179699609567264', 'minkiyeol', 'ปีใหม่', 'กัญญาณี', 'ต่ายคง', '6711001297', 'ตัดต่อคลิปวีดีโอ สตาฟกิจกรรม Facilitator', 'สมุทรปราการ, ราชบุรี, นครปฐม, พิษณุโลก, ชลบุรี, สุรินทร์', NULL, 'ทีมช่างภาพ, ทีมพื้นที่/ร้องเรียน, ทีมเจ้าหน้าที่, ทีมกระบวนกร, เด็กติดเกม, ฟา-PC101, ทีมภาคตะวันออก, ฟา-MP101, ฟาส.ก., ทีมตัวแทนสมาชิก (101), ทีมภาคกลาง, ทีมภาคเหนือตอนล่าง, ทีมภาคอีสานใต้, ทีมปริมณฑล, ทีมสื่อ, Server Booster, ทีมData, ทีมสุรินทร์, ทีมภาคอีสาน, ทีมภาคเหนือ, ทีมชลบุรี, ทีม9geek, ทีมนครปฐม, ทีมราชบุรี, Stage, ทีมงานสภา, ทีมพิษณุโลก, Moderator, อาสาประชาชน, ฟากรุงเทพ, ทีมสมุทรปราการ, ทีมตัดต่อ, ทีมสมาชิกสัมพันธ์', '2026-03-13 14:21:14', '2026-03-13 14:22:45', 'พี่แอน', 'ทีมช่างภาพ, ทีมพื้นที่/ร้องเรียน, ทีมเจ้าหน้าที่, ทีมกระบวนกร, เด็กติดเกม, ทีมตัวแทนสมาชิก (101), ทีม9geek, ทีมงานสภา, อาสาประชาชน, ทีมตัดต่อ, ทีมสมาชิกสัมพันธ์');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `members`
--
ALTER TABLE `members`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `discord_id` (`discord_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `members`
--
ALTER TABLE `members`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

// commands/hi.js
const { SlashCommandBuilder } = require('discord.js');

const greetings = [
  'ยินดีต้อนรับเข้าสู่เซิร์ฟเวอร์อาสาประชาชน! 🎉 ตอนนี้บอทยังไม่มีชื่อ ช่วยตั้งชื่อให้หน่อยได้ไหม',
  'ช่วยออกไอเดีย ตั้งชื่อบอทตัวนี้ให้หน่อยได้ไหม 👀',
  '🤖 น้องบอทของเรายังไม่มีชื่อเลย ใครมีไอเดียดีๆ คอมเมนต์ได้เลย! ชื่อที่ได้ 👍 เยอะสุดได้เป็นชื่อจริงของน้อง 🎉',
  'สวัสดีจ้า บอทของอาสาประชาชนยังไม่มีชื่อเลย ช่วยโยนไอเดียที 💪'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hi')
    .setDescription('ทักทายสมาชิก'),

  async execute(interaction) {
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    await interaction.reply(`สวัสดี ${interaction.user}! ${randomGreeting}`);
  },
};
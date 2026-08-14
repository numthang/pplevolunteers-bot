const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { handleKanbanImportStart } = require('../handlers/kanbanImportHandler');

module.exports = {
  // ⚠️ ไม่ตั้ง setDefaultMemberPermissions ต่างจาก post/case import ที่จำกัด ModerateMembers
  //    การบ้านเป็นของ "ทุกคนในองค์กร" (ดีไซน์ §สิทธิ์) อาสาทั่วไปต้องจดงานตัวเองได้
  data: new ContextMenuCommandBuilder()
    .setName('📌 สร้างเป็นการบ้าน')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleKanbanImportStart(interaction);
  },
};

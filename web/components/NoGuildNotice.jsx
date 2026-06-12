import Image from 'next/image'

export default function NoGuildNotice() {
  return (
    <div className="max-w-md mx-auto mt-16 px-4">
      <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-xl px-6 py-10 flex flex-col items-center text-center">
        <Image src="/logo.png" alt="PPLE" width={120} height={120} className="drop-shadow mb-4 opacity-80" />
        <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-2">
          ยังไม่ได้เป็นสมาชิกเซิร์ฟเวอร์
        </h1>
        <p className="text-base text-warm-500 dark:text-disc-muted leading-relaxed">
          บัญชี Discord ของคุณยังไม่ได้อยู่ในเซิร์ฟเวอร์ที่เชื่อมกับระบบนี้
          <br />
          กรุณาเข้าร่วมเซิร์ฟเวอร์ก่อน หรือติดต่อผู้ดูแล
        </p>
        <p className="text-sm text-warm-400 dark:text-disc-muted mt-6">
          ออกจากระบบได้ที่เมนูมุมขวาบน
        </p>
      </div>
    </div>
  )
}

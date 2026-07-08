import { redirect } from 'next/navigation'

// login รวมอยู่หน้าแรกแล้ว (LoginPanel ใน app/page.js) — route นี้เหลือแค่ redirect
// เก็บไว้เพราะลิงก์เก่า/bookmark ชี้มา · next-auth pages.signIn ชี้ '/' แล้ว (auth-options.js)
export default async function LoginPage({ searchParams }) {
  const params = new URLSearchParams(await searchParams)
  const qs = params.toString()
  redirect(qs ? `/?${qs}` : '/')
}

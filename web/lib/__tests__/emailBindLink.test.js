import { describe, it, expect, vi, beforeEach } from 'vitest'

// ล็อกพฤติกรรม emailBindLink หลังย้าย SQL เข้า web/db/emailBind.js (2026-09-17)
// mock ที่ชั้น pool → ทดสอบทั้งทาง lib → db → pool ว่า SQL/params/ลำดับเหมือนเดิม
const query = vi.fn()
vi.mock('@/db/index.js', () => ({ default: { query: (...a) => query(...a) } }))

const { createBindToken, consumeBindToken, LINK_TTL_MS } = await import('../emailBindLink.js')

beforeEach(() => query.mockReset())

describe('createBindToken', () => {
  it('insert nonce + กวาดของเก่า แล้วคืน token hex 64 ตัว', async () => {
    query.mockResolvedValue({ rows: [] })
    const token = await createBindToken(7, 'a@b.co', 3, 9)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]).toEqual([
      `INSERT INTO auth_nonces (nonce, user_id, purpose, payload) VALUES ($1, $2, $3, $4)`,
      [token, 7, 'email_bind', JSON.stringify({ email: 'a@b.co', orgId: 3, actorUserId: 9 })],
    ])
    expect(query.mock.calls[1]).toEqual([
      `DELETE FROM auth_nonces WHERE purpose = $1 AND created_at < NOW() - INTERVAL '1 day'`, ['email_bind'],
    ])
  })

  it('กวาดของเก่าพังไม่ทำให้ออก token ไม่ได้', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('boom'))
    await expect(createBindToken(1, 'x@y.z', 1, 1)).resolves.toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('consumeBindToken', () => {
  const payload = { email: 'a@b.co', orgId: 3, actorUserId: 9 }
  const fresh = () => ({ rows: [{ user_id: 7, payload, created_at: new Date() }] })

  it('token ไม่มี → invalid ไม่ลบ ไม่อัปเดต', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    expect(await consumeBindToken('t')).toEqual({ error: 'invalid' })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]).toEqual([
      `SELECT user_id, payload, created_at FROM auth_nonces WHERE nonce = $1 AND purpose = $2`, ['t', 'email_bind'],
    ])
  })

  it('หมดอายุ → ลบ token แล้วคืน expired ไม่อัปเดต email', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 7, payload, created_at: new Date(Date.now() - LINK_TTL_MS - 1000) }] })
      .mockResolvedValueOnce({ rows: [] })
    expect(await consumeBindToken('t')).toEqual({ error: 'expired' })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1]).toEqual([`DELETE FROM auth_nonces WHERE nonce = $1`, ['t']])
  })

  it('สำเร็จ → ลบ token แล้วเขียน email', async () => {
    query.mockResolvedValueOnce(fresh()).mockResolvedValue({ rows: [] })
    expect(await consumeBindToken('t')).toEqual({ ok: true, userId: 7, email: 'a@b.co', orgId: 3, actorUserId: 9 })
    expect(query.mock.calls[2]).toEqual([
      `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2`, ['a@b.co', 7],
    ])
  })

  it('อีเมลซ้ำ (23505) → already_taken · error อื่นโยนต่อ', async () => {
    query.mockResolvedValueOnce(fresh()).mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    expect(await consumeBindToken('t')).toEqual({ error: 'already_taken' })

    query.mockResolvedValueOnce(fresh()).mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('down'))
    await expect(consumeBindToken('t')).rejects.toThrow('down')
  })
})

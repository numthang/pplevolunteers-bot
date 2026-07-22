import { getServerSession } from 'next-auth'
import * as memberDB from '@/db/calling/members.js'
import { canAccessMember, getUserScope, isAdmin, isRegionalCoordinator, canSeeContacts } from '@/lib/callingAccess.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { authOptions } from '@/lib/auth-options.js'

/**
 * GET /api/calling/members
 * Query members with filters (campaign, province, district, search)
 * Permission: authenticated users (scope-filtered)
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')
  const province = searchParams.get('province')
  const district = searchParams.get('district')
  const keyword = searchParams.get('search')
  const statsOnly = searchParams.get('stats') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  // Campaign-specific filters
  const filterAmphure = searchParams.get('amphure') || null
  const subdistricts = searchParams.get('subdistricts')
  const filterSubdistricts = subdistricts ? subdistricts.split(',') : null
  const filterTier = searchParams.get('tier') || null
  const filterStatus = searchParams.get('status') || null
  const filterAssignedTo = searchParams.get('assignedTo') || null
  const filterRsvp = searchParams.get('rsvp') || null
  const filterName = searchParams.get('name') || null
  const filterExpiry = searchParams.get('expiry') || null
  const filterCalled = searchParams.get('called') || null
  const filterSort = searchParams.get('sort') || null
  const filterSms = searchParams.get('sms') || null

  try {
    const { access } = await getEffectiveOrgIdentity(session)
    const orgId = await getOrgId(session)
    const userScope = getUserScope(access)
    const isUserAdmin = isAdmin(access)

    // Stats-only request
    if (campaignId && statsOnly) {
      const stats = await memberDB.getMembersInCampaignStats(orgId, parseInt(campaignId))
      return Response.json({ success: true, data: stats })
    }

    let rows = []
    let total = 0

    if (campaignId) {
      const filters = { amphure: filterAmphure, subdistricts: filterSubdistricts, tier: filterTier, status: filterStatus, assignedTo: filterAssignedTo, rsvp: filterRsvp, name: filterName, expiry: filterExpiry, called: filterCalled, sort: filterSort, sms: filterSms }
      rows = await memberDB.getMembersInCampaign(orgId, parseInt(campaignId), filters, limit, offset)
    } else if (province) {
      rows = await memberDB.getMembersByProvince(orgId, province, limit, offset)
    } else if (district) {
      rows = await memberDB.getMembersByDistrict(orgId, district, limit, offset)
    } else if (keyword) {
      rows = await memberDB.searchMembers(orgId, keyword, limit, offset)
    } else {
      rows = await memberDB.getAllMembers(orgId, limit, offset)
      total = await memberDB.getMembersCount(orgId)
    }

    // No calling roles at all → return noAccess flag
    if (!isUserAdmin && Array.isArray(userScope) && userScope.length === 0) {
      return Response.json({ success: true, data: [], hasMore: false, noAccess: true, limit, offset })
    }

    // Filter by user scope (unless admin)
    if (!isUserAdmin && userScope) {
      rows = rows.filter(m => userScope.includes(m.home_province))
    }

    const showContacts = canSeeContacts(access)
    if (!showContacts) {
      rows = rows.map(({ mobile_number, line_id, ...rest }) => rest)
    } else if (!isUserAdmin && !isRegionalCoordinator(access)) {
      // province/district coordinator: เห็นเบอร์เฉพาะจังหวัดที่ตัวเองดูแล
      // primary_province = field กรอกเองในโปรไฟล์ ซึ่งแทบไม่มีใครกรอก (2 จาก 7,339 แถว)
      // → ไม่มีค่า = ตัดเบอร์ทิ้งหมด ทั้งที่มียศคุมจังหวัดอยู่ (bug-048)
      // fallback ไปที่ scope จากยศแทน · row ถูกกรองด้วย userScope ไปแล้วข้างบน จึงไม่กว้างเกินสิทธิ์
      const allowed = session.user.primary_province
        ? [session.user.primary_province]
        : (userScope || [])
      // ตัดแล้วต้องบอกด้วยว่า "ไม่มีสิทธิ์เห็น" ไม่ใช่ปล่อยให้ UI เดาว่า "ไม่มีเบอร์"
      // (roster query การันตี mobile_number IS NOT NULL อยู่แล้ว — เบอร์หาย = ถูกตัดเสมอ)
      rows = rows.map(m => {
        if (allowed.includes(m.home_province)) return m
        const { mobile_number, line_id, ...rest } = m
        return { ...rest, phone_hidden: true }
      })
    }

    return Response.json({
      success: true,
      data: rows,
      contacts_hidden: !showContacts,
      hasMore: rows.length === limit,
      limit,
      offset
    })
  } catch (error) {
    console.error('[GET /api/calling/members]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

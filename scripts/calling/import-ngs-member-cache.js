/**
 * Import ngs_member_cache from CSV (ngs_member source data)
 *
 * Usage:
 *   node scripts/calling/import-ngs-member-cache.js
 *   node scripts/calling/import-ngs-member-cache.js /path/to/custom.csv
 *
 * Source:  md/calling/ngs_member_cache.csv
 * Target:  ngs_member_cache table
 * Note:    All 91 columns are imported. Do NOT edit rows directly.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const pool = require('../../db');

const DEFAULT_CSV = path.join(__dirname, '../../md/calling/ngs_member_cache.csv');
const BATCH_SIZE = 100;

// CSV column index map (0-based, from ngs_member_cache.csv header)
const C = {
  id:                                       0,
  title:                                    1,
  first_name:                               2,
  last_name:                                3,
  full_name:                                4,
  old_full_name:                            5,
  created_at:                               6,
  ect_register_date:                        7,
  expired_at:                               8,
  law_expired_at:                           9,
  gender:                                   10,
  serial:                                   11,
  race:                                     12,
  was_born_in_thai_nationality:             13,
  date_of_birth:                            14,
  register_home_address_id:                 15,
  home_house_number:                        16,
  home_house_group_number:                  17,
  home_village:                             18,
  home_alley:                               19,
  home_road:                                20,
  home_district:                            21,   // ตำบล
  home_constituency:                        22,
  home_amphure:                             23,   // อำเภอ
  home_province:                            24,
  home_zip_code:                            25,
  identification_number:                    26,
  membership_type:                          27,
  card_type:                                28,
  mobile_number:                            29,
  created_by:                               30,
  latest_state:                             31,
  latest_card_state:                        32,
  latest_ect_state:                         33,
  approved_at:                              34,
  approved_by:                              35,
  latest_province_state:                    36,
  province_document_approved_at:            37,
  province_document_approved_by:            38,
  province_document_rejected_at:            39,
  province_document_rejected_by:            40,
  email:                                    41,
  facebook_id:                              42,
  facebook_group_joined:                    43,
  line_id:                                  44,
  line_group_joined:                        45,
  house_number:                             46,
  house_group_number:                       47,
  village:                                  48,
  alley:                                    49,
  road:                                     50,
  district:                                 51,
  amphure:                                  52,
  province:                                 53,
  zip_code:                                 54,
  address:                                  55,
  address_complement:                       56,
  city:                                     57,
  state:                                    58,
  country:                                  59,
  current_job:                              60,
  job_position:                             61,
  company:                                  62,
  job_experience:                           63,
  network:                                  64,
  network_description:                      65,
  has_registered_any_political_position:    66,
  has_took_any_political_position:          67,
  card_delivery_method:                     68,
  card_delivery_address:                    69,
  property_question_one:                    70,
  property_question_two:                    71,
  property_question_two_political_party_name: 72,
  is_privacy_accepted:                      73,
  order_id:                                 74,
  receipt_book:                             75,
  receipt_number:                           76,
  payment_status:                           77,
  payment_type:                             78,
  registration_method:                      79,
  amount:                                   80,
  description:                              81,
  paid_at:                                  82,
  renew_at:                                 83,
  first_approved_payment_at:               84,
  is_foreigner:                             85,
  home_province_id:                         86,
  province_id:                              87,
  ect_state:                                88,
  ect_remark:                               89,
  ect_description:                          90,
};

function trim(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function parseDate(val) {
  const s = trim(val);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseInt2(val) {
  const s = trim(val);
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function parseDecimal(val) {
  const s = trim(val);
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function mapRow(f) {
  return {
    source_id:                                parseInt2(f[C.id]),
    serial:                                   trim(f[C.serial]),
    title:                                    trim(f[C.title]),
    first_name:                               trim(f[C.first_name]),
    last_name:                                trim(f[C.last_name]),
    full_name:                                trim(f[C.full_name]),
    old_full_name:                            trim(f[C.old_full_name]),
    gender:                                   trim(f[C.gender]),
    date_of_birth:                            parseDate(f[C.date_of_birth]),
    race:                                     trim(f[C.race]),
    was_born_in_thai_nationality:             trim(f[C.was_born_in_thai_nationality]),
    is_foreigner:                             parseInt2(f[C.is_foreigner]) ?? 0,
    identification_number:                    trim(f[C.identification_number]),

    mobile_number:                            trim(f[C.mobile_number]),
    email:                                    trim(f[C.email]),
    line_id:                                  trim(f[C.line_id]),
    line_group_joined:                        trim(f[C.line_group_joined]),
    facebook_id:                              trim(f[C.facebook_id]),
    facebook_group_joined:                    trim(f[C.facebook_group_joined]),

    register_home_address_id:                 parseInt2(f[C.register_home_address_id]),
    home_house_number:                        trim(f[C.home_house_number]),
    home_house_group_number:                  trim(f[C.home_house_group_number]),
    home_village:                             trim(f[C.home_village]),
    home_alley:                               trim(f[C.home_alley]),
    home_road:                                trim(f[C.home_road]),
    home_district:                            trim(f[C.home_district]),
    home_amphure:                             trim(f[C.home_amphure]),
    home_province:                            trim(f[C.home_province]),
    home_zip_code:                            trim(f[C.home_zip_code]),
    home_constituency:                        trim(f[C.home_constituency]),
    home_province_id:                         parseInt2(f[C.home_province_id]),

    house_number:                             trim(f[C.house_number]),
    house_group_number:                       trim(f[C.house_group_number]),
    village:                                  trim(f[C.village]),
    alley:                                    trim(f[C.alley]),
    road:                                     trim(f[C.road]),
    district:                                 trim(f[C.district]),
    amphure:                                  trim(f[C.amphure]),
    province:                                 trim(f[C.province]),
    zip_code:                                 trim(f[C.zip_code]),
    province_id:                              parseInt2(f[C.province_id]),
    address:                                  trim(f[C.address]),
    address_complement:                       trim(f[C.address_complement]),
    city:                                     trim(f[C.city]),
    state:                                    trim(f[C.state]),
    country:                                  trim(f[C.country]),

    membership_type:                          trim(f[C.membership_type]),
    card_type:                                trim(f[C.card_type]),
    ect_register_date:                        parseDate(f[C.ect_register_date]),
    expired_at:                               parseDate(f[C.expired_at]),
    law_expired_at:                           parseDate(f[C.law_expired_at]),
    renew_at:                                 parseDate(f[C.renew_at]),
    registration_method:                      trim(f[C.registration_method]),

    latest_state:                             trim(f[C.latest_state]),
    latest_card_state:                        trim(f[C.latest_card_state]),
    latest_ect_state:                         trim(f[C.latest_ect_state]),
    latest_province_state:                    trim(f[C.latest_province_state]),
    ect_state:                                trim(f[C.ect_state]),
    ect_remark:                               trim(f[C.ect_remark]),
    ect_description:                          trim(f[C.ect_description]),

    created_by:                               trim(f[C.created_by]),
    created_at:                               parseDate(f[C.created_at]),
    approved_at:                              parseDate(f[C.approved_at]),
    approved_by:                              trim(f[C.approved_by]),
    province_document_approved_at:            parseDate(f[C.province_document_approved_at]),
    province_document_approved_by:            trim(f[C.province_document_approved_by]),
    province_document_rejected_at:            parseDate(f[C.province_document_rejected_at]),
    province_document_rejected_by:            trim(f[C.province_document_rejected_by]),

    order_id:                                 trim(f[C.order_id]),
    receipt_book:                             trim(f[C.receipt_book]),
    receipt_number:                           trim(f[C.receipt_number]),
    payment_status:                           trim(f[C.payment_status]),
    payment_type:                             trim(f[C.payment_type]),
    amount:                                   parseDecimal(f[C.amount]),
    description:                              trim(f[C.description]),
    paid_at:                                  parseDate(f[C.paid_at]),
    first_approved_payment_at:               parseDate(f[C.first_approved_payment_at]),

    card_delivery_method:                     trim(f[C.card_delivery_method]),
    card_delivery_address:                    trim(f[C.card_delivery_address]),

    current_job:                              trim(f[C.current_job]),
    job_position:                             trim(f[C.job_position]),
    company:                                  trim(f[C.company]),
    job_experience:                           trim(f[C.job_experience]),
    network:                                  trim(f[C.network]),
    network_description:                      trim(f[C.network_description]),

    has_registered_any_political_position:    trim(f[C.has_registered_any_political_position]),
    has_took_any_political_position:          trim(f[C.has_took_any_political_position]),
    property_question_one:                    trim(f[C.property_question_one]),
    property_question_two:                    trim(f[C.property_question_two]),
    property_question_two_political_party_name: trim(f[C.property_question_two_political_party_name]),
    is_privacy_accepted:                      trim(f[C.is_privacy_accepted]),
  };
}

// All DB columns in insertion order (must match VALUES array below)
const DB_COLS = [
  'source_id', 'serial', 'title', 'first_name', 'last_name', 'full_name', 'old_full_name',
  'gender', 'date_of_birth', 'race', 'was_born_in_thai_nationality', 'is_foreigner', 'identification_number',
  'mobile_number', 'email', 'line_id', 'line_group_joined', 'facebook_id', 'facebook_group_joined',
  'register_home_address_id', 'home_house_number', 'home_house_group_number', 'home_village', 'home_alley',
  'home_road', 'home_district', 'home_amphure', 'home_province', 'home_zip_code', 'home_constituency', 'home_province_id',
  'house_number', 'house_group_number', 'village', 'alley', 'road', 'district', 'amphure', 'province',
  'zip_code', 'province_id', 'address', 'address_complement', 'city', 'state', 'country',
  'membership_type', 'card_type', 'ect_register_date', 'expired_at', 'law_expired_at', 'renew_at', 'registration_method',
  'latest_state', 'latest_card_state', 'latest_ect_state', 'latest_province_state', 'ect_state', 'ect_remark', 'ect_description',
  'created_by', 'created_at', 'approved_at', 'approved_by',
  'province_document_approved_at', 'province_document_approved_by',
  'province_document_rejected_at', 'province_document_rejected_by',
  'order_id', 'receipt_book', 'receipt_number', 'payment_status', 'payment_type', 'amount', 'description', 'paid_at', 'first_approved_payment_at',
  'card_delivery_method', 'card_delivery_address',
  'current_job', 'job_position', 'company', 'job_experience', 'network', 'network_description',
  'has_registered_any_political_position', 'has_took_any_political_position',
  'property_question_one', 'property_question_two', 'property_question_two_political_party_name', 'is_privacy_accepted',
];

const UPDATE_COLS = DB_COLS.filter(c => c !== 'source_id');

async function insertBatch(rows) {
  if (rows.length === 0) return 0;

  const placeholders = DB_COLS.map(() => '?').join(', ');
  const rowPlaceholders = rows.map(() => `(${placeholders})`).join(',\n  ');
  const updates = UPDATE_COLS.map(c => `${c} = VALUES(${c})`).join(',\n    ');

  const sql = `
    INSERT INTO ngs_member_cache (${DB_COLS.join(', ')})
    VALUES
      ${rowPlaceholders}
    ON DUPLICATE KEY UPDATE
    ${updates},
    synced_at = CURRENT_TIMESTAMP
  `;

  const values = rows.flatMap(r => DB_COLS.map(col => r[col] ?? null));

  const [result] = await pool.query(sql, values);
  return result.affectedRows;
}

async function importMembers(csvPath) {
  console.log(`📂 Source: ${csvPath}`);
  console.log(`📋 Table:  ngs_member_cache\n`);

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`);
    process.exit(1);
  }

  const stats = { total: 0, inserted: 0, invalid: 0, errors: [] };
  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    const toFlush = batch;
    batch = [];
    try {
      stats.inserted += await insertBatch(toFlush);
    } catch (err) {
      stats.errors.push(err.message);
      console.error(`  ⚠️  Batch error: ${err.message}`);
    }
  }

  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(csvPath).pipe(
      parse({
        columns: false,      // use index-based access
        skip_empty_lines: true,
        bom: true,           // strip BOM if present
        from_line: 2,        // skip header row
        relax_quotes: true,
        trim: false,         // we trim manually per-field
      })
    );

    parser.on('data', async (fields) => {
      stats.total++;
      const row = mapRow(fields);

      if (!row.source_id) {
        stats.invalid++;
        stats.errors.push(`Row ${stats.total + 1}: source_id (id) is missing`);
        return;
      }
      if (!row.first_name) {
        stats.invalid++;
        stats.errors.push(`Row ${stats.total + 1}: first_name is missing`);
        return;
      }

      batch.push(row);

      if (batch.length >= BATCH_SIZE) {
        parser.pause();
        await flushBatch();
        parser.resume();
      }
    });

    parser.on('end', async () => {
      await flushBatch();
      resolve(stats);
    });

    parser.on('error', reject);
  });
}

(async () => {
  const csvPath = process.argv[2] || DEFAULT_CSV;

  try {
    const stats = await importMembers(csvPath);

    console.log('📊 Import Summary:');
    console.log(`  Rows processed:   ${stats.total}`);
    console.log(`  Inserted/Updated: ${stats.inserted}`);
    console.log(`  Invalid (skipped):${stats.invalid}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errors (first 10):`);
      stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more`);
      }
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
  }
})();

import pool from '../index.js'

export async function getAttachmentsByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT id, original_name, file_path, sort_order, created_at
     FROM docs_project_attachments
     WHERE project_id = $1
     ORDER BY sort_order, created_at`,
    [projectId]
  )
  return rows
}

export async function createAttachment(projectId, orgId, { originalName, filePath, sortOrder = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO docs_project_attachments (project_id, org_id, original_name, file_path, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, original_name, file_path, sort_order, created_at`,
    [projectId, orgId, originalName, filePath, sortOrder]
  )
  return rows[0]
}

export async function getAttachmentById(id, projectId) {
  const { rows } = await pool.query(
    `SELECT id, project_id, org_id, original_name, file_path
     FROM docs_project_attachments
     WHERE id = $1 AND project_id = $2`,
    [id, projectId]
  )
  return rows[0] || null
}

export async function deleteAttachment(id, projectId) {
  const { rows } = await pool.query(
    `DELETE FROM docs_project_attachments WHERE id = $1 AND project_id = $2 RETURNING file_path`,
    [id, projectId]
  )
  return rows[0] || null
}

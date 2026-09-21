import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { PaginationParams, NewImportReportInput, NewAttachmentInput, FileAttachment } from "./types";
import { RecentImportReport } from "../../types";

export const migrationStorageRepository = {
  /**
   * Creates a new import report.
   */
  async createImportReport(report: NewImportReportInput, client: DbClient = pool): Promise<RecentImportReport> {
    const res = await client.query(
      `INSERT INTO import_reports (
        file_name, total_rows, added_count, updated_count, unchanged_count, 
        error_count, stock_increased_count, stock_decreased_count, changes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *`,
      [
        report.fileName,
        report.totalRows,
        report.addedCount,
        report.updatedCount,
        report.unchangedCount,
        report.errorCount,
        report.stockIncreasedCount,
        report.stockDecreasedCount,
        JSON.stringify(report.changes)
      ]
    );
    return this.mapRowToImportReport(res.rows[0]);
  },

  /**
   * Gets import reports with pagination.
   */
  async getImportReports(pagination: PaginationParams, client: DbClient = pool): Promise<{ data: RecentImportReport[]; total: number }> {
    const countRes = await client.query(`SELECT COUNT(*) as total FROM import_reports`);
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM import_reports ORDER BY created_at DESC`;
    const params: any[] = [];
    let paramIndex = 1;
    
    if (pagination.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(pagination.limit);
    }
    
    if (pagination.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(pagination.offset);
    }

    const res = await client.query(query, params);
    
    return {
      data: res.rows.map(row => this.mapRowToImportReport(row)),
      total
    };
  },

  /**
   * Creates a file attachment record.
   */
  async createFileAttachment(attachment: NewAttachmentInput, client: DbClient = pool): Promise<FileAttachment> {
    const res = await client.query(
      `INSERT INTO file_attachments (
        bucket_name, object_key, file_name, mime_type, size_bytes, 
        entity_type, entity_id, uploaded_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING *`,
      [
        attachment.bucketName,
        attachment.objectKey,
        attachment.fileName,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.entityType,
        attachment.entityId,
        attachment.uploadedBy
      ]
    );
    return this.mapRowToFileAttachment(res.rows[0]);
  },

  /**
   * Gets file attachments by entity.
   */
  async getFileAttachmentsByEntity(entityType: string, entityId: string, client: DbClient = pool): Promise<FileAttachment[]> {
    const res = await client.query(
      `SELECT * FROM file_attachments WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    return res.rows.map(row => this.mapRowToFileAttachment(row));
  },

  /**
   * Maps an old ID (e.g. from localStorage) to a new UUID.
   */
  async mapOldId(oldId: string, newId: string, entityType: string, client: DbClient = pool): Promise<void> {
    await client.query(
      `INSERT INTO id_migration_map (old_id, new_id, entity_type) VALUES ($1, $2, $3)
       ON CONFLICT (old_id) DO NOTHING`,
      [oldId, newId, entityType]
    );
  },

  /**
   * Looks up a new UUID by old ID.
   */
  async lookupNewId(oldId: string, entityType: string, client: DbClient = pool): Promise<string | null> {
    const res = await client.query(
      `SELECT new_id FROM id_migration_map WHERE old_id = $1 AND entity_type = $2`,
      [oldId, entityType]
    );
    return res.rows[0] ? res.rows[0].new_id : null;
  },

  mapRowToImportReport(row: any): RecentImportReport {
    return {
      id: row.id,
      date: row.created_at.toISOString(),
      fileName: row.file_name,
      totalRows: row.total_rows,
      addedCount: row.added_count,
      updatedCount: row.updated_count,
      unchangedCount: row.unchanged_count,
      errorCount: row.error_count,
      stockIncreasedCount: row.stock_increased_count,
      stockDecreasedCount: row.stock_decreased_count,
      changes: row.changes
    };
  },

  mapRowToFileAttachment(row: any): FileAttachment {
    return {
      id: row.id,
      bucketName: row.bucket_name,
      objectKey: row.object_key,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: parseInt(row.size_bytes, 10),
      entityType: row.entity_type,
      entityId: row.entity_id,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at.toISOString()
    };
  }
};

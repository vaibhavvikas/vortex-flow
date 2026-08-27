use crate::error::DbError;
use crate::models::CollectionFile;
use rusqlite::{params, Connection};

pub trait FileRepository: Send + Sync {
    fn get_by_item_id(&self, conn: &Connection, item_id: &str) -> Result<Vec<CollectionFile>, DbError>;
    fn insert_batch(&self, conn: &Connection, files: &[CollectionFile]) -> Result<(), DbError>;
    fn update_file_status(
        &self,
        conn: &Connection,
        file_id: &str,
        status: &str,
        downloaded_bytes: Option<u64>,
        file_size_bytes: Option<u64>,
        local_path: Option<&str>,
    ) -> Result<(), DbError>;
}

pub struct SqliteFileRepository;

impl SqliteFileRepository {
    pub fn new() -> Self {
        Self
    }
}

impl FileRepository for SqliteFileRepository {
    fn get_by_item_id(&self, conn: &Connection, item_id: &str) -> Result<Vec<CollectionFile>, DbError> {
        let mut stmt = conn.prepare(
            "SELECT id, item_id, file_name, format, read_pair, file_type, download_url, local_path, file_size_bytes, download_status, sha256_checksum, downloaded_at, last_verified_at
             FROM collection_files WHERE item_id = ?1",
        )?;

        let file_iter = stmt.query_map(params![item_id], |row| {
            let file_size_i64: i64 = row.get(8)?;
            let read_pair_i64: i64 = row.get(4)?;
            Ok(CollectionFile {
                id: row.get(0)?,
                item_id: row.get(1)?,
                file_name: row.get(2)?,
                format: row.get(3)?,
                read_pair: read_pair_i64 as u8,
                file_type: row.get(5)?,
                download_url: row.get(6)?,
                local_path: row.get(7)?,
                file_size_bytes: file_size_i64 as u64,
                download_status: row.get(9)?,
                sha256_checksum: row.get(10)?,
                downloaded_at: row.get(11)?,
                last_verified_at: row.get(12)?,
            })
        })?;

        let mut files = Vec::new();
        for file in file_iter {
            files.push(file?);
        }
        Ok(files)
    }

    fn insert_batch(&self, conn: &Connection, files: &[CollectionFile]) -> Result<(), DbError> {
        for file in files {
            conn.execute(
                "INSERT INTO collection_files (id, item_id, file_name, format, read_pair, file_type, download_url, local_path, file_size_bytes, download_status, sha256_checksum, downloaded_at, last_verified_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(item_id, format, read_pair) DO UPDATE SET
                   file_name = excluded.file_name,
                   download_url = excluded.download_url,
                   local_path = excluded.local_path,
                   file_size_bytes = CASE WHEN excluded.file_size_bytes > 0 THEN excluded.file_size_bytes ELSE collection_files.file_size_bytes END,
                   download_status = excluded.download_status",
                params![
                    file.id,
                    file.item_id,
                    file.file_name,
                    file.format,
                    file.read_pair as i64,
                    file.file_type,
                    file.download_url,
                    file.local_path,
                    file.file_size_bytes as i64,
                    file.download_status,
                    file.sha256_checksum,
                    file.downloaded_at,
                    file.last_verified_at,
                ],
            )?;
        }
        Ok(())
    }

    fn update_file_status(
        &self,
        conn: &Connection,
        file_id: &str,
        status: &str,
        downloaded_bytes: Option<u64>,
        file_size_bytes: Option<u64>,
        local_path: Option<&str>,
    ) -> Result<(), DbError> {
        conn.execute(
            "UPDATE collection_files
             SET download_status = ?1,
                 downloaded_bytes = COALESCE(?2, downloaded_bytes),
                 file_size_bytes = CASE WHEN ?3 IS NOT NULL AND ?3 > 0 THEN ?3 ELSE file_size_bytes END,
                 local_path = COALESCE(?4, local_path)
             WHERE id = ?5 OR item_id = ?5",
            params![
                status,
                downloaded_bytes.map(|b| b as i64),
                file_size_bytes.map(|b| b as i64),
                local_path,
                file_id,
            ],
        )?;
        Ok(())
    }
}

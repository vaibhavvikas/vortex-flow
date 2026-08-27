use crate::error::DbError;
use crate::models::{CollectionFile, CollectionItem, CollectionMetadata, DatasetDetails};
use crate::repositories::{
    FileRepository, ItemRepository, MetadataRepository, SqliteFileRepository, SqliteItemRepository, SqliteMetadataRepository,
};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use vortexflow_providers::SraRecord;

pub struct CollectionService {
    conn: Arc<Mutex<Connection>>,
    item_repo: Box<dyn ItemRepository>,
    metadata_repo: Box<dyn MetadataRepository>,
    file_repo: Box<dyn FileRepository>,
}

#[cfg(test)]
mod tests {
    use super::CollectionService;

    #[test]
    fn status_only_update_preserves_download_progress() {
        let temp_dir = std::env::temp_dir().join(format!(
            "vortexflow-db-test-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let db_path = temp_dir.join("vortexflow.db");
        let service = CollectionService::new(db_path).expect("database should initialize");

        {
            let conn = service.conn.lock().expect("database lock should be available");
            conn.execute(
                "INSERT INTO download_tasks (id, task_name, accession_label, format, file_size_bytes, downloaded_bytes, download_status, created_at)
                 VALUES ('task-1', 'sample.sra', 'SRR1', 'sra', 1000, 400, 'downloading', '2026-01-01T00:00:00Z')",
                [],
            )
            .expect("download task should be inserted");
        }

        service
            .update_file_download_progress("task-1", "paused", None, None, None)
            .expect("status update should succeed");

        let conn = service.conn.lock().expect("database lock should be available");
        let (downloaded, total): (i64, i64) = conn
            .query_row(
                "SELECT downloaded_bytes, file_size_bytes FROM download_tasks WHERE id = 'task-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("download task should exist");
        assert_eq!((downloaded, total), (400, 1000));

        drop(conn);
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}

impl CollectionService {
    pub fn new(db_path: PathBuf) -> Result<Self, DbError> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
            std::fs::create_dir_all(parent.join("config"))?;
            std::fs::create_dir_all(parent.join("temp/chunks"))?;
            std::fs::create_dir_all(parent.join("downloads/sra"))?;
            std::fs::create_dir_all(parent.join("downloads/fastq"))?;
            std::fs::create_dir_all(parent.join("downloads/fasta"))?;
        }

        let mut conn = Connection::open(&db_path)?;

        // Enable Foreign Keys & WAL mode for speed & safety
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )?;

        let schema_version: i64 = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?;

        if schema_version < 1 {
            let tx = conn.transaction()?;
            tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS collection_items (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL DEFAULT 'ncbi',
                accession TEXT NOT NULL,
                title TEXT,
                organism TEXT,
                platform TEXT,
                total_spots TEXT,
                status TEXT NOT NULL DEFAULT 'saved',
                added_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS collection_metadata (
                item_id TEXT PRIMARY KEY REFERENCES collection_items(id) ON DELETE CASCADE,
                raw_xml TEXT,
                metadata_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS collection_files (
                id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL REFERENCES collection_items(id) ON DELETE CASCADE,
                file_name TEXT NOT NULL,
                format TEXT NOT NULL,
                read_pair INTEGER NOT NULL DEFAULT 1,
                file_type TEXT,
                download_url TEXT,
                local_path TEXT,
                file_size_bytes INTEGER DEFAULT 0,
                downloaded_bytes INTEGER DEFAULT 0,
                download_status TEXT NOT NULL DEFAULT 'not_downloaded',
                sha256_checksum TEXT,
                downloaded_at TEXT,
                last_verified_at TEXT,
                UNIQUE(item_id, format, read_pair)
            );

            CREATE TABLE IF NOT EXISTS download_tasks (
                id TEXT PRIMARY KEY,
                task_name TEXT NOT NULL,
                accession_label TEXT NOT NULL,
                format TEXT NOT NULL,
                download_url TEXT,
                local_path TEXT,
                file_size_bytes INTEGER DEFAULT 0,
                downloaded_bytes INTEGER DEFAULT 0,
                download_status TEXT NOT NULL DEFAULT 'queued',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS task_item_links (
                task_id TEXT NOT NULL REFERENCES download_tasks(id) ON DELETE CASCADE,
                item_id TEXT NOT NULL REFERENCES collection_items(id) ON DELETE CASCADE,
                PRIMARY KEY (task_id, item_id)
            );

            CREATE INDEX IF NOT EXISTS idx_items_added ON collection_items(added_at DESC);
            CREATE INDEX IF NOT EXISTS idx_files_item ON collection_files(item_id);
            CREATE INDEX IF NOT EXISTS idx_files_status ON collection_files(download_status);
            CREATE INDEX IF NOT EXISTS idx_tasks_created ON download_tasks(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_links_task ON task_item_links(task_id);
            CREATE INDEX IF NOT EXISTS idx_links_item ON task_item_links(item_id);",
            )?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
                rusqlite::params![chrono::Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
        }

        if schema_version < 2 {
            let tx = conn.transaction()?;
            tx.execute_batch(
                "CREATE TABLE IF NOT EXISTS download_jobs (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL CHECK(kind IN ('files', 'genome_package')),
                    status TEXT NOT NULL CHECK(status IN ('queued', 'downloading', 'paused', 'completed', 'failed', 'cancelled')),
                    destination_root TEXT,
                    error_code TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_download_jobs_status_created ON download_jobs(status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_download_tasks_status ON download_tasks(download_status);",
            )?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
                rusqlite::params![chrono::Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
        }

        if schema_version < 3 {
            let tx = conn.transaction()?;
            tx.execute_batch(
                "ALTER TABLE download_tasks ADD COLUMN job_id TEXT REFERENCES download_jobs(id);
                 CREATE INDEX IF NOT EXISTS idx_download_tasks_job_id ON download_tasks(job_id);",
            )?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?1)",
                rusqlite::params![chrono::Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
        }

        tracing::info!("Initialized SQLite persistent collection database at {:?}", db_path);

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            item_repo: Box::new(SqliteItemRepository::new()),
            metadata_repo: Box::new(SqliteMetadataRepository::new()),
            file_repo: Box::new(SqliteFileRepository::new()),
        })
    }

    pub fn get_all_sra_records(&self) -> Result<Vec<SraRecord>, DbError> {
        let conn = self.conn.lock().unwrap();
        let items = self.item_repo.get_all(&conn)?;

        let mut sra_records = Vec::new();
        for item in items {
            if let Ok(Some(metadata)) = self.metadata_repo.get_by_item_id(&conn, &item.id) {
                if let Ok(mut record) = serde_json::from_str::<SraRecord>(&metadata.metadata_json) {
                    record.is_downloaded = Some(item.status == "downloaded");
                    record.status = Some(item.status.clone());
                    sra_records.push(record);
                    continue;
                }
            }

            let is_downloaded = item.status == "downloaded";
            sra_records.push(SraRecord {
                id: item.id.clone(),
                accession: item.accession,
                title: item.title,
                organism: item.organism,
                platform: item.platform,
                total_spots: item.total_spots,
                release_date: "".to_string(),
                study_id: "".to_string(),
                instrument_model: None,
                library_strategy: None,
                library_source: None,
                library_selection: None,
                library_layout: None,
                total_runs: None,
                total_bases: None,
                total_size: None,
                submitter_acc: None,
                center_name: None,
                experiment_acc: None,
                bioproject: None,
                biosample: None,
                sample_acc: None,
                construction_protocol: None,
                cell_line: None,
                source_name: None,
                treatment: None,
                antibody: None,
                expxml: None,
                is_downloaded: Some(is_downloaded),
                status: Some(item.status),
            });
        }

        Ok(sra_records)
    }

    pub fn add_sra_records(&self, records: Vec<SraRecord>) -> Result<usize, DbError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        for record in &records {
            let status = record.status.clone().unwrap_or_else(|| "saved".to_string());

            let item = CollectionItem {
                id: record.id.clone(),
                provider: "ncbi".to_string(),
                accession: record.accession.clone(),
                title: record.title.clone(),
                organism: record.organism.clone(),
                platform: record.platform.clone(),
                total_spots: record.total_spots.clone(),
                status,
                added_at: now.clone(),
            };

            let metadata_json = serde_json::to_string(record)?;
            let metadata = CollectionMetadata {
                item_id: record.id.clone(),
                raw_xml: record.expxml.clone(),
                metadata_json,
            };

            self.item_repo.insert(&conn, &item)?;
            self.metadata_repo.insert(&conn, &metadata)?;
        }

        let all_items = self.item_repo.get_all(&conn)?;
        Ok(all_items.len())
    }

    pub fn remove_records(&self, ids: &[String]) -> Result<usize, DbError> {
        let conn = self.conn.lock().unwrap();
        self.item_repo.delete_batch(&conn, ids)
    }

    pub fn get_dataset_details(&self, id: &str) -> Result<Option<DatasetDetails>, DbError> {
        let conn = self.conn.lock().unwrap();
        let item = self.item_repo.get_by_id(&conn, id)?;
        if let Some(item) = item {
            let metadata = self.metadata_repo.get_by_item_id(&conn, id)?;
            let files = self.file_repo.get_by_item_id(&conn, id)?;
            Ok(Some(DatasetDetails { item, metadata, files }))
        } else {
            Ok(None)
        }
    }

    pub fn save_resolved_files(
        &self,
        resolved_files: &[vortexflow_providers::ResolvedFileMetadata],
    ) -> Result<usize, DbError> {
        let conn = self.conn.lock().unwrap();

        // Build mapping from accession / id -> collection_items.id
        let items = self.item_repo.get_all(&conn)?;
        let mut acc_to_id_map = std::collections::HashMap::new();
        for item in &items {
            acc_to_id_map.insert(item.id.clone(), item.id.clone());
            acc_to_id_map.insert(item.accession.clone(), item.id.clone());
        }

        let db_files: Vec<CollectionFile> = resolved_files
            .iter()
            .map(|rf| {
                let real_item_id = acc_to_id_map
                    .get(&rf.item_id)
                    .or_else(|| acc_to_id_map.get(&rf.accession))
                    .or_else(|| acc_to_id_map.get(&rf.item_id.to_lowercase()))
                    .or_else(|| acc_to_id_map.get(&rf.accession.to_lowercase()))
                    .cloned()
                    .unwrap_or_else(|| rf.item_id.clone());

                CollectionFile {
                    id: format!("{}_{}_{}", real_item_id, rf.format, rf.read_pair),
                    item_id: real_item_id,
                    file_name: rf.file_name.clone(),
                    format: rf.format.clone(),
                    read_pair: rf.read_pair,
                    file_type: Some(rf.mirror_type.clone()),
                    download_url: Some(rf.download_url.clone()),
                    local_path: None,
                    file_size_bytes: rf.file_size_bytes,
                    download_status: "url_resolved".to_string(),
                    sha256_checksum: rf.sha256_checksum.clone(),
                    downloaded_at: None,
                    last_verified_at: None,
                }
            })
            .collect();

        self.file_repo.insert_batch(&conn, &db_files)?;

        let now = chrono::Utc::now().to_rfc3339();
        let job_id = format!(
            "files-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        conn.execute(
            "INSERT INTO download_jobs (id, kind, status, created_at) VALUES (?1, 'files', 'queued', ?2)",
            rusqlite::params![job_id, now],
        )?;
        for f in &db_files {
            let acc = items
                .iter()
                .find(|i| i.id == f.item_id)
                .map(|i| i.accession.clone())
                .unwrap_or_else(|| f.item_id.clone());

            let _ = conn.execute(
                "INSERT OR REPLACE INTO download_tasks
                 (id, task_name, accession_label, format, download_url, file_size_bytes, download_status, created_at, job_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, ?8)",
                rusqlite::params![f.id, f.file_name, acc, f.format, f.download_url, f.file_size_bytes as i64, now, job_id],
            );
            let _ = conn.execute(
                "INSERT OR IGNORE INTO task_item_links (task_id, item_id) VALUES (?1, ?2)",
                rusqlite::params![f.id, f.item_id],
            );
        }

        Ok(db_files.len())
    }

    pub fn create_batch_download_task(
        &self,
        task_id: &str,
        task_name: &str,
        accession_label: &str,
        format: &str,
        download_url: &str,
        accessions: &[String],
    ) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO download_jobs (id, kind, status, created_at)
             VALUES (?1, 'genome_package', 'queued', ?2)",
            rusqlite::params![task_id, now],
        )?;

        conn.execute(
            "INSERT OR REPLACE INTO download_tasks
             (id, task_name, accession_label, format, download_url, download_status, created_at, job_id)
             VALUES (?1, ?2, ?3, ?4, ?5, 'queued', ?6, ?1)",
            rusqlite::params![task_id, task_name, accession_label, format, download_url, now],
        )?;

        // Link all accessions to this task
        let items = self.item_repo.get_all(&conn)?;
        let mut acc_to_id = std::collections::HashMap::new();
        for item in items {
            acc_to_id.insert(item.accession.clone(), item.id.clone());
            acc_to_id.insert(item.id.clone(), item.id.clone());
        }

        for acc in accessions {
            if let Some(item_id) = acc_to_id.get(acc) {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO task_item_links (task_id, item_id) VALUES (?1, ?2)",
                    rusqlite::params![task_id, item_id],
                );
            }
        }

        Ok(())
    }

    pub fn get_download_tasks(&self) -> Result<Vec<crate::models::DownloadTaskItem>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.id,
                    COALESCE(MIN(l.item_id), t.id),
                    t.accession_label,
                    CASE WHEN COUNT(l.item_id) = 1 THEN COALESCE(MIN(i.title), '') ELSE 'NCBI Assembly Package' END,
                    CASE WHEN COUNT(l.item_id) = 1 THEN COALESCE(MIN(i.organism), '') ELSE 'Multiple Assemblies' END,
                    t.task_name,
                    t.format,
                    t.download_url,
                    t.local_path,
                    t.file_size_bytes,
                    t.downloaded_bytes,
                    t.download_status
             FROM download_tasks t
             LEFT JOIN task_item_links l ON t.id = l.task_id
             LEFT JOIN collection_items i ON l.item_id = i.id
             WHERE t.download_status != 'deleted'
             GROUP BY t.id
             UNION
             SELECT f.id, f.item_id, i.accession, COALESCE(i.title, ''), COALESCE(i.organism, ''),
                    f.file_name, f.format, f.download_url, f.local_path, f.file_size_bytes, f.downloaded_bytes, f.download_status
             FROM collection_files f
             JOIN collection_items i ON f.item_id = i.id
             WHERE f.download_status != 'deleted' AND f.id NOT IN (SELECT id FROM download_tasks)
             ORDER BY 1 DESC",
        )?;

        let task_iter = stmt.query_map([], |row| {
            let file_size_i64: i64 = row.get(9)?;
            let downloaded_i64: i64 = row.get(10)?;
            Ok(crate::models::DownloadTaskItem {
                file_id: row.get(0)?,
                item_id: row.get(1)?,
                accession: row.get(2)?,
                title: row.get(3)?,
                organism: row.get(4)?,
                file_name: row.get(5)?,
                format: row.get(6)?,
                download_url: row.get(7)?,
                local_path: row.get(8)?,
                file_size_bytes: file_size_i64 as u64,
                downloaded_bytes: downloaded_i64 as u64,
                download_status: row.get(11)?,
            })
        })?;

        let mut tasks = Vec::new();
        for task in task_iter {
            tasks.push(task?);
        }
        Ok(tasks)
    }

    pub fn update_file_download_progress(
        &self,
        file_id: &str,
        status: &str,
        downloaded_bytes: Option<u64>,
        file_size_bytes: Option<u64>,
        local_path: Option<&str>,
    ) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        let _ = self.file_repo.update_file_status(&conn, file_id, status, downloaded_bytes, file_size_bytes, local_path);

        conn.execute(
            "UPDATE download_tasks
             SET download_status = ?1,
                 downloaded_bytes = COALESCE(?2, downloaded_bytes),
                 file_size_bytes = CASE WHEN ?3 IS NOT NULL AND ?3 > 0 THEN ?3 ELSE file_size_bytes END,
                 local_path = COALESCE(?4, local_path)
             WHERE id = ?5",
            rusqlite::params![
                status,
                downloaded_bytes.map(|bytes| bytes as i64),
                file_size_bytes.map(|bytes| bytes as i64),
                local_path,
                file_id,
            ],
        )?;

        conn.execute(
            "UPDATE download_jobs
             SET status = CASE
                   WHEN EXISTS (SELECT 1 FROM download_tasks WHERE job_id = download_jobs.id AND download_status = 'failed') THEN 'failed'
                   WHEN NOT EXISTS (SELECT 1 FROM download_tasks WHERE job_id = download_jobs.id AND download_status != 'completed') THEN 'completed'
                   WHEN EXISTS (SELECT 1 FROM download_tasks WHERE job_id = download_jobs.id AND download_status = 'downloading') THEN 'downloading'
                   WHEN EXISTS (SELECT 1 FROM download_tasks WHERE job_id = download_jobs.id AND download_status = 'paused') THEN 'paused'
                   WHEN EXISTS (SELECT 1 FROM download_tasks WHERE job_id = download_jobs.id AND download_status = 'cancelled') THEN 'cancelled'
                   ELSE 'queued'
                 END,
                 started_at = CASE WHEN ?1 = 'downloading' THEN COALESCE(started_at, ?2) ELSE started_at END,
                 completed_at = CASE WHEN ?1 = 'completed' THEN ?2 ELSE completed_at END
             WHERE id IN (SELECT job_id FROM download_tasks WHERE id = ?3 AND job_id IS NOT NULL)",
            rusqlite::params![status, chrono::Utc::now().to_rfc3339(), file_id],
        )?;

        Ok(())
    }

    pub fn mark_download_failed(&self, file_id: &str, _error: &str) -> Result<(), DbError> {
        self.update_file_download_progress(file_id, "failed", None, None, None)?;
        Ok(())
    }

    pub fn delete_download_file(&self, file_id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        let _ = conn.execute(
            "UPDATE collection_items SET status = 'saved' WHERE status != 'downloaded' AND id IN (SELECT item_id FROM task_item_links WHERE task_id = ?1)",
            rusqlite::params![file_id],
        );
        let _ = conn.execute("DELETE FROM download_tasks WHERE id = ?1", rusqlite::params![file_id]);
        conn.execute(
            "DELETE FROM collection_files WHERE id = ?1 OR item_id = ?1 OR file_name = ?1",
            rusqlite::params![file_id],
        )?;
        Ok(())
    }

    pub fn mark_item_downloaded(&self, accession_or_id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE collection_items SET status = 'downloaded' WHERE id = ?1 OR accession = ?1",
            rusqlite::params![accession_or_id],
        )?;
        Ok(())
    }

    pub fn mark_task_completed(&self, task_id: &str, destination: Option<&str>) -> Result<Vec<String>, DbError> {
        let conn = self.conn.lock().unwrap();
        if let Some(dest) = destination {
            let _ = conn.execute(
                "UPDATE download_tasks SET download_status = 'completed', local_path = ?1, downloaded_bytes = file_size_bytes WHERE id = ?2",
                rusqlite::params![dest, task_id],
            );
        } else {
            let _ = conn.execute(
                "UPDATE download_tasks SET download_status = 'completed', downloaded_bytes = file_size_bytes WHERE id = ?1",
                rusqlite::params![task_id],
            );
        }

        let _ = conn.execute(
            "UPDATE collection_items SET status = 'downloaded' WHERE id IN (SELECT item_id FROM task_item_links WHERE task_id = ?1)",
            rusqlite::params![task_id],
        );

        let mut stmt = conn.prepare(
            "SELECT i.accession FROM collection_items i JOIN task_item_links l ON i.id = l.item_id WHERE l.task_id = ?1",
        )?;
        let accs = stmt
            .query_map(rusqlite::params![task_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(accs)
    }
}

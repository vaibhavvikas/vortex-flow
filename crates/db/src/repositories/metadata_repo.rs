use crate::error::DbError;
use crate::models::CollectionMetadata;
use rusqlite::{params, Connection};

pub trait MetadataRepository: Send + Sync {
    fn get_by_item_id(&self, conn: &Connection, item_id: &str) -> Result<Option<CollectionMetadata>, DbError>;
    fn insert(&self, conn: &Connection, metadata: &CollectionMetadata) -> Result<(), DbError>;
}

pub struct SqliteMetadataRepository;

impl SqliteMetadataRepository {
    pub fn new() -> Self {
        Self
    }
}

impl MetadataRepository for SqliteMetadataRepository {
    fn get_by_item_id(&self, conn: &Connection, item_id: &str) -> Result<Option<CollectionMetadata>, DbError> {
        let mut stmt = conn.prepare(
            "SELECT item_id, raw_xml, metadata_json FROM collection_metadata WHERE item_id = ?1",
        )?;

        let mut rows = stmt.query_map(params![item_id], |row| {
            Ok(CollectionMetadata {
                item_id: row.get(0)?,
                raw_xml: row.get(1)?,
                metadata_json: row.get(2)?,
            })
        })?;

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    fn insert(&self, conn: &Connection, metadata: &CollectionMetadata) -> Result<(), DbError> {
        conn.execute(
            "INSERT INTO collection_metadata (item_id, raw_xml, metadata_json)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(item_id) DO UPDATE SET
               raw_xml = excluded.raw_xml,
               metadata_json = excluded.metadata_json",
            params![
                metadata.item_id,
                metadata.raw_xml,
                metadata.metadata_json,
            ],
        )?;
        Ok(())
    }
}

use crate::error::DbError;
use crate::models::CollectionItem;
use rusqlite::{params, Connection};

pub trait ItemRepository: Send + Sync {
    fn get_all(&self, conn: &Connection) -> Result<Vec<CollectionItem>, DbError>;
    fn get_by_id(&self, conn: &Connection, id: &str) -> Result<Option<CollectionItem>, DbError>;
    fn insert(&self, conn: &Connection, item: &CollectionItem) -> Result<(), DbError>;
    fn delete_batch(&self, conn: &Connection, ids: &[String]) -> Result<usize, DbError>;
    fn update_status(&self, conn: &Connection, id: &str, status: &str) -> Result<(), DbError>;
}

pub struct SqliteItemRepository;

impl SqliteItemRepository {
    pub fn new() -> Self {
        Self
    }
}

impl ItemRepository for SqliteItemRepository {
    fn get_all(&self, conn: &Connection) -> Result<Vec<CollectionItem>, DbError> {
        let mut stmt = conn.prepare(
            "SELECT id, provider, accession, title, organism, platform, total_spots, status, added_at
             FROM collection_items ORDER BY added_at DESC",
        )?;

        let item_iter = stmt.query_map([], |row| {
            Ok(CollectionItem {
                id: row.get(0)?,
                provider: row.get(1)?,
                accession: row.get(2)?,
                title: row.get(3)?,
                organism: row.get(4)?,
                platform: row.get(5)?,
                total_spots: row.get(6)?,
                status: row.get(7)?,
                added_at: row.get(8)?,
            })
        })?;

        let mut items = Vec::new();
        for item in item_iter {
            items.push(item?);
        }
        Ok(items)
    }

    fn get_by_id(&self, conn: &Connection, id: &str) -> Result<Option<CollectionItem>, DbError> {
        let mut stmt = conn.prepare(
            "SELECT id, provider, accession, title, organism, platform, total_spots, status, added_at
             FROM collection_items WHERE id = ?1",
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            Ok(CollectionItem {
                id: row.get(0)?,
                provider: row.get(1)?,
                accession: row.get(2)?,
                title: row.get(3)?,
                organism: row.get(4)?,
                platform: row.get(5)?,
                total_spots: row.get(6)?,
                status: row.get(7)?,
                added_at: row.get(8)?,
            })
        })?;

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    fn insert(&self, conn: &Connection, item: &CollectionItem) -> Result<(), DbError> {
        conn.execute(
            "INSERT INTO collection_items (id, provider, accession, title, organism, platform, total_spots, status, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               organism = excluded.organism,
               platform = excluded.platform,
               total_spots = excluded.total_spots,
               status = excluded.status",
            params![
                item.id,
                item.provider,
                item.accession,
                item.title,
                item.organism,
                item.platform,
                item.total_spots,
                item.status,
                item.added_at,
            ],
        )?;
        Ok(())
    }

    fn delete_batch(&self, conn: &Connection, ids: &[String]) -> Result<usize, DbError> {
        if ids.is_empty() {
            return Ok(0);
        }

        let mut deleted_total = 0;
        for id in ids {
            let count = conn.execute("DELETE FROM collection_items WHERE id = ?1", params![id])?;
            deleted_total += count;
        }
        Ok(deleted_total)
    }

    fn update_status(&self, conn: &Connection, id: &str, status: &str) -> Result<(), DbError> {
        conn.execute(
            "UPDATE collection_items SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        Ok(())
    }
}

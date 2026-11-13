//! Blocks: the user's reusable pieces of expression with named slots, in the library database
//! (tables `blocks` and `block_groups`, migration v2). The app owns the meaning of the fields; this
//! side stores them, keeps the order, counts uses and versions.

use crate::library::{e, now, with, Library, LibraryState, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BlockGroup {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: String,
    pub group_id: Option<String>,
    pub name: String,
    pub description: String,
    pub body: String,
    /// JSON array of the slots ({name, label?, default?}), kept as the app wrote it.
    pub slots: serde_json::Value,
    pub trigger: String,
    pub tags: Vec<String>,
    pub display: bool,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub use_count: i64,
    pub version: i64,
}

fn row_block(r: &rusqlite::Row) -> rusqlite::Result<Block> {
    let slots: String = r.get(5)?;
    let tags: String = r.get(7)?;
    Ok(Block {
        id: r.get(0)?,
        group_id: r.get(1)?,
        name: r.get(2)?,
        description: r.get(3)?,
        body: r.get(4)?,
        slots: serde_json::from_str(&slots).unwrap_or(serde_json::Value::Array(vec![])),
        trigger: r.get(6)?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        display: r.get::<_, i64>(8)? != 0,
        position: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
        use_count: r.get(12)?,
        version: r.get(13)?,
    })
}

const COLS: &str = "id, group_id, name, description, body, slots, trigger, tags, display, position, created_at, updated_at, use_count, version";

impl Library {
    pub fn list_block_groups(&self) -> Result<Vec<BlockGroup>> {
        let mut st = self.conn.prepare("SELECT id, parent_id, name, position FROM block_groups ORDER BY position, name").map_err(e)?;
        let rows = st.query_map([], |r| Ok(BlockGroup { id: r.get(0)?, parent_id: r.get(1)?, name: r.get(2)?, position: r.get(3)? })).map_err(e)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e)
    }

    pub fn list_blocks(&self) -> Result<Vec<Block>> {
        let mut st = self.conn.prepare(&format!("SELECT {COLS} FROM blocks ORDER BY position, name")).map_err(e)?;
        let rows = st.query_map([], row_block).map_err(e)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e)
    }

    /// Creates or updates a block (an update increases its version and keeps its use count).
    pub fn save_block(&mut self, b: &Block) -> Result<Block> {
        if b.name.trim().is_empty() {
            return Err("A block needs a name".into());
        }
        if b.body.trim().is_empty() {
            return Err("A block needs something in it".into());
        }
        let t = now();
        let existing: Option<(i64, i64, i64)> = self
            .conn
            .query_row("SELECT version, use_count, created_at FROM blocks WHERE id = ?1", params![b.id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()
            .map_err(e)?;
        let (version, use_count, created_at, position) = match existing {
            Some((v, u, c)) => (v + 1, u, c, b.position),
            None => {
                let p: i64 = self.conn.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM blocks WHERE group_id IS ?1", params![b.group_id], |r| r.get(0)).map_err(e)?;
                (1, 0, t, p)
            }
        };
        let slots = serde_json::to_string(&b.slots).map_err(e)?;
        let tags = serde_json::to_string(&b.tags).map_err(e)?;
        self.conn
            .execute(
                &format!("INSERT INTO blocks ({COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) ON CONFLICT(id) DO UPDATE SET group_id = ?2, name = ?3, description = ?4, body = ?5, slots = ?6, trigger = ?7, tags = ?8, display = ?9, position = ?10, updated_at = ?12, version = ?14"),
                params![b.id, b.group_id, b.name.trim(), b.description, b.body, slots, b.trigger.trim(), tags, b.display as i64, position, created_at, t, use_count, version],
            )
            .map_err(e)?;
        self.conn.query_row(&format!("SELECT {COLS} FROM blocks WHERE id = ?1"), params![b.id], row_block).map_err(e)
    }

    pub fn delete_block(&mut self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM blocks WHERE id = ?1", params![id]).map_err(e)?;
        Ok(())
    }

    pub fn mark_block_used(&mut self, id: &str) -> Result<()> {
        self.conn.execute("UPDATE blocks SET use_count = use_count + 1 WHERE id = ?1", params![id]).map_err(e)?;
        Ok(())
    }

    /// Puts blocks in this order inside a group (None: no group): drag to reorder or to another group.
    pub fn reorder_blocks(&mut self, group_id: Option<&str>, ids: &[String]) -> Result<()> {
        let tx = self.conn.transaction().map_err(e)?;
        for (i, id) in ids.iter().enumerate() {
            tx.execute("UPDATE blocks SET group_id = ?2, position = ?3 WHERE id = ?1", params![id, group_id, i as i64]).map_err(e)?;
        }
        tx.commit().map_err(e)
    }

    pub fn save_block_group(&mut self, g: &BlockGroup) -> Result<BlockGroup> {
        if g.name.trim().is_empty() {
            return Err("A group needs a name".into());
        }
        self.conn
            .execute(
                "INSERT INTO block_groups (id, parent_id, name, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET parent_id = ?2, name = ?3, position = ?4",
                params![g.id, g.parent_id, g.name.trim(), g.position, now()],
            )
            .map_err(e)?;
        Ok(BlockGroup { name: g.name.trim().into(), ..g.clone() })
    }

    /// Deletes a group; its blocks stay, outside any group.
    pub fn delete_block_group(&mut self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM block_groups WHERE id = ?1", params![id]).map_err(e)?;
        Ok(())
    }
}

#[tauri::command]
pub fn blocks_list(state: tauri::State<'_, LibraryState>) -> Result<(Vec<BlockGroup>, Vec<Block>)> {
    with(&state, |l| Ok((l.list_block_groups()?, l.list_blocks()?)))
}
#[tauri::command]
pub fn blocks_save(state: tauri::State<'_, LibraryState>, block: Block) -> Result<Block> {
    with(&state, |l| l.save_block(&block))
}
#[tauri::command]
pub fn blocks_delete(state: tauri::State<'_, LibraryState>, id: String) -> Result<()> {
    with(&state, |l| l.delete_block(&id))
}
#[tauri::command]
pub fn blocks_mark_used(state: tauri::State<'_, LibraryState>, id: String) -> Result<()> {
    with(&state, |l| l.mark_block_used(&id))
}
#[tauri::command]
pub fn blocks_reorder(state: tauri::State<'_, LibraryState>, group_id: Option<String>, ids: Vec<String>) -> Result<()> {
    with(&state, |l| l.reorder_blocks(group_id.as_deref(), &ids))
}
#[tauri::command]
pub fn blocks_group_save(state: tauri::State<'_, LibraryState>, group: BlockGroup) -> Result<BlockGroup> {
    with(&state, |l| l.save_block_group(&group))
}
#[tauri::command]
pub fn blocks_group_delete(state: tauri::State<'_, LibraryState>, id: String) -> Result<()> {
    with(&state, |l| l.delete_block_group(&id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(id: &str, name: &str, body: &str) -> Block {
        Block { id: id.into(), group_id: None, name: name.into(), description: String::new(), body: body.into(), slots: serde_json::json!([{ "name": "m" }, { "name": "v" }]), trigger: "ke".into(), tags: vec!["mechanics".into()], display: false, position: 0, created_at: 0, updated_at: 0, use_count: 0, version: 0 }
    }

    #[test]
    fn saves_versions_counts_and_lists_blocks() {
        let mut l = Library::open_in_memory().unwrap();
        let b = l.save_block(&block("b1", "Kinetic energy", "\\frac{1}{2}#m #v^2")).unwrap();
        assert_eq!((b.version, b.use_count), (1, 0));
        l.mark_block_used("b1").unwrap();
        let mut upd = b.clone();
        upd.body = "\\tfrac{1}{2}#m #v^2".into();
        let b = l.save_block(&upd).unwrap();
        assert_eq!((b.version, b.use_count, b.body.as_str()), (2, 1, "\\tfrac{1}{2}#m #v^2"));
        assert_eq!(b.slots, serde_json::json!([{ "name": "m" }, { "name": "v" }]));
        assert_eq!(b.tags, vec!["mechanics".to_string()]);
        assert!(l.save_block(&block("b2", " ", "x")).is_err());
        assert_eq!(l.list_blocks().unwrap().len(), 1);
    }

    #[test]
    fn groups_order_and_deletion() {
        let mut l = Library::open_in_memory().unwrap();
        l.save_block_group(&BlockGroup { id: "g".into(), parent_id: None, name: "Mechanics".into(), position: 0 }).unwrap();
        for (id, name) in [("a", "A"), ("b", "B"), ("c", "C")] {
            l.save_block(&block(id, name, "x")).unwrap();
        }
        l.reorder_blocks(Some("g"), &["c".into(), "a".into()]).unwrap();
        let list = l.list_blocks().unwrap();
        let in_group: Vec<_> = list.iter().filter(|b| b.group_id.as_deref() == Some("g")).map(|b| b.name.clone()).collect();
        assert_eq!(in_group, vec!["C", "A"]);
        l.delete_block_group("g").unwrap();
        assert!(l.list_blocks().unwrap().iter().all(|b| b.group_id.is_none()), "blocks stay when their group goes");
        l.delete_block("b").unwrap();
        assert_eq!(l.list_blocks().unwrap().len(), 2);
    }
}

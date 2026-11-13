//! Equation library: a local SQLite database (`library.sqlite3` in the app data folder).
//!
//! The Rust side only stores and retrieves; searching, sorting and all presentation logic live in
//! TypeScript (`app/src/lib/library`). Every change runs in a transaction. The schema is versioned:
//! `MIGRATIONS[n]` upgrades a database from version n to n+1 and is never edited once released.
//! On start-up the database is copied to `backups/` (one file per day, last 14 kept).

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MIGRATIONS: &[&str] = &[
    // v1: folders, equations with version history, tags, autosave draft.
    r#"
    CREATE TABLE folders (
        id          TEXT PRIMARY KEY,
        parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
    );
    CREATE TABLE equations (
        id              TEXT PRIMARY KEY,
        folder_id       TEXT REFERENCES folders(id) ON DELETE SET NULL,
        name            TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        latex           TEXT NOT NULL,
        display         INTEGER NOT NULL DEFAULT 1,
        favorite        INTEGER NOT NULL DEFAULT 0,
        current_version INTEGER NOT NULL,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        last_used_at    INTEGER
    );
    CREATE INDEX equations_folder ON equations(folder_id);
    CREATE TABLE equation_versions (
        equation_id TEXT NOT NULL REFERENCES equations(id) ON DELETE CASCADE,
        version     INTEGER NOT NULL,
        latex       TEXT NOT NULL,
        display     INTEGER NOT NULL,
        note        TEXT NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (equation_id, version)
    );
    CREATE TABLE tags (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );
    CREATE TABLE equation_tags (
        equation_id TEXT NOT NULL REFERENCES equations(id) ON DELETE CASCADE,
        tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (equation_id, tag_id)
    );
    CREATE TABLE drafts (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        latex       TEXT NOT NULL,
        display     INTEGER NOT NULL,
        equation_id TEXT,
        updated_at  INTEGER NOT NULL
    );
    "#,
    // v2: blocks (reusable pieces with named slots) and their groups (docs/BLOCKS-DESIGN.md).
    r#"
    CREATE TABLE block_groups (
        id          TEXT PRIMARY KEY,
        parent_id   TEXT REFERENCES block_groups(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
    );
    CREATE TABLE blocks (
        id          TEXT PRIMARY KEY,
        group_id    TEXT REFERENCES block_groups(id) ON DELETE SET NULL,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        body        TEXT NOT NULL,
        slots       TEXT NOT NULL DEFAULT '[]',
        trigger     TEXT NOT NULL DEFAULT '',
        tags        TEXT NOT NULL DEFAULT '[]',
        display     INTEGER NOT NULL DEFAULT 0,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        use_count   INTEGER NOT NULL DEFAULT 0,
        version     INTEGER NOT NULL DEFAULT 1
    );
    "#,
];

pub(crate) fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

// ------------------------------------------------------------------ data types (camelCase JSON)

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i64,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Equation {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub description: String,
    pub latex: String,
    pub display: bool,
    pub favorite: bool,
    pub current_version: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: Option<i64>,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub version: i64,
    pub latex: String,
    pub display: bool,
    pub note: String,
    pub created_at: i64,
}

/// Fields the user can edit; `id` absent = create.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EquationInput {
    pub id: Option<String>,
    pub folder_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub latex: String,
    pub display: bool,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Note stored with the new version, if the content changed.
    #[serde(default)]
    pub note: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub latex: String,
    pub display: bool,
    pub equation_id: Option<String>,
    pub updated_at: i64,
}

/// Portable file format (export / import).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibraryExport {
    pub format: String,
    pub format_version: i64,
    pub exported_at: i64,
    pub folders: Vec<Folder>,
    pub equations: Vec<ExportedEquation>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportedEquation {
    #[serde(flatten)]
    pub equation: Equation,
    pub versions: Vec<Version>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub folders_added: usize,
    pub equations_added: usize,
    pub equations_updated: usize,
    pub equations_skipped: usize,
}

// ------------------------------------------------------------------ the store

pub struct Library {
    pub(crate) conn: Connection,
}

pub type Result<T> = std::result::Result<T, String>;
pub(crate) fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

impl Library {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(e)?;
        }
        let conn = Connection::open(path).map_err(e)?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory().map_err(e)?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;").map_err(e)?;
        let mut lib = Library { conn };
        lib.migrate()?;
        Ok(lib)
    }

    /// Applies pending migrations inside one transaction each (user_version tracks the schema).
    fn migrate(&mut self) -> Result<()> {
        let current: i64 = self.conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
            let tx = self.conn.transaction().map_err(e)?;
            tx.execute_batch(sql).map_err(e)?;
            tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1)).map_err(e)?;
            tx.commit().map_err(e)?;
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn schema_version(&self) -> i64 {
        self.conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap_or(0)
    }

    /// Writes a consistent copy of the database (used for daily backups).
    pub fn backup_to(&self, path: &Path) -> Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(e)?;
        }
        let _ = std::fs::remove_file(path);
        self.conn.execute("VACUUM INTO ?1", params![path.to_string_lossy()]).map_err(e)?;
        Ok(())
    }

    // -------------------------------------------------------------- folders

    pub fn list_folders(&self) -> Result<Vec<Folder>> {
        let mut st = self.conn.prepare("SELECT id, parent_id, name, position, created_at FROM folders ORDER BY position, name COLLATE NOCASE").map_err(e)?;
        let rows = st
            .query_map([], |r| Ok(Folder { id: r.get(0)?, parent_id: r.get(1)?, name: r.get(2)?, position: r.get(3)?, created_at: r.get(4)? }))
            .map_err(e)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e)
    }

    pub fn create_folder(&mut self, id: &str, name: &str, parent_id: Option<&str>) -> Result<Folder> {
        let name = clean_name(name)?;
        let position: i64 = self
            .conn
            .query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM folders WHERE parent_id IS ?1", params![parent_id], |r| r.get(0))
            .map_err(e)?;
        let f = Folder { id: id.into(), parent_id: parent_id.map(Into::into), name, position, created_at: now() };
        self.conn
            .execute("INSERT INTO folders (id, parent_id, name, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", params![f.id, f.parent_id, f.name, f.position, f.created_at])
            .map_err(e)?;
        Ok(f)
    }

    pub fn rename_folder(&mut self, id: &str, name: &str) -> Result<()> {
        let n = self.conn.execute("UPDATE folders SET name = ?2 WHERE id = ?1", params![id, clean_name(name)?]).map_err(e)?;
        if n == 0 { Err("Folder not found".into()) } else { Ok(()) }
    }

    /// Moves a folder under another one (None = top level); refuses to create a cycle.
    pub fn move_folder(&mut self, id: &str, parent_id: Option<&str>) -> Result<()> {
        if let Some(p) = parent_id {
            let mut cur = Some(p.to_string());
            while let Some(c) = cur {
                if c == id {
                    return Err("A folder cannot be moved into itself".into());
                }
                cur = self.conn.query_row("SELECT parent_id FROM folders WHERE id = ?1", params![c], |r| r.get(0)).optional().map_err(e)?.flatten();
            }
        }
        self.conn.execute("UPDATE folders SET parent_id = ?2 WHERE id = ?1", params![id, parent_id]).map_err(e)?;
        Ok(())
    }

    /// Deletes a folder and its sub-folders. Equations inside are kept and become unfiled.
    pub fn delete_folder(&mut self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM folders WHERE id = ?1", params![id]).map_err(e)?;
        Ok(())
    }

    // -------------------------------------------------------------- equations

    pub fn list_equations(&self) -> Result<Vec<Equation>> {
        let mut st = self
            .conn
            .prepare(
                "SELECT e.id, e.folder_id, e.name, e.description, e.latex, e.display, e.favorite, e.current_version,
                        e.created_at, e.updated_at, e.last_used_at,
                        COALESCE((SELECT group_concat(t.name, char(31)) FROM equation_tags et JOIN tags t ON t.id = et.tag_id
                                  WHERE et.equation_id = e.id), '')
                 FROM equations e ORDER BY e.name COLLATE NOCASE",
            )
            .map_err(e)?;
        let rows = st.query_map([], row_to_equation).map_err(e)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e)
    }

    pub fn get_equation(&self, id: &str) -> Result<Option<Equation>> {
        Ok(self.list_equations()?.into_iter().find(|q| q.id == id))
    }

    /// Creates or updates an equation. A new version is recorded when latex/display changed.
    pub fn save_equation(&mut self, new_id: &str, input: &EquationInput) -> Result<Equation> {
        let name = clean_name(&input.name)?;
        let t = now();
        let tx = self.conn.transaction().map_err(e)?;
        let id = match &input.id {
            Some(id) => {
                let existing: Option<(String, i64, i64)> = tx
                    .query_row("SELECT latex, display, current_version FROM equations WHERE id = ?1", params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                    .optional()
                    .map_err(e)?;
                let Some((latex, display, version)) = existing else { return Err("Equation not found".into()) };
                let changed = latex != input.latex || (display != 0) != input.display;
                let version = if changed { version + 1 } else { version };
                if changed {
                    insert_version(&tx, id, version, &input.latex, input.display, &input.note, t)?;
                }
                tx.execute(
                    "UPDATE equations SET folder_id = ?2, name = ?3, description = ?4, latex = ?5, display = ?6, favorite = ?7,
                         current_version = ?8, updated_at = ?9 WHERE id = ?1",
                    params![id, input.folder_id, name, input.description, input.latex, input.display, input.favorite, version, t],
                )
                .map_err(e)?;
                id.clone()
            }
            None => {
                tx.execute(
                    "INSERT INTO equations (id, folder_id, name, description, latex, display, favorite, current_version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
                    params![new_id, input.folder_id, name, input.description, input.latex, input.display, input.favorite, t],
                )
                .map_err(e)?;
                insert_version(&tx, new_id, 1, &input.latex, input.display, if input.note.is_empty() { "Created" } else { &input.note }, t)?;
                new_id.to_string()
            }
        };
        set_tags(&tx, &id, &input.tags)?;
        tx.commit().map_err(e)?;
        self.get_equation(&id)?.ok_or_else(|| "Equation vanished".to_string())
    }

    pub fn set_favorite(&mut self, id: &str, favorite: bool) -> Result<()> {
        self.conn.execute("UPDATE equations SET favorite = ?2 WHERE id = ?1", params![id, favorite]).map_err(e)?;
        Ok(())
    }

    pub fn move_equation(&mut self, id: &str, folder_id: Option<&str>) -> Result<()> {
        self.conn.execute("UPDATE equations SET folder_id = ?2, updated_at = ?3 WHERE id = ?1", params![id, folder_id, now()]).map_err(e)?;
        Ok(())
    }

    pub fn mark_used(&mut self, id: &str) -> Result<()> {
        self.conn.execute("UPDATE equations SET last_used_at = ?2 WHERE id = ?1", params![id, now()]).map_err(e)?;
        Ok(())
    }

    pub fn delete_equation(&mut self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM equations WHERE id = ?1", params![id]).map_err(e)?;
        Ok(())
    }

    pub fn duplicate_equation(&mut self, id: &str, new_id: &str) -> Result<Equation> {
        let src = self.get_equation(id)?.ok_or("Equation not found")?;
        let input = EquationInput {
            id: None,
            folder_id: src.folder_id.clone(),
            name: format!("{} (copy)", src.name),
            description: src.description.clone(),
            latex: src.latex.clone(),
            display: src.display,
            favorite: false,
            tags: src.tags.clone(),
            note: format!("Copied from \"{}\"", src.name),
        };
        self.save_equation(new_id, &input)
    }

    pub fn list_versions(&self, id: &str) -> Result<Vec<Version>> {
        let mut st = self
            .conn
            .prepare("SELECT version, latex, display, note, created_at FROM equation_versions WHERE equation_id = ?1 ORDER BY version DESC")
            .map_err(e)?;
        let rows = st
            .query_map(params![id], |r| Ok(Version { version: r.get(0)?, latex: r.get(1)?, display: r.get::<_, i64>(2)? != 0, note: r.get(3)?, created_at: r.get(4)? }))
            .map_err(e)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e)
    }

    /// Restores an old version by saving it as a new version (history is never rewritten).
    pub fn restore_version(&mut self, id: &str, version: i64) -> Result<Equation> {
        let v = self.list_versions(id)?.into_iter().find(|v| v.version == version).ok_or("Version not found")?;
        let q = self.get_equation(id)?.ok_or("Equation not found")?;
        let input = EquationInput {
            id: Some(id.into()),
            folder_id: q.folder_id,
            name: q.name,
            description: q.description,
            latex: v.latex,
            display: v.display,
            favorite: q.favorite,
            tags: q.tags,
            note: format!("Restored version {version}"),
        };
        self.save_equation("", &input)
    }

    // -------------------------------------------------------------- drafts (autosave)

    pub fn save_draft(&mut self, d: &Draft) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO drafts (id, latex, display, equation_id, updated_at) VALUES (1, ?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET latex = excluded.latex, display = excluded.display,
                     equation_id = excluded.equation_id, updated_at = excluded.updated_at",
                params![d.latex, d.display, d.equation_id, d.updated_at],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn load_draft(&self) -> Result<Option<Draft>> {
        self.conn
            .query_row("SELECT latex, display, equation_id, updated_at FROM drafts WHERE id = 1", [], |r| {
                Ok(Draft { latex: r.get(0)?, display: r.get::<_, i64>(1)? != 0, equation_id: r.get(2)?, updated_at: r.get(3)? })
            })
            .optional()
            .map_err(e)
    }

    // -------------------------------------------------------------- export / import

    pub fn export(&self) -> Result<LibraryExport> {
        let equations = self
            .list_equations()?
            .into_iter()
            .map(|q| {
                let versions = self.list_versions(&q.id)?;
                Ok(ExportedEquation { equation: q, versions })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(LibraryExport { format: "mathblocks-library".into(), format_version: 1, exported_at: now(), folders: self.list_folders()?, equations })
    }

    /// Merges an export into this library. Same id: the newer `updatedAt` wins, history is merged.
    pub fn import(&mut self, data: &LibraryExport) -> Result<ImportReport> {
        if data.format != "mathblocks-library" {
            return Err("This file is not a MathBlocks library".into());
        }
        if data.format_version > 1 {
            return Err("This library was exported by a newer MathBlocks version; please update".into());
        }
        let mut report = ImportReport::default();
        let tx = self.conn.transaction().map_err(e)?;
        // Parents before children so the foreign keys hold.
        let mut pending: Vec<&Folder> = data.folders.iter().collect();
        while !pending.is_empty() {
            let before = pending.len();
            pending.retain(|f| {
                let parent_ok = match &f.parent_id {
                    None => true,
                    Some(p) => tx.query_row("SELECT 1 FROM folders WHERE id = ?1", params![p], |_| Ok(())).optional().ok().flatten().is_some(),
                };
                if !parent_ok {
                    return true;
                }
                let inserted = tx
                    .execute(
                        "INSERT OR IGNORE INTO folders (id, parent_id, name, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![f.id, f.parent_id, f.name, f.position, f.created_at],
                    )
                    .unwrap_or(0);
                report.folders_added += inserted;
                false
            });
            if pending.len() == before {
                // Parent missing from the file: import these at the top level.
                for f in pending.drain(..) {
                    report.folders_added += tx
                        .execute("INSERT OR IGNORE INTO folders (id, parent_id, name, position, created_at) VALUES (?1, NULL, ?2, ?3, ?4)", params![f.id, f.name, f.position, f.created_at])
                        .map_err(e)?;
                }
            }
        }
        for x in &data.equations {
            let q = &x.equation;
            let existing: Option<i64> = tx.query_row("SELECT updated_at FROM equations WHERE id = ?1", params![q.id], |r| r.get(0)).optional().map_err(e)?;
            let folder_ok = match &q.folder_id {
                None => true,
                Some(f) => tx.query_row("SELECT 1 FROM folders WHERE id = ?1", params![f], |_| Ok(())).optional().map_err(e)?.is_some(),
            };
            let folder = if folder_ok { q.folder_id.clone() } else { None };
            match existing {
                Some(updated) if updated >= q.updated_at => {
                    report.equations_skipped += 1;
                }
                Some(_) => {
                    tx.execute(
                        "UPDATE equations SET folder_id = ?2, name = ?3, description = ?4, latex = ?5, display = ?6, favorite = ?7,
                             current_version = MAX(current_version, ?8), updated_at = ?9 WHERE id = ?1",
                        params![q.id, folder, q.name, q.description, q.latex, q.display, q.favorite, q.current_version, q.updated_at],
                    )
                    .map_err(e)?;
                    report.equations_updated += 1;
                }
                None => {
                    tx.execute(
                        "INSERT INTO equations (id, folder_id, name, description, latex, display, favorite, current_version, created_at, updated_at, last_used_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                        params![q.id, folder, q.name, q.description, q.latex, q.display, q.favorite, q.current_version, q.created_at, q.updated_at, q.last_used_at],
                    )
                    .map_err(e)?;
                    report.equations_added += 1;
                }
            }
            if !matches!(existing, Some(u) if u >= q.updated_at) {
                for v in &x.versions {
                    tx.execute(
                        "INSERT OR IGNORE INTO equation_versions (equation_id, version, latex, display, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![q.id, v.version, v.latex, v.display, v.note, v.created_at],
                    )
                    .map_err(e)?;
                }
                set_tags(&tx, &q.id, &q.tags)?;
            }
        }
        tx.commit().map_err(e)?;
        Ok(report)
    }
}

fn clean_name(name: &str) -> Result<String> {
    let n = name.trim();
    if n.is_empty() {
        return Err("A name is required".into());
    }
    Ok(n.chars().take(200).collect())
}

fn insert_version(tx: &Transaction, id: &str, version: i64, latex: &str, display: bool, note: &str, t: i64) -> Result<()> {
    tx.execute(
        "INSERT INTO equation_versions (equation_id, version, latex, display, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, version, latex, display, note, t],
    )
    .map_err(e)?;
    Ok(())
}

fn set_tags(tx: &Transaction, id: &str, tags: &[String]) -> Result<()> {
    tx.execute("DELETE FROM equation_tags WHERE equation_id = ?1", params![id]).map_err(e)?;
    for tag in tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![tag]).map_err(e)?;
        tx.execute(
            "INSERT OR IGNORE INTO equation_tags (equation_id, tag_id) SELECT ?1, id FROM tags WHERE name = ?2 COLLATE NOCASE",
            params![id, tag],
        )
        .map_err(e)?;
    }
    // Drop tags nobody uses any more.
    tx.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM equation_tags)", []).map_err(e)?;
    Ok(())
}

fn row_to_equation(r: &rusqlite::Row) -> rusqlite::Result<Equation> {
    let tags: String = r.get(11)?;
    let mut tags: Vec<String> = tags.split('\u{1f}').filter(|t| !t.is_empty()).map(Into::into).collect();
    tags.sort_by_key(|t| t.to_lowercase());
    Ok(Equation {
        id: r.get(0)?,
        folder_id: r.get(1)?,
        name: r.get(2)?,
        description: r.get(3)?,
        latex: r.get(4)?,
        display: r.get::<_, i64>(5)? != 0,
        favorite: r.get::<_, i64>(6)? != 0,
        current_version: r.get(7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
        last_used_at: r.get(10)?,
        tags,
    })
}

// ------------------------------------------------------------------ Tauri glue

#[derive(Default)]
pub struct LibraryState(pub Mutex<Option<Library>>);

/// Opens the library next to the app's data and makes today's backup.
pub fn open_for_app(data_dir: &Path) -> Result<Library> {
    let path = data_dir.join("library.sqlite3");
    let lib = Library::open(&path)?;
    let backups = data_dir.join("backups");
    let day = (now() / 86_400_000).to_string();
    let target = backups.join(format!("library-{day}.sqlite3"));
    if !target.exists() {
        let _ = lib.backup_to(&target);
        prune_backups(&backups, 14);
    }
    Ok(lib)
}

fn prune_backups(dir: &Path, keep: usize) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().is_some_and(|x| x == "sqlite3")).collect();
    files.sort();
    while files.len() > keep {
        let _ = std::fs::remove_file(files.remove(0));
    }
}

pub(crate) fn with<T>(state: &tauri::State<'_, LibraryState>, f: impl FnOnce(&mut Library) -> Result<T>) -> Result<T> {
    let mut guard = state.0.lock().map_err(|_| "Library is busy".to_string())?;
    let lib = guard.as_mut().ok_or("The library could not be opened")?;
    f(lib)
}

#[tauri::command]
pub fn library_list(state: tauri::State<'_, LibraryState>) -> Result<(Vec<Folder>, Vec<Equation>)> {
    with(&state, |l| Ok((l.list_folders()?, l.list_equations()?)))
}
#[tauri::command]
pub fn library_create_folder(state: tauri::State<'_, LibraryState>, id: String, name: String, parent_id: Option<String>) -> Result<Folder> {
    with(&state, |l| l.create_folder(&id, &name, parent_id.as_deref()))
}
#[tauri::command]
pub fn library_rename_folder(state: tauri::State<'_, LibraryState>, id: String, name: String) -> Result<()> {
    with(&state, |l| l.rename_folder(&id, &name))
}
#[tauri::command]
pub fn library_move_folder(state: tauri::State<'_, LibraryState>, id: String, parent_id: Option<String>) -> Result<()> {
    with(&state, |l| l.move_folder(&id, parent_id.as_deref()))
}
#[tauri::command]
pub fn library_delete_folder(state: tauri::State<'_, LibraryState>, id: String) -> Result<()> {
    with(&state, |l| l.delete_folder(&id))
}
#[tauri::command]
pub fn library_save(state: tauri::State<'_, LibraryState>, new_id: String, input: EquationInput) -> Result<Equation> {
    with(&state, |l| l.save_equation(&new_id, &input))
}
#[tauri::command]
pub fn library_set_favorite(state: tauri::State<'_, LibraryState>, id: String, favorite: bool) -> Result<()> {
    with(&state, |l| l.set_favorite(&id, favorite))
}
#[tauri::command]
pub fn library_move_equation(state: tauri::State<'_, LibraryState>, id: String, folder_id: Option<String>) -> Result<()> {
    with(&state, |l| l.move_equation(&id, folder_id.as_deref()))
}
#[tauri::command]
pub fn library_mark_used(state: tauri::State<'_, LibraryState>, id: String) -> Result<()> {
    with(&state, |l| l.mark_used(&id))
}
#[tauri::command]
pub fn library_delete(state: tauri::State<'_, LibraryState>, id: String) -> Result<()> {
    with(&state, |l| l.delete_equation(&id))
}
#[tauri::command]
pub fn library_duplicate(state: tauri::State<'_, LibraryState>, id: String, new_id: String) -> Result<Equation> {
    with(&state, |l| l.duplicate_equation(&id, &new_id))
}
#[tauri::command]
pub fn library_versions(state: tauri::State<'_, LibraryState>, id: String) -> Result<Vec<Version>> {
    with(&state, |l| l.list_versions(&id))
}
#[tauri::command]
pub fn library_restore_version(state: tauri::State<'_, LibraryState>, id: String, version: i64) -> Result<Equation> {
    with(&state, |l| l.restore_version(&id, version))
}
#[tauri::command]
pub fn library_save_draft(state: tauri::State<'_, LibraryState>, draft: Draft) -> Result<()> {
    with(&state, |l| l.save_draft(&draft))
}
#[tauri::command]
pub fn library_load_draft(state: tauri::State<'_, LibraryState>) -> Result<Option<Draft>> {
    with(&state, |l| l.load_draft())
}
#[tauri::command]
pub fn library_export(state: tauri::State<'_, LibraryState>, path: String) -> Result<usize> {
    with(&state, |l| {
        let data = l.export()?;
        let json = serde_json::to_string_pretty(&data).map_err(e)?;
        std::fs::write(&path, json).map_err(e)?;
        Ok(data.equations.len())
    })
}
#[tauri::command]
pub fn library_import(state: tauri::State<'_, LibraryState>, path: String) -> Result<ImportReport> {
    let text = std::fs::read_to_string(&path).map_err(e)?;
    let data: LibraryExport = serde_json::from_str(&text).map_err(|err| format!("Not a valid library file: {err}"))?;
    with(&state, |l| l.import(&data))
}

// ------------------------------------------------------------------ tests

#[cfg(test)]
mod tests {
    use super::*;

    fn input(name: &str, latex: &str) -> EquationInput {
        EquationInput { id: None, folder_id: None, name: name.into(), description: String::new(), latex: latex.into(), display: true, favorite: false, tags: vec![], note: String::new() }
    }

    #[test]
    fn migrates_to_latest_schema() {
        let l = Library::open_in_memory().unwrap();
        assert_eq!(l.schema_version(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn saves_versions_only_when_content_changes() {
        let mut l = Library::open_in_memory().unwrap();
        let q = l.save_equation("A", &input("Newton", "F=ma")).unwrap();
        assert_eq!(q.current_version, 1);
        let mut upd = input("Newton's 2nd law", "F=ma");
        upd.id = Some("A".into());
        let q = l.save_equation("", &upd).unwrap();
        assert_eq!((q.current_version, q.name.as_str()), (1, "Newton's 2nd law"), "rename only: no new version");
        upd.latex = "\\vec{F}=m\\vec{a}".into();
        let q = l.save_equation("", &upd).unwrap();
        assert_eq!(q.current_version, 2);
        let vs = l.list_versions("A").unwrap();
        assert_eq!(vs.iter().map(|v| v.latex.as_str()).collect::<Vec<_>>(), vec!["\\vec{F}=m\\vec{a}", "F=ma"]);
        let q = l.restore_version("A", 1).unwrap();
        assert_eq!((q.latex.as_str(), q.current_version), ("F=ma", 3));
    }

    #[test]
    fn tags_are_case_insensitive_and_cleaned_up() {
        let mut l = Library::open_in_memory().unwrap();
        let mut i = input("a", "x");
        i.tags = vec!["Mechanics".into(), "mechanics".into(), " orbit ".into(), "".into()];
        let q = l.save_equation("A", &i).unwrap();
        assert_eq!(q.tags, vec!["Mechanics", "orbit"]);
        i.id = Some("A".into());
        i.tags = vec![];
        l.save_equation("", &i).unwrap();
        let n: i64 = l.conn.query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn deleting_a_folder_keeps_its_equations() {
        let mut l = Library::open_in_memory().unwrap();
        l.create_folder("F", "Thesis", None).unwrap();
        l.create_folder("G", "Chapter 2", Some("F")).unwrap();
        let mut i = input("eq", "x");
        i.folder_id = Some("G".into());
        l.save_equation("A", &i).unwrap();
        assert!(l.move_folder("F", Some("G")).is_err(), "cycle refused");
        l.delete_folder("F").unwrap();
        assert!(l.list_folders().unwrap().is_empty(), "sub-folders deleted too");
        assert_eq!(l.get_equation("A").unwrap().unwrap().folder_id, None);
    }

    #[test]
    fn rejects_empty_names() {
        let mut l = Library::open_in_memory().unwrap();
        assert!(l.save_equation("A", &input("   ", "x")).is_err());
        assert!(l.create_folder("F", "", None).is_err());
    }

    #[test]
    fn duplicate_and_delete() {
        let mut l = Library::open_in_memory().unwrap();
        l.save_equation("A", &input("Kepler", "M=E-e\\sin E")).unwrap();
        let d = l.duplicate_equation("A", "B").unwrap();
        assert_eq!(d.name, "Kepler (copy)");
        l.delete_equation("A").unwrap();
        assert!(l.list_versions("A").unwrap().is_empty(), "history removed with the equation");
        assert_eq!(l.list_equations().unwrap().len(), 1);
    }

    #[test]
    fn draft_round_trip() {
        let mut l = Library::open_in_memory().unwrap();
        assert_eq!(l.load_draft().unwrap(), None);
        let d = Draft { latex: "x^2".into(), display: false, equation_id: Some("A".into()), updated_at: 5 };
        l.save_draft(&d).unwrap();
        l.save_draft(&Draft { latex: "x^3".into(), ..d.clone() }).unwrap();
        assert_eq!(l.load_draft().unwrap().unwrap().latex, "x^3");
    }

    #[test]
    fn export_import_merges_by_newest() {
        let mut a = Library::open_in_memory().unwrap();
        a.create_folder("F", "Thesis", None).unwrap();
        a.create_folder("G", "Appendix", Some("F")).unwrap();
        let mut i = input("A.1", "\\vec{\\mathbf{c}}_i");
        i.folder_id = Some("G".into());
        i.tags = vec!["mass".into()];
        a.save_equation("E1", &i).unwrap();
        let data = a.export().unwrap();
        let json = serde_json::to_string(&data).unwrap();

        let mut b = Library::open_in_memory().unwrap();
        let report = b.import(&serde_json::from_str(&json).unwrap()).unwrap();
        assert_eq!((report.folders_added, report.equations_added), (2, 1));
        let q = b.get_equation("E1").unwrap().unwrap();
        assert_eq!((q.folder_id.as_deref(), q.tags.clone()), (Some("G"), vec!["mass".to_string()]));
        assert_eq!(b.list_versions("E1").unwrap().len(), 1);
        // Importing the same file again changes nothing.
        let again = b.import(&serde_json::from_str(&json).unwrap()).unwrap();
        assert_eq!((again.equations_added, again.equations_skipped), (0, 1));
    }

    #[test]
    fn import_rejects_foreign_files() {
        let mut l = Library::open_in_memory().unwrap();
        let bad = LibraryExport { format: "other".into(), format_version: 1, exported_at: 0, folders: vec![], equations: vec![] };
        assert!(l.import(&bad).is_err());
    }

    #[test]
    fn file_database_and_backup() {
        let dir = std::env::temp_dir().join(format!("mb-lib-test-{}", now()));
        {
            let mut l = open_for_app(&dir).unwrap();
            l.save_equation("A", &input("x", "x")).unwrap();
        }
        let l = Library::open(&dir.join("library.sqlite3")).unwrap();
        assert_eq!(l.list_equations().unwrap().len(), 1, "data persisted");
        assert!(std::fs::read_dir(dir.join("backups")).unwrap().count() >= 1, "backup written");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

# TidyPhotos - Agent Instructions

Essential context for AI coding assistants working on TidyPhotos.

## Architecture

**Stack**: Go backend (`net/http` stdlib, no frameworks) + Alpine.js frontend (inline in HTML) + SQLite (`modernc.org/sqlite`, pure Go)

**Core Principle**: Filesystem is source of truth. Database stores metadata and relationships only.

## File Structure

```
cmd/server/main.go          # HTTP server, routing, handlers (589 lines)
cmd/regen-thumbs/main.go    # Thumbnail regeneration utility
internal/db/db.go           # SQLite database layer, schema (323 lines)
internal/importer/importer.go # Photo scanning, EXIF, thumbnails (311 lines)
public/index.html           # Complete Alpine.js SPA (1435 lines)
public/styles/main.css      # Styles (1113 lines)
```

## Key Technical Decisions (Critical!)

1. **Face Tag Coordinates**: Stored as **percentages (0-100)**, NOT pixels. This is for responsive scaling.
   - Example: `{x: 25.5, y: 30.2, width: 15.0, height: 20.0}` = 25.5% from left edge, etc.

2. **Favorites System**: Implemented as **symlinks** in `{PHOTOS_DIR}/favorites/` directory
   - Filesystem → Database sync (filesystem is source of truth)
   - PUT creates symlink + updates DB, DELETE removes both

3. **SQLite Journal Mode**: **DELETE mode** (rollback journal), NOT WAL
   - Set via `PRAGMA journal_mode=DELETE` on connection (internal/db/db.go:24-28)
   - Prevents `.db-wal` and `.db-shm` files from appearing

4. **Photo Import Flow**: Startup triggers scan → EXIF extract (exiftool) → Thumbnail gen (vips/sips) → DB insert
   - Idempotent: Checks existing photos by filename before importing

5. **Pure Go SQLite**: Uses `modernc.org/sqlite` (no CGo) for easy cross-compilation

## Build & Run

```bash
npm run dev              # Build + run server (recommended)
go run cmd/server/main.go # Direct run (skip npm)
npm run regen-thumbs     # Regenerate all thumbnails

# Server: http://127.0.0.1:8080
# Network: http://192.168.1.201:8080 (hardcoded in main.go)
```

## Development Guidelines

### Backend (Go)

**Security**:
- Always use `isPathSafe()` before serving files (prevents directory traversal)

**Database** (internal/db/db.go):
- Use Unix timestamps: `time.Now().Unix()` (not datetime strings)
- Nullable fields: `sql.NullString`, `sql.NullInt64`
- EXIF metadata: JSON string in `metadata_json` column
- Schema changes: No migration system yet, delete `photos.db` and restart for dev

**Photo Import** (internal/importer/importer.go):
- EXIF: `exiftool` CLI, parses JSON output
- Thumbnails: Prefer `vips thumbnail` (fastest), fallback `sips + cwebp`
- Formats: `.jpg`, `.jpeg`, `.png`, `.heic`, `.webp`

### Frontend (Alpine.js)

**State Management**:
- `app` store = single source of truth for `selectedPhotoIndex`
- Other stores reference it via getters (e.g., `photos.filteredPhotos`)
- Avoid duplicating state across stores

**Keyboard Shortcuts**:
- **CRITICAL**: Check `event.target.tagName !== 'INPUT'` before handling shortcuts
- Without this check, typing in search boxes triggers navigation

**API Calls**:
- Use optimistic UI updates (update UI immediately, then call API)
- Handle errors gracefully, revert optimistic changes on failure

### CSS

**Performance**:
- Use `contain: layout` on photo grid items for faster repaints
- Lazy loading: `<img loading="lazy">`
- Avoid transitions that affect layout (width, height)

## Common Gotchas & Solutions

1. **WAL Files Appearing** (`photos.db-wal`, `photos.db-shm`):
   - Fix: Ensure `PRAGMA journal_mode=DELETE` set on connection (internal/db/db.go:24-28)
   - SQLite journal mode persists in DB file, must be explicitly set

2. **Keyboard Shortcuts Interfering with Input Fields**:
   - Fix: Check `event.target.tagName !== 'INPUT'` before handling keyboard events
   - Allows typing in search/modals without triggering navigation

3. **Face Tag Coordinates Not Persisting**:
   - Fix: Coordinates must be percentages (0-100), not pixels
   - Send PUT to `/api/face-tags/{id}` with updated coordinates

4. **Thumbnail Generation Failures**:
   - Check if `vips` installed: `brew install vips`
   - Fallback to `sips + cwebp` on macOS if vips unavailable

5. **Favorites Not Syncing**:
   - Remember: Filesystem → Database (not bidirectional)
   - Sync happens on startup via `internal/importer/importer.go`

## Reference

- **API Routes**: See `cmd/server/main.go` (lines 40-130)
- **Database Schema**: See `internal/db/db.go` initSchema() (lines 33-105)
- **Alpine Stores**: See `public/index.html` <script> section
- **Installation/Setup**: See README.md (if exists) or install: `brew install exiftool vips webp`

## Current Feature Status

**Implemented**: Photo gallery, timeline filtering, search, favorites (symlink-based), face tagging (manual), people management, keyboard nav, mobile responsive

**Not Implemented**: Automatic face detection (ML deps installed but unused), albums (DB table exists, no UI), photo editing, bulk operations, video support

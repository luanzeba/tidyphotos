const std = @import("std");
const c = @cImport({
    @cInclude("sqlite3.h");
});

pub const Database = struct {
    db: *c.sqlite3,
    allocator: std.mem.Allocator,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator, path: []const u8) !Self {
        var db: ?*c.sqlite3 = null;
        
        const result = c.sqlite3_open(@ptrCast(path), &db);
        if (result != c.SQLITE_OK) {
            std.debug.print("Failed to open database: {s}\n", .{c.sqlite3_errmsg(db)});
            return error.DatabaseOpenFailed;
        }

        var self = Self{
            .db = db.?,
            .allocator = allocator,
        };

        try self.createTables();
        return self;
    }

    pub fn deinit(self: *Self) void {
        _ = c.sqlite3_close(self.db);
    }

    fn createTables(self: *Self) !void {
        const schemas = [_][]const u8{
            // Photos table - minimal metadata, prefer filesystem data
            \\CREATE TABLE IF NOT EXISTS photos (
            \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
            \\    path TEXT NOT NULL UNIQUE,
            \\    filename TEXT NOT NULL,
            \\    imported_at INTEGER NOT NULL,
            \\    favorite BOOLEAN DEFAULT FALSE,
            \\    metadata_json TEXT,
            \\    thumbnail_path TEXT
            \\);
            ,
            
            // Albums table - symlink-based albums
            \\CREATE TABLE IF NOT EXISTS albums (
            \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
            \\    name TEXT NOT NULL UNIQUE,
            \\    directory_path TEXT NOT NULL,
            \\    created_at INTEGER NOT NULL,
            \\    description TEXT
            \\);
            ,
            
            // People for facial recognition
            \\CREATE TABLE IF NOT EXISTS people (
            \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
            \\    name TEXT NOT NULL,
            \\    face_encodings TEXT,
            \\    created_at INTEGER NOT NULL
            \\);
            ,
            
            // Photo-person associations
            \\CREATE TABLE IF NOT EXISTS photo_people (
            \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
            \\    photo_id INTEGER NOT NULL,
            \\    person_id INTEGER NOT NULL,
            \\    confidence REAL DEFAULT 1.0,
            \\    confirmed BOOLEAN DEFAULT FALSE,
            \\    created_at INTEGER NOT NULL,
            \\    FOREIGN KEY (photo_id) REFERENCES photos (id),
            \\    FOREIGN KEY (person_id) REFERENCES people (id),
            \\    UNIQUE (photo_id, person_id)
            \\);
            ,
            
            // Import tracking for daemon
            \\CREATE TABLE IF NOT EXISTS import_status (
            \\    id INTEGER PRIMARY KEY,
            \\    last_scan INTEGER NOT NULL,
            \\    photos_imported INTEGER DEFAULT 0,
            \\    last_import_path TEXT
            \\);
        };

        for (schemas) |schema| {
            const result = c.sqlite3_exec(self.db, @ptrCast(schema), null, null, null);
            if (result != c.SQLITE_OK) {
                std.debug.print("Failed to create table: {s}\n", .{c.sqlite3_errmsg(self.db)});
                return error.TableCreationFailed;
            }
        }

        // Create indexes for performance
        const indexes = [_][]const u8{
            "CREATE INDEX IF NOT EXISTS idx_photos_path ON photos (path);",
            "CREATE INDEX IF NOT EXISTS idx_photos_imported_at ON photos (imported_at);",
            "CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos (favorite);",
            "CREATE INDEX IF NOT EXISTS idx_photo_people_photo_id ON photo_people (photo_id);",
            "CREATE INDEX IF NOT EXISTS idx_photo_people_person_id ON photo_people (person_id);",
        };

        for (indexes) |index| {
            const result = c.sqlite3_exec(self.db, @ptrCast(index), null, null, null);
            if (result != c.SQLITE_OK) {
                std.debug.print("Failed to create index: {s}\n", .{c.sqlite3_errmsg(self.db)});
                return error.IndexCreationFailed;
            }
        }

        std.debug.print("Database tables created successfully\n");
    }

    pub fn insertPhoto(self: *Self, path: []const u8, filename: []const u8, metadata_json: ?[]const u8) !i64 {
        const sql = "INSERT INTO photos (path, filename, imported_at, metadata_json) VALUES (?, ?, ?, ?)";
        
        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);
        
        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        const now = std.time.timestamp();
        
        _ = c.sqlite3_bind_text(stmt, 1, @ptrCast(path), @intCast(path.len), null);
        _ = c.sqlite3_bind_text(stmt, 2, @ptrCast(filename), @intCast(filename.len), null);
        _ = c.sqlite3_bind_int64(stmt, 3, now);
        
        if (metadata_json) |meta| {
            _ = c.sqlite3_bind_text(stmt, 4, @ptrCast(meta), @intCast(meta.len), null);
        } else {
            _ = c.sqlite3_bind_null(stmt, 4);
        }

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.InsertFailed;
        }

        return c.sqlite3_last_insert_rowid(self.db);
    }

    pub fn getPhotos(self: *Self, allocator: std.mem.Allocator) ![]Photo {
        const sql = "SELECT id, path, filename, imported_at, favorite, metadata_json FROM photos ORDER BY imported_at DESC";
        
        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);
        
        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        var photos = std.ArrayList(Photo).init(allocator);
        
        while (c.sqlite3_step(stmt) == c.SQLITE_ROW) {
            const id = c.sqlite3_column_int64(stmt, 0);
            const path_ptr = c.sqlite3_column_text(stmt, 1);
            const filename_ptr = c.sqlite3_column_text(stmt, 2);
            const imported_at = c.sqlite3_column_int64(stmt, 3);
            const favorite = c.sqlite3_column_int(stmt, 4) != 0;
            const metadata_ptr = c.sqlite3_column_text(stmt, 5);
            
            const path = std.mem.span(@as([*:0]const u8, @ptrCast(path_ptr)));
            const filename = std.mem.span(@as([*:0]const u8, @ptrCast(filename_ptr)));
            const metadata = if (metadata_ptr != null) 
                std.mem.span(@as([*:0]const u8, @ptrCast(metadata_ptr))) 
            else 
                null;

            const photo = Photo{
                .id = id,
                .path = try allocator.dupe(u8, path),
                .filename = try allocator.dupe(u8, filename),
                .imported_at = imported_at,
                .favorite = favorite,
                .metadata_json = if (metadata) |m| try allocator.dupe(u8, m) else null,
            };
            
            try photos.append(photo);
        }

        return photos.toOwnedSlice();
    }
};

pub const Photo = struct {
    id: i64,
    path: []const u8,
    filename: []const u8,
    imported_at: i64,
    favorite: bool,
    metadata_json: ?[]const u8,
};
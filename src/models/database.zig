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
            
            // Face tags for manual/automatic face detection
            \\CREATE TABLE IF NOT EXISTS face_tags (
            \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
            \\    photo_filename TEXT NOT NULL,
            \\    person_id INTEGER,
            \\    x REAL NOT NULL,
            \\    y REAL NOT NULL,
            \\    width REAL NOT NULL,
            \\    height REAL NOT NULL,
            \\    confidence REAL DEFAULT 1.0,
            \\    is_manual BOOLEAN DEFAULT TRUE,
            \\    created_at INTEGER NOT NULL,
            \\    FOREIGN KEY (person_id) REFERENCES people (id)
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
            "CREATE INDEX IF NOT EXISTS idx_face_tags_photo_filename ON face_tags (photo_filename);",
            "CREATE INDEX IF NOT EXISTS idx_face_tags_person_id ON face_tags (person_id);",
        };

        for (indexes) |index| {
            const result = c.sqlite3_exec(self.db, @ptrCast(index), null, null, null);
            if (result != c.SQLITE_OK) {
                std.debug.print("Failed to create index: {s}\n", .{c.sqlite3_errmsg(self.db)});
                return error.IndexCreationFailed;
            }
        }

        std.debug.print("Database tables created successfully\n", .{});
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
        const result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);
        
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

    pub fn insertPerson(self: *Self, name: []const u8, face_encodings: ?[]const u8) !i64 {
        const sql = "INSERT INTO people (name, face_encodings, created_at) VALUES (?, ?, ?)";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        const now = std.time.timestamp();

        _ = c.sqlite3_bind_text(stmt, 1, @ptrCast(name), @intCast(name.len), null);

        if (face_encodings) |encodings| {
            _ = c.sqlite3_bind_text(stmt, 2, @ptrCast(encodings), @intCast(encodings.len), null);
        } else {
            _ = c.sqlite3_bind_null(stmt, 2);
        }

        _ = c.sqlite3_bind_int64(stmt, 3, now);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.InsertFailed;
        }

        return c.sqlite3_last_insert_rowid(self.db);
    }

    pub fn getPeople(self: *Self, allocator: std.mem.Allocator) ![]Person {
        const sql = "SELECT id, name, face_encodings, created_at FROM people ORDER BY name";

        var stmt: ?*c.sqlite3_stmt = null;
        const result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        var people = std.ArrayList(Person).init(allocator);

        while (c.sqlite3_step(stmt) == c.SQLITE_ROW) {
            const id = c.sqlite3_column_int64(stmt, 0);
            const name_ptr = c.sqlite3_column_text(stmt, 1);
            const encodings_ptr = c.sqlite3_column_text(stmt, 2);
            const created_at = c.sqlite3_column_int64(stmt, 3);

            const name = std.mem.span(@as([*:0]const u8, @ptrCast(name_ptr)));
            const encodings = if (encodings_ptr != null)
                std.mem.span(@as([*:0]const u8, @ptrCast(encodings_ptr)))
            else
                null;

            const person = Person{
                .id = id,
                .name = try allocator.dupe(u8, name),
                .face_encodings = if (encodings) |e| try allocator.dupe(u8, e) else null,
                .created_at = created_at,
            };

            try people.append(person);
        }

        return people.toOwnedSlice();
    }

    pub fn updatePerson(self: *Self, person_id: i64, name: []const u8, face_encodings: ?[]const u8) !void {
        const sql = "UPDATE people SET name = ?, face_encodings = ? WHERE id = ?";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        _ = c.sqlite3_bind_text(stmt, 1, @ptrCast(name), @intCast(name.len), null);

        if (face_encodings) |encodings| {
            _ = c.sqlite3_bind_text(stmt, 2, @ptrCast(encodings), @intCast(encodings.len), null);
        } else {
            _ = c.sqlite3_bind_null(stmt, 2);
        }

        _ = c.sqlite3_bind_int64(stmt, 3, person_id);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.UpdateFailed;
        }
    }

    pub fn deletePerson(self: *Self, person_id: i64) !void {
        const sql = "DELETE FROM people WHERE id = ?";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        _ = c.sqlite3_bind_int64(stmt, 1, person_id);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.DeleteFailed;
        }
    }

    pub fn getPerson(self: *Self, allocator: std.mem.Allocator, person_id: i64) !?Person {
        const sql = "SELECT id, name, face_encodings, created_at FROM people WHERE id = ?";

        var stmt: ?*c.sqlite3_stmt = null;
        const result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        _ = c.sqlite3_bind_int64(stmt, 1, person_id);

        if (c.sqlite3_step(stmt) == c.SQLITE_ROW) {
            const id = c.sqlite3_column_int64(stmt, 0);
            const name_ptr = c.sqlite3_column_text(stmt, 1);
            const encodings_ptr = c.sqlite3_column_text(stmt, 2);
            const created_at = c.sqlite3_column_int64(stmt, 3);

            const name = std.mem.span(@as([*:0]const u8, @ptrCast(name_ptr)));
            const encodings = if (encodings_ptr != null)
                std.mem.span(@as([*:0]const u8, @ptrCast(encodings_ptr)))
            else
                null;

            return Person{
                .id = id,
                .name = try allocator.dupe(u8, name),
                .face_encodings = if (encodings) |e| try allocator.dupe(u8, e) else null,
                .created_at = created_at,
            };
        }

        return null;
    }

    pub fn tagPersonInPhoto(self: *Self, photo_id: i64, person_id: i64, confidence: f32, confirmed: bool) !i64 {
        const sql = "INSERT OR REPLACE INTO photo_people (photo_id, person_id, confidence, confirmed, created_at) VALUES (?, ?, ?, ?, ?)";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        const now = std.time.timestamp();

        _ = c.sqlite3_bind_int64(stmt, 1, photo_id);
        _ = c.sqlite3_bind_int64(stmt, 2, person_id);
        _ = c.sqlite3_bind_double(stmt, 3, confidence);
        _ = c.sqlite3_bind_int(stmt, 4, if (confirmed) 1 else 0);
        _ = c.sqlite3_bind_int64(stmt, 5, now);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.InsertFailed;
        }

        return c.sqlite3_last_insert_rowid(self.db);
    }

    pub fn untagPersonFromPhoto(self: *Self, photo_id: i64, person_id: i64) !void {
        const sql = "DELETE FROM photo_people WHERE photo_id = ? AND person_id = ?";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        _ = c.sqlite3_bind_int64(stmt, 1, photo_id);
        _ = c.sqlite3_bind_int64(stmt, 2, person_id);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.DeleteFailed;
        }
    }

    pub fn insertFaceTag(self: *Self, photo_filename: []const u8, person_id: ?i64, x: f64, y: f64, width: f64, height: f64, confidence: f64, is_manual: bool) !i64 {
        const sql = "INSERT INTO face_tags (photo_filename, person_id, x, y, width, height, confidence, is_manual, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        const now = std.time.timestamp();

        _ = c.sqlite3_bind_text(stmt, 1, @ptrCast(photo_filename), @intCast(photo_filename.len), null);

        if (person_id) |pid| {
            _ = c.sqlite3_bind_int64(stmt, 2, pid);
        } else {
            _ = c.sqlite3_bind_null(stmt, 2);
        }

        _ = c.sqlite3_bind_double(stmt, 3, x);
        _ = c.sqlite3_bind_double(stmt, 4, y);
        _ = c.sqlite3_bind_double(stmt, 5, width);
        _ = c.sqlite3_bind_double(stmt, 6, height);
        _ = c.sqlite3_bind_double(stmt, 7, confidence);
        _ = c.sqlite3_bind_int(stmt, 8, if (is_manual) 1 else 0);
        _ = c.sqlite3_bind_int64(stmt, 9, now);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.InsertFailed;
        }

        return c.sqlite3_last_insert_rowid(self.db);
    }

    pub fn getFaceTagsForPhoto(self: *Self, allocator: std.mem.Allocator, photo_filename: []const u8) ![]FaceTag {
        const sql = "SELECT id, photo_filename, person_id, x, y, width, height, confidence, is_manual, created_at FROM face_tags WHERE photo_filename = ? ORDER BY created_at";

        var stmt: ?*c.sqlite3_stmt = null;
        const result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        _ = c.sqlite3_bind_text(stmt, 1, @ptrCast(photo_filename), @intCast(photo_filename.len), null);

        var face_tags = std.ArrayList(FaceTag).init(allocator);

        while (c.sqlite3_step(stmt) == c.SQLITE_ROW) {
            const id = c.sqlite3_column_int64(stmt, 0);
            const filename_ptr = c.sqlite3_column_text(stmt, 1);
            const person_id = if (c.sqlite3_column_type(stmt, 2) == c.SQLITE_NULL) null else c.sqlite3_column_int64(stmt, 2);
            const x = c.sqlite3_column_double(stmt, 3);
            const y = c.sqlite3_column_double(stmt, 4);
            const width = c.sqlite3_column_double(stmt, 5);
            const height = c.sqlite3_column_double(stmt, 6);
            const confidence = c.sqlite3_column_double(stmt, 7);
            const is_manual = c.sqlite3_column_int(stmt, 8) != 0;
            const created_at = c.sqlite3_column_int64(stmt, 9);

            const filename = std.mem.span(@as([*:0]const u8, @ptrCast(filename_ptr)));

            const face_tag = FaceTag{
                .id = id,
                .photo_filename = try allocator.dupe(u8, filename),
                .person_id = person_id,
                .x = x,
                .y = y,
                .width = width,
                .height = height,
                .confidence = confidence,
                .is_manual = is_manual,
                .created_at = created_at,
            };

            try face_tags.append(face_tag);
        }

        return face_tags.toOwnedSlice();
    }

    pub fn updateFaceTag(self: *Self, face_tag_id: i64, person_id: ?i64, x: f64, y: f64, width: f64, height: f64, confidence: f64) !void {
        const sql = "UPDATE face_tags SET person_id = ?, x = ?, y = ?, width = ?, height = ?, confidence = ? WHERE id = ?";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        if (person_id) |pid| {
            _ = c.sqlite3_bind_int64(stmt, 1, pid);
        } else {
            _ = c.sqlite3_bind_null(stmt, 1);
        }

        _ = c.sqlite3_bind_double(stmt, 2, x);
        _ = c.sqlite3_bind_double(stmt, 3, y);
        _ = c.sqlite3_bind_double(stmt, 4, width);
        _ = c.sqlite3_bind_double(stmt, 5, height);
        _ = c.sqlite3_bind_double(stmt, 6, confidence);
        _ = c.sqlite3_bind_int64(stmt, 7, face_tag_id);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.UpdateFailed;
        }
    }

    pub fn deleteFaceTag(self: *Self, face_tag_id: i64) !void {
        const sql = "DELETE FROM face_tags WHERE id = ?";

        var stmt: ?*c.sqlite3_stmt = null;
        var result = c.sqlite3_prepare_v2(self.db, @ptrCast(sql), -1, &stmt, null);

        if (result != c.SQLITE_OK) {
            return error.PrepareStatementFailed;
        }
        defer _ = c.sqlite3_finalize(stmt);

        _ = c.sqlite3_bind_int64(stmt, 1, face_tag_id);

        result = c.sqlite3_step(stmt);
        if (result != c.SQLITE_DONE) {
            return error.DeleteFailed;
        }
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

pub const Person = struct {
    id: i64,
    name: []const u8,
    face_encodings: ?[]const u8,
    created_at: i64,
};

pub const PhotoPerson = struct {
    id: i64,
    photo_id: i64,
    person_id: i64,
    confidence: f32,
    confirmed: bool,
    created_at: i64,
};

pub const FaceTag = struct {
    id: i64,
    photo_filename: []const u8,
    person_id: ?i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    confidence: f64,
    is_manual: bool,
    created_at: i64,
};
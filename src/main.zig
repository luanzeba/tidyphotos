const std = @import("std");
const httpz = @import("httpz");
const print = std.debug.print;

// Import our modules
const Database = @import("models/database.zig").Database;
const ThumbnailGenerator = @import("thumbnails/thumbnail_generator.zig").ThumbnailGenerator;

// Global references for handlers
var global_database: ?*Database = null;
var global_thumbnail_generator: ?*ThumbnailGenerator = null;
var global_allocator: ?std.mem.Allocator = null;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    global_allocator = allocator;

    // Initialize database
    var database = try Database.init(allocator, "photos.db");
    defer database.deinit();
    global_database = &database;

    // Initialize thumbnail generator
    var thumbnail_gen = ThumbnailGenerator.init(allocator, "cache");
    global_thumbnail_generator = &thumbnail_gen;

    // Scan and index photo library on startup
    print("\n⚡ Scanning photo library...\n", .{});
    try scanAndIndexPhotos(allocator, &database, &thumbnail_gen);

    // Create a server with httpz
    var server = try httpz.Server(void).init(allocator, .{
        .port = 8080,
        .request = .{
            .max_body_size = 10 * 1024 * 1024, // 10MB max request body
        },
    }, {});
    defer server.deinit();

    // Set up routes
    var router = try server.router(.{});

    // Static file serving
    router.get("/", indexHandler);
    router.get("/js/*", staticHandler);
    router.get("/styles/*", staticHandler);

    // Optimized photo serving endpoints
    router.get("/api/thumbnails/:id", thumbnailHandler);
    router.get("/api/photos/:id/full", fullPhotoHandler);
    router.get("/photos/*", legacyPhotosHandler); // Legacy endpoint for compatibility

    // API routes
    router.get("/api/photos", getPhotosHandler);

    // Favorite routes
    router.put("/api/photos/:name/favorite", addFavoriteHandler);
    router.delete("/api/photos/:name/favorite", removeFavoriteHandler);

    // Face tag API routes
    router.get("/api/photos/:filename/face-tags", getFaceTagsHandler);
    router.post("/api/photos/:filename/face-tags", createFaceTagHandler);
    router.put("/api/face-tags/:id", updateFaceTagHandler);
    router.delete("/api/face-tags/:id", deleteFaceTagHandler);

    // People management routes
    router.get("/api/people", getPeopleHandler);
    router.post("/api/people", createPersonHandler);
    router.put("/api/people/:id", updatePersonHandler);
    router.delete("/api/people/:id", deletePersonHandler);

    // All other routes serve index.html for client-side routing
    router.all("*", indexHandler);

    print("\n✅ TidyPhotos server ready!\n", .{});
    print("  Local:   http://127.0.0.1:8080\n", .{});
    print("  Network: http://192.168.1.201:8080 (accessible from other devices)\n\n", .{});

    // Start the server
    try server.listen();
}

/// Scan photo directory and index all photos with thumbnails
fn scanAndIndexPhotos(allocator: std.mem.Allocator, db: *Database, thumb_gen: *ThumbnailGenerator) !void {
    var dir = std.fs.cwd().openDir("test_photos", .{ .iterate = true }) catch |err| {
        print("⚠️  Could not open test_photos directory: {}\n", .{err});
        return;
    };
    defer dir.close();

    var iterator = dir.iterate();
    var photo_count: usize = 0;
    var new_photos: usize = 0;
    var thumbnail_count: usize = 0;

    // Get existing photos from database
    var existing_photos_map = std.StringHashMap(i64).init(allocator);
    defer existing_photos_map.deinit();

    const existing_photos = try db.getPhotos(allocator);
    defer {
        for (existing_photos) |photo| {
            allocator.free(photo.path);
            allocator.free(photo.filename);
            if (photo.metadata_json) |meta| {
                allocator.free(meta);
            }
        }
        allocator.free(existing_photos);
    }

    for (existing_photos) |photo| {
        try existing_photos_map.put(photo.filename, photo.id);
    }

    while (try iterator.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!isImageFile(entry.name)) continue;

        photo_count += 1;

        // Check if photo is already in database
        const photo_id = if (existing_photos_map.get(entry.name)) |id| blk: {
            break :blk id;
        } else blk: {
            // New photo - add to database
            const full_path = try std.fmt.allocPrint(allocator, "test_photos/{s}", .{entry.name});
            defer allocator.free(full_path);

            const id = try db.insertPhoto(full_path, entry.name, null);
            new_photos += 1;
            print("  📷 Indexed: {s} (ID: {d})\n", .{ entry.name, id });
            break :blk id;
        };

        // Generate thumbnail if it doesn't exist
        if (!thumb_gen.thumbnailExists(photo_id)) {
            const photo_path = try std.fmt.allocPrint(allocator, "test_photos/{s}", .{entry.name});
            defer allocator.free(photo_path);

            const thumb_path = try thumb_gen.generateThumbnail(allocator, photo_id, photo_path);
            defer allocator.free(thumb_path);
            thumbnail_count += 1;
        }
    }

    print("\n📊 Library scan complete:\n", .{});
    print("  Total photos: {d}\n", .{photo_count});
    print("  New photos indexed: {d}\n", .{new_photos});
    print("  Thumbnails generated: {d}\n", .{thumbnail_count});
}

// Route handlers
fn indexHandler(req: *httpz.Request, res: *httpz.Response) !void {
    try serveFile(req, res, "public/index.html", "text/html");
}

fn staticHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const path = req.url.path;

    const file_path = try std.fmt.allocPrint(req.arena, "public{s}", .{path});

    const content_type = if (std.mem.endsWith(u8, path, ".js"))
        "application/javascript"
    else if (std.mem.endsWith(u8, path, ".css"))
        "text/css"
    else
        "text/plain";

    try serveFile(req, res, file_path, content_type);
}

/// Serve optimized WebP thumbnails with aggressive caching
fn thumbnailHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const photo_id_str = req.param("id") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing photo ID";
        return;
    };

    const photo_id = std.fmt.parseInt(i64, photo_id_str, 10) catch {
        res.status = 400;
        res.body = "Bad Request: Invalid photo ID";
        return;
    };

    const thumb_gen = global_thumbnail_generator orelse {
        res.status = 500;
        res.body = "Thumbnail generator not available";
        return;
    };

    // Get thumbnail path
    const thumb_path = try thumb_gen.getThumbnailPath(req.arena, photo_id);
    defer req.arena.free(thumb_path);

    // Serve thumbnail with aggressive caching (1 year)
    try serveFileWithCache(req, res, thumb_path, "image/webp", 31536000);
}

/// Serve full-size photos with caching
fn fullPhotoHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const photo_id_str = req.param("id") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing photo ID";
        return;
    };

    const photo_id = std.fmt.parseInt(i64, photo_id_str, 10) catch {
        res.status = 400;
        res.body = "Bad Request: Invalid photo ID";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    // Get photo path from database
    const photos = try db.getPhotos(req.arena);
    defer {
        for (photos) |photo| {
            req.arena.free(photo.path);
            req.arena.free(photo.filename);
            if (photo.metadata_json) |meta| {
                req.arena.free(meta);
            }
        }
        req.arena.free(photos);
    }

    for (photos) |photo| {
        if (photo.id == photo_id) {
            // Detect content type from filename
            const content_type = if (std.mem.endsWith(u8, photo.path, ".png"))
                "image/png"
            else if (std.mem.endsWith(u8, photo.path, ".heic") or std.mem.endsWith(u8, photo.path, ".HEIC"))
                "image/heic"
            else
                "image/jpeg";

            // Serve with moderate caching (1 day)
            try serveFileWithCache(req, res, photo.path, content_type, 86400);
            return;
        }
    }

    res.status = 404;
    res.body = "Photo not found";
}

/// Legacy endpoint for backward compatibility
fn legacyPhotosHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const path = req.url.path;

    // Remove "/photos/" prefix to get filename
    const photo_filename = path[8..];
    const photo_path = try std.fmt.allocPrint(req.arena, "test_photos/{s}", .{photo_filename});

    try serveFile(req, res, photo_path, "image/jpeg");
}

fn getPhotosHandler(_: *httpz.Request, res: *httpz.Response) !void {
    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    // Get photos from database (already indexed on startup)
    const db_photos = try db.getPhotos(res.arena);
    defer {
        for (db_photos) |photo| {
            res.arena.free(photo.path);
            res.arena.free(photo.filename);
            if (photo.metadata_json) |meta| {
                res.arena.free(meta);
            }
        }
        res.arena.free(db_photos);
    }

    var photos = std.ArrayList(std.json.Value).init(res.arena);

    for (db_photos) |db_photo| {
        var photo = std.json.ObjectMap.init(res.arena);

        try photo.put("id", .{ .integer = db_photo.id });
        try photo.put("name", .{ .string = try res.arena.dupe(u8, db_photo.filename) });

        // Use optimized thumbnail endpoint
        const thumbnail_url = try std.fmt.allocPrint(res.arena, "/api/thumbnails/{d}", .{db_photo.id});
        try photo.put("thumbnail", .{ .string = thumbnail_url });

        // Use imported_at as date (convert to ISO 8601)
        const date_str = try std.fmt.allocPrint(res.arena, "{d}", .{db_photo.imported_at});
        try photo.put("date", .{ .string = date_str });

        // Check if photo is favorited via symlink (fast)
        const is_favorite = isPhotoFavorited(db_photo.filename) catch false;
        try photo.put("favorite", .{ .bool = is_favorite });

        // Add full image URL for preloading
        const full_url = try std.fmt.allocPrint(res.arena, "/api/photos/{d}/full", .{db_photo.id});
        try photo.put("fullUrl", .{ .string = full_url });

        try photo.put("size", .{ .integer = 0 });

        try photos.append(.{ .object = photo });
    }

    res.status = 200;
    try res.json(.{ .photos = photos.items }, .{});
}

// Helper function to check if file is a supported image format
fn isImageFile(filename: []const u8) bool {
    const extensions = [_][]const u8{ ".jpg", ".jpeg", ".png", ".heic", ".JPG", ".JPEG", ".PNG", ".HEIC" };
    for (extensions) |ext| {
        if (std.mem.endsWith(u8, filename, ext)) {
            return true;
        }
    }
    return false;
}

// Symlink-based favorites management
fn isPhotoFavorited(photo_name: []const u8) !bool {
    var favorites_path_buf: [512]u8 = undefined;
    const favorites_path = try std.fmt.bufPrint(favorites_path_buf[0..], "test_photos/favorites/{s}", .{photo_name});

    // Check if symlink exists
    std.fs.cwd().access(favorites_path, .{}) catch |err| switch (err) {
        error.FileNotFound => return false,
        else => return err,
    };
    return true;
}

fn addPhotoToFavorites(photo_name: []const u8) !void {
    // Ensure favorites directory exists
    std.fs.cwd().makeDir("test_photos/favorites") catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    // Create symlink: favorites/photo.jpg -> ../photo.jpg
    var source_path_buf: [512]u8 = undefined;
    const source_path = try std.fmt.bufPrint(source_path_buf[0..], "../{s}", .{photo_name});

    var target_path_buf: [512]u8 = undefined;
    const target_path = try std.fmt.bufPrint(target_path_buf[0..], "test_photos/favorites/{s}", .{photo_name});

    // Remove existing symlink if it exists
    std.fs.cwd().deleteFile(target_path) catch |err| switch (err) {
        error.FileNotFound => {},
        else => return err,
    };

    // Create new symlink
    try std.fs.cwd().symLink(source_path, target_path, .{});
    print("⭐ Added '{s}' to favorites\n", .{photo_name});
}

fn removePhotoFromFavorites(photo_name: []const u8) !void {
    var target_path_buf: [512]u8 = undefined;
    const target_path = try std.fmt.bufPrint(target_path_buf[0..], "test_photos/favorites/{s}", .{photo_name});

    std.fs.cwd().deleteFile(target_path) catch |err| switch (err) {
        error.FileNotFound => {}, // Already not favorited
        else => return err,
    };
    print("💔 Removed '{s}' from favorites\n", .{photo_name});
}

fn addFavoriteHandler(req: *httpz.Request, res: *httpz.Response) !void {
    print("🔍 DEBUG: Entered addFavoriteHandler\n", .{});

    // Extract photo name from URL path: /api/photos/:name/favorite
    const photo_name = req.param("name") orelse {
        print("🔍 DEBUG: Missing photo name parameter\n", .{});
        res.status = 400;
        res.body = "Bad Request: Missing photo name";
        return;
    };

    print("🔍 DEBUG: Photo name: {s}\n", .{photo_name});

    // Add to favorites
    print("🔍 DEBUG: Calling addPhotoToFavorites\n", .{});
    addPhotoToFavorites(photo_name) catch |err| {
        print("🔍 DEBUG: addPhotoToFavorites failed with error: {}\n", .{err});
        res.status = 500;
        res.body = "Internal Server Error";
        return;
    };

    print("🔍 DEBUG: Successfully added to favorites, sending JSON response\n", .{});

    res.status = 200;
    try res.json(.{ .success = true, .favorite = true, .photo = photo_name }, .{});

    print("🔍 DEBUG: Completed addFavoriteHandler\n", .{});
}

fn removeFavoriteHandler(req: *httpz.Request, res: *httpz.Response) !void {
    print("🔍 DEBUG: Entered removeFavoriteHandler\n", .{});

    // Extract photo name from URL path: /api/photos/:name/favorite
    const photo_name = req.param("name") orelse {
        print("🔍 DEBUG: Missing photo name parameter\n", .{});
        res.status = 400;
        res.body = "Bad Request: Missing photo name";
        return;
    };

    print("🔍 DEBUG: Photo name: {s}\n", .{photo_name});

    // Remove from favorites
    print("🔍 DEBUG: Calling removePhotoFromFavorites\n", .{});
    removePhotoFromFavorites(photo_name) catch |err| {
        print("🔍 DEBUG: removePhotoFromFavorites failed with error: {}\n", .{err});
        res.status = 500;
        res.body = "Internal Server Error";
        return;
    };

    print("🔍 DEBUG: Successfully removed from favorites, sending JSON response\n", .{});

    res.status = 200;
    try res.json(.{ .success = true, .favorite = false, .photo = photo_name }, .{});

    print("🔍 DEBUG: Completed removeFavoriteHandler\n", .{});
}

fn getPeopleHandler(req: *httpz.Request, res: *httpz.Response) !void {
    _ = req;

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    const people = db.getPeople(res.arena) catch |err| {
        print("❌ Error getting people: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to get people";
        return;
    };

    // Convert to JSON format expected by frontend
    var json_people = std.ArrayList(std.json.Value).init(res.arena);
    for (people) |person| {
        try json_people.append(.{
            .object = std.json.ObjectMap.init(res.arena),
        });
        const obj = &json_people.items[json_people.items.len - 1].object;
        try obj.put("id", .{ .integer = person.id });
        try obj.put("name", .{ .string = person.name });
        try obj.put("photoCount", .{ .integer = 0 }); // TODO: Calculate actual photo count
    }

    res.status = 200;
    try res.json(.{ .people = json_people.items }, .{});
}

fn createPersonHandler(req: *httpz.Request, res: *httpz.Response) !void {
    // Parse JSON body
    const body_result = try req.json(struct { name: []const u8 });
    const body = body_result orelse {
        res.status = 400;
        res.body = "Bad Request";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    // Create person in database
    const person_id = db.insertPerson(body.name, null) catch |err| {
        print("❌ Error creating person: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to create person";
        return;
    };

    print("✅ Created person: {s} with ID: {}\n", .{ body.name, person_id });

    res.status = 201;
    try res.json(.{ .person = .{ .id = person_id, .name = body.name, .photoCount = 0 } }, .{});
}

fn updatePersonHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const person_id_str = req.param("id") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing person ID";
        return;
    };

    const person_id = std.fmt.parseInt(i64, person_id_str, 10) catch {
        res.status = 400;
        res.body = "Bad Request: Invalid person ID";
        return;
    };

    const body_result = try req.json(struct { name: []const u8 });
    const body = body_result orelse {
        res.status = 400;
        res.body = "Bad Request";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    db.updatePerson(person_id, body.name, null) catch |err| {
        print("❌ Error updating person: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to update person";
        return;
    };

    print("✅ Updated person ID {}: {s}\n", .{ person_id, body.name });

    res.status = 200;
    try res.json(.{ .person = .{ .id = person_id, .name = body.name, .photoCount = 0 } }, .{});
}

fn deletePersonHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const person_id_str = req.param("id") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing person ID";
        return;
    };

    const person_id = std.fmt.parseInt(i64, person_id_str, 10) catch {
        res.status = 400;
        res.body = "Bad Request: Invalid person ID";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    db.deletePerson(person_id) catch |err| {
        print("❌ Error deleting person: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to delete person";
        return;
    };

    print("✅ Deleted person ID: {}\n", .{person_id});

    res.status = 200;
    try res.json(.{ .success = true }, .{});
}

fn getFaceTagsHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const photo_filename = req.param("filename") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing photo filename";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    const face_tags = db.getFaceTagsForPhoto(res.arena, photo_filename) catch |err| {
        print("❌ Error getting face tags: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to get face tags";
        return;
    };

    // Convert to JSON format expected by frontend
    var json_tags = std.ArrayList(std.json.Value).init(res.arena);
    for (face_tags) |tag| {
        var obj = std.json.ObjectMap.init(res.arena);
        try obj.put("id", .{ .integer = tag.id });
        try obj.put("x", .{ .float = tag.x });
        try obj.put("y", .{ .float = tag.y });
        try obj.put("width", .{ .float = tag.width });
        try obj.put("height", .{ .float = tag.height });
        try obj.put("confidence", .{ .float = tag.confidence });
        try obj.put("isManual", .{ .bool = tag.is_manual });
        try obj.put("createdAt", .{ .integer = tag.created_at });

        if (tag.person_id) |pid| {
            try obj.put("personId", .{ .integer = pid });
            // Look up person name from people table
            const person = db.getPerson(res.arena, pid) catch null;
            const person_name = if (person) |p| p.name else "";
            try obj.put("personName", .{ .string = person_name });
        } else {
            try obj.put("personId", .null);
            try obj.put("personName", .{ .string = "" });
        }

        try json_tags.append(.{ .object = obj });
    }

    res.status = 200;
    try res.json(.{ .faceTags = json_tags.items }, .{});
}

fn createFaceTagHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const photo_filename = req.param("filename") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing photo filename";
        return;
    };

    const body_result = try req.json(struct { x: f64, y: f64, width: f64, height: f64, personId: ?i64, confidence: ?f64, isManual: ?bool });
    const body = body_result orelse {
        res.status = 400;
        res.body = "Bad Request";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    const confidence = body.confidence orelse 1.0;
    const is_manual = body.isManual orelse true;

    const face_tag_id = db.insertFaceTag(photo_filename, body.personId, body.x, body.y, body.width, body.height, confidence, is_manual) catch |err| {
        print("❌ Error creating face tag: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to create face tag";
        return;
    };

    print("✅ Created face tag for {s} with ID: {}\n", .{ photo_filename, face_tag_id });

    res.status = 201;
    try res.json(.{ .faceTag = .{ .id = face_tag_id, .x = body.x, .y = body.y, .width = body.width, .height = body.height, .personId = body.personId, .confidence = confidence, .isManual = is_manual } }, .{});
}

fn updateFaceTagHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const face_tag_id_str = req.param("id") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing face tag ID";
        return;
    };

    const face_tag_id = std.fmt.parseInt(i64, face_tag_id_str, 10) catch {
        res.status = 400;
        res.body = "Bad Request: Invalid face tag ID";
        return;
    };

    const body_result = try req.json(struct { x: f64, y: f64, width: f64, height: f64, personId: ?i64, confidence: ?f64 });
    const body = body_result orelse {
        res.status = 400;
        res.body = "Bad Request";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    const confidence = body.confidence orelse 1.0;

    db.updateFaceTag(face_tag_id, body.personId, body.x, body.y, body.width, body.height, confidence) catch |err| {
        print("❌ Error updating face tag: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to update face tag";
        return;
    };

    print("✅ Updated face tag ID {}\n", .{face_tag_id});

    res.status = 200;
    try res.json(.{ .faceTag = .{ .id = face_tag_id, .x = body.x, .y = body.y, .width = body.width, .height = body.height, .personId = body.personId, .confidence = confidence } }, .{});
}

fn deleteFaceTagHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const face_tag_id_str = req.param("id") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing face tag ID";
        return;
    };

    const face_tag_id = std.fmt.parseInt(i64, face_tag_id_str, 10) catch {
        res.status = 400;
        res.body = "Bad Request: Invalid face tag ID";
        return;
    };

    const db = global_database orelse {
        res.status = 500;
        res.body = "Database not available";
        return;
    };

    db.deleteFaceTag(face_tag_id) catch |err| {
        print("❌ Error deleting face tag: {}\n", .{err});
        res.status = 500;
        res.body = "Failed to delete face tag";
        return;
    };

    print("✅ Deleted face tag ID: {}\n", .{face_tag_id});

    res.status = 200;
    try res.json(.{ .success = true }, .{});
}

// Helper function to serve static files with HTTP caching
fn serveFileWithCache(req: *httpz.Request, res: *httpz.Response, path: []const u8, content_type: []const u8, max_age_seconds: u32) !void {
    _ = req;

    const file = std.fs.cwd().openFile(path, .{}) catch {
        res.status = 404;
        res.body = "Not Found";
        return;
    };
    defer file.close();

    const file_size = try file.getEndPos();
    const content = try file.readToEndAlloc(res.arena, file_size);

    // Set aggressive caching headers
    res.header("content-type", content_type);
    const cache_control = try std.fmt.allocPrint(res.arena, "public, max-age={d}, immutable", .{max_age_seconds});
    res.header("cache-control", cache_control);

    // Add ETag for cache validation
    const stat = try file.stat();
    const etag = try std.fmt.allocPrint(res.arena, "\"{d}-{d}\"", .{ stat.mtime, stat.size });
    res.header("etag", etag);

    res.body = content;
}

// Helper function to serve static files (no caching)
fn serveFile(req: *httpz.Request, res: *httpz.Response, path: []const u8, content_type: []const u8) !void {
    _ = req;

    const file = std.fs.cwd().openFile(path, .{}) catch {
        res.status = 404;
        res.body = "Not Found";
        return;
    };
    defer file.close();

    const file_size = try file.getEndPos();
    const content = try file.readToEndAlloc(res.arena, file_size);

    res.header("content-type", content_type);
    res.body = content;
}

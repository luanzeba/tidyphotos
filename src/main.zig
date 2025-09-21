const std = @import("std");
const httpz = @import("httpz");
const print = std.debug.print;

// Import our database module
const Database = @import("models/database.zig").Database;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Initialize database
    var database = try Database.init(allocator, "photos.db");
    defer database.deinit();

    // Create a server with httpz
    var server = try httpz.Server().init(allocator, .{ .port = 8080 });
    defer server.deinit();

    // Set up routes
    var router = server.router();

    // Static file serving
    router.get("/", indexHandler);
    router.get("/js/*", staticHandler);
    router.get("/styles/*", staticHandler);
    router.get("/photos/*", photosHandler);

    // API routes
    router.get("/api/photos", getPhotosHandler);
    router.put("/api/photos/:name/favorite", addFavoriteHandler);
    router.delete("/api/photos/:name/favorite", removeFavoriteHandler);
    router.get("/api/people", getPeopleHandler);
    router.post("/api/people", createPersonHandler);
    router.put("/api/people/:id", updatePersonHandler);
    router.delete("/api/people/:id", deletePersonHandler);

    // All other routes serve index.html for client-side routing
    router.all("*", indexHandler);

    print("TidyPhotos server listening on:\n", .{});
    print("  Local:   http://127.0.0.1:8080\n", .{});
    print("  Network: http://192.168.1.201:8080 (accessible from other devices)\n", .{});

    // Start the server
    try server.listen();
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

fn photosHandler(req: *httpz.Request, res: *httpz.Response) !void {
    const path = req.url.path;

    // Remove "/photos/" prefix to get filename
    const photo_filename = path[8..];
    const photo_path = try std.fmt.allocPrint(req.arena, "test_photos/{s}", .{photo_filename});

    try serveFile(req, res, photo_path, "image/jpeg");
}

fn getPhotosHandler(req: *httpz.Request, res: *httpz.Response) !void {
    _ = req;

    // Discover photos on-demand
    var photos = std.ArrayList(std.json.Value).init(res.arena);

    // Scan test_photos directory
    var dir = std.fs.cwd().openDir("test_photos", .{ .iterate = true }) catch {
        res.status = 200;
        try res.json(.{ .photos = photos.items }, .{});
        return;
    };
    defer dir.close();

    var iterator = dir.iterate();
    var count: usize = 0;

    while (try iterator.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!isImageFile(entry.name)) continue;

        count += 1;

        // Create photo object
        var photo = std.json.ObjectMap.init(res.arena);
        try photo.put("id", .{ .integer = @intCast(count) });
        try photo.put("name", .{ .string = try res.arena.dupe(u8, entry.name) });

        const thumbnail_path = try std.fmt.allocPrint(res.arena, "/photos/{s}", .{entry.name});
        try photo.put("thumbnail", .{ .string = thumbnail_path });

        // Extract real photo date from EXIF metadata
        const photo_path = try std.fmt.allocPrint(res.arena, "test_photos/{s}", .{entry.name});
        const photo_date = extractPhotoDate(res.arena, photo_path) catch "2024-01-01T12:00:00Z";

        try photo.put("date", .{ .string = photo_date });
        // Check if photo is favorited (symlink exists)
        const is_favorite = isPhotoFavorited(entry.name) catch false;
        try photo.put("favorite", .{ .bool = is_favorite });

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

// Extract photo date from EXIF metadata using exiftool
fn extractPhotoDate(allocator: std.mem.Allocator, photo_path: []const u8) ![]const u8 {
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const arena_allocator = arena.allocator();

    // Prepare exiftool command
    const cmd = [_][]const u8{ "exiftool", "-DateTimeOriginal", "-CreateDate", "-json", photo_path };

    // Execute exiftool
    var result = std.process.Child.run(.{
        .allocator = arena_allocator,
        .argv = &cmd,
    }) catch |err| {
        print("⚠️ Failed to run exiftool for {s}: {}\n", .{photo_path, err});
        return allocator.dupe(u8, "2024-05-22T12:00:00Z"); // Fallback to hardcoded date
    };

    if (result.term != .Exited or result.term.Exited != 0) {
        print("⚠️ exiftool failed for {s}\n", .{photo_path});
        return allocator.dupe(u8, "2024-05-22T12:00:00Z"); // Fallback to hardcoded date
    }

    // Parse JSON response to find DateTimeOriginal
    if (std.mem.indexOf(u8, result.stdout, "\"DateTimeOriginal\"")) |start_idx| {
        // Find the colon and first quote after it: "DateTimeOriginal": "2025:05:22 11:12:29"
        if (std.mem.indexOf(u8, result.stdout[start_idx..], ":")) |colon_idx| {
            const after_colon = start_idx + colon_idx + 1;
            if (std.mem.indexOf(u8, result.stdout[after_colon..], "\"")) |quote1| {
                const value_start = after_colon + quote1 + 1;
                if (std.mem.indexOf(u8, result.stdout[value_start..], "\"")) |quote2| {
                    const date_str = result.stdout[value_start..value_start + quote2];
                    // Convert "2025:05:22 11:12:29" to "2025-05-22T11:12:29Z"
                    if (date_str.len >= 19) {
                        const iso_date = try std.fmt.allocPrint(allocator, "{s}-{s}-{s}T{s}Z", .{
                            date_str[0..4],  // year
                            date_str[5..7],  // month
                            date_str[8..10], // day
                            date_str[11..19] // time
                        });
                        print("📅 Extracted date for {s}: {s}\n", .{photo_path, iso_date});
                        return iso_date;
                    }
                }
            }
        }
    }

    print("⚠️ No DateTimeOriginal found for {s}, using fallback\n", .{photo_path});
    return allocator.dupe(u8, "2024-05-22T12:00:00Z"); // Fallback to hardcoded date
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
    // Extract photo name from URL path: /api/photos/:name/favorite
    const photo_name = req.param("name") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing photo name";
        return;
    };

    // Add to favorites
    addPhotoToFavorites(photo_name) catch {
        res.status = 500;
        res.body = "Internal Server Error";
        return;
    };

    res.status = 200;
    try res.json(.{
        .success = true,
        .favorite = true,
        .photo = photo_name
    }, .{});
}

fn removeFavoriteHandler(req: *httpz.Request, res: *httpz.Response) !void {
    // Extract photo name from URL path: /api/photos/:name/favorite
    const photo_name = req.param("name") orelse {
        res.status = 400;
        res.body = "Bad Request: Missing photo name";
        return;
    };

    // Remove from favorites
    removePhotoFromFavorites(photo_name) catch {
        res.status = 500;
        res.body = "Internal Server Error";
        return;
    };

    res.status = 200;
    try res.json(.{
        .success = true,
        .favorite = false,
        .photo = photo_name
    }, .{});
}

fn getPeopleHandler(req: *httpz.Request, res: *httpz.Response) !void {
    _ = req;
    // TODO: Get people from database
    res.status = 200;
    try res.json(.{ .people = .{} }, .{});
}

fn createPersonHandler(req: *httpz.Request, res: *httpz.Response) !void {
    // Parse JSON body
    const body_result = try req.json(struct { name: []const u8 });
    const body = body_result orelse {
        res.status = 400;
        res.body = "Bad Request";
        return;
    };

    // TODO: Create person in database
    print("✅ Creating person: {s}\n", .{body.name});

    res.status = 201;
    try res.json(.{
        .person = .{
            .id = 1,
            .name = body.name,
            .photo_count = 0
        }
    }, .{});
}

fn updatePersonHandler(req: *httpz.Request, res: *httpz.Response) !void {
    _ = req;
    // TODO: Implement person update
    res.status = 200;
    try res.json(.{ .success = true }, .{});
}

fn deletePersonHandler(req: *httpz.Request, res: *httpz.Response) !void {
    _ = req;
    // TODO: Implement person deletion
    res.status = 200;
    try res.json(.{ .success = true }, .{});
}

// Helper function to serve static files
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
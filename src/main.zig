const std = @import("std");
const net = std.net;
const print = std.debug.print;
const PhotoImporter = @import("import/photo_importer.zig").PhotoImporter;
const PhotoInfo = @import("import/photo_importer.zig").PhotoInfo;
const ThumbnailGenerator = @import("thumbnails/thumbnail_generator.zig").ThumbnailGenerator;
const Database = @import("models/database.zig").Database;
const Person = @import("models/database.zig").Person;

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

const Server = struct {
    allocator: std.mem.Allocator,
    photo_importer: PhotoImporter,
    thumbnail_generator: ThumbnailGenerator,
    photos_dir: []const u8,
    database: Database,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) !Self {
        // Initialize in test mode for now
        const photo_importer = PhotoImporter.init(allocator, "photos", true);
        const thumbnail_generator = ThumbnailGenerator.init(allocator, "thumbnails");
        const photos_dir = "test_photos";

        // Initialize database
        const database = try Database.init(allocator, "tidyphotos.db");

        // Ensure people directory exists
        var people_dir_path_buf: [512]u8 = undefined;
        const people_dir_path = try std.fmt.bufPrint(people_dir_path_buf[0..], "{s}/people", .{photos_dir});
        std.fs.cwd().makeDir(people_dir_path) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };

        print("TidyPhotos: Ready to serve photos from {s}/ (on-demand discovery)\n", .{photos_dir});

        return Self{
            .allocator = allocator,
            .photo_importer = photo_importer,
            .thumbnail_generator = thumbnail_generator,
            .photos_dir = photos_dir,
            .database = database,
        };
    }

    pub fn listen(self: *Self, address: net.Address) !void {
        const socket = try std.posix.socket(std.posix.AF.INET, std.posix.SOCK.STREAM, 0);
        defer std.posix.close(socket);
        
        try std.posix.setsockopt(socket, std.posix.SOL.SOCKET, std.posix.SO.REUSEADDR, &std.mem.toBytes(@as(c_int, 1)));
        try std.posix.bind(socket, &address.any, address.getOsSockLen());
        try std.posix.listen(socket, 128);
        
        print("TidyPhotos server listening on:\n", .{});
        print("  Local:   http://127.0.0.1:8080\n", .{});
        print("  Network: http://192.168.1.201:8080 (accessible from other devices)\n", .{});

        while (true) {
            var client_addr: net.Address = undefined;
            var client_addr_len: std.posix.socklen_t = @sizeOf(net.Address);
            
            const client_socket = std.posix.accept(socket, &client_addr.any, &client_addr_len, 0) catch |err| {
                print("Failed to accept connection: {}\n", .{err});
                continue;
            };
            
            // Handle each connection in a simple blocking way for now
            self.handleConnection(client_socket) catch |err| {
                print("Error handling connection: {}\n", .{err});
            };
            std.posix.close(client_socket);
        }
    }

    fn handleConnection(self: *Self, socket: std.posix.fd_t) !void {
        var buf: [4096]u8 = undefined;
        const bytes_read = try std.posix.read(socket, &buf);
        
        if (bytes_read == 0) return;
        
        const request = buf[0..bytes_read];
        try self.handleRequest(socket, request);
    }

    fn handleRequest(self: *Self, socket: std.posix.fd_t, request_data: []const u8) !void {
        // Parse HTTP request line
        var lines = std.mem.split(u8, request_data, "\r\n");
        const first_line = lines.next() orelse return;
        
        var parts = std.mem.split(u8, first_line, " ");
        const method = parts.next() orelse return;
        const path = parts.next() orelse return;
        
        print("Request: {s} {s}\n", .{ method, path });

        const is_head_request = std.mem.eql(u8, method, "HEAD");

        if (std.mem.eql(u8, path, "/")) {
            try self.serveFile(socket, "public/index.html", "text/html", is_head_request);
        } else if (std.mem.startsWith(u8, path, "/js/")) {
            const file_path = try std.fmt.allocPrint(self.allocator, "public{s}", .{path});
            defer self.allocator.free(file_path);
            try self.serveFile(socket, file_path, "application/javascript", is_head_request);
        } else if (std.mem.startsWith(u8, path, "/styles/")) {
            const file_path = try std.fmt.allocPrint(self.allocator, "public{s}", .{path});
            defer self.allocator.free(file_path);
            try self.serveFile(socket, file_path, "text/css", is_head_request);
        } else if (std.mem.startsWith(u8, path, "/api/")) {
            try self.handleApi(socket, method, path);
        } else if (std.mem.startsWith(u8, path, "/photos/")) {
            // Serve photos from test_photos directory  
            const photo_filename = path[8..]; // Remove "/photos/" prefix
            const photo_path = try std.fmt.allocPrint(self.allocator, "test_photos/{s}", .{photo_filename});
            defer self.allocator.free(photo_path);
            try self.serveFile(socket, photo_path, "image/jpeg", is_head_request);
        } else {
            // For all other routes (like /gallery/all/photo/1), serve index.html for client-side routing
            try self.serveFile(socket, "public/index.html", "text/html", is_head_request);
        }
    }

    fn serveFile(self: *Self, socket: std.posix.fd_t, path: []const u8, content_type: []const u8, is_head_request: bool) !void {        
        const file = std.fs.cwd().openFile(path, .{}) catch {
            try self.send404(socket);
            return;
        };
        defer file.close();

        const file_size = try file.getEndPos();

        // Send HTTP headers
        var response_buffer: [1024]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..], 
            "HTTP/1.1 200 OK\r\nContent-Type: {s}\r\nContent-Length: {}\r\n\r\n", 
            .{ content_type, file_size });
        _ = try std.posix.write(socket, response);

        // For HEAD requests, only send headers, not the body
        if (is_head_request) {
            return;
        }

        // Stream file in chunks to handle large files
        var buffer: [8192]u8 = undefined; // 8KB chunks
        while (true) {
            const bytes_read = try file.read(&buffer);
            if (bytes_read == 0) break;
            
            var bytes_written: usize = 0;
            while (bytes_written < bytes_read) {
                const chunk_written = std.posix.write(socket, buffer[bytes_written..bytes_read]) catch |err| {
                    print("Error writing chunk: {}\n", .{err});
                    return err;
                };
                bytes_written += chunk_written;
            }
        }
    }

    fn handleApi(self: *Self, socket: std.posix.fd_t, method: []const u8, path: []const u8) !void {
        if (std.mem.eql(u8, path, "/api/photos")) {
            if (std.mem.eql(u8, method, "GET")) {
                // Discover photos on-demand with pagination (default: first 20)
                const json_response = try self.discoverPhotosJson(0, 20);
                defer self.allocator.free(json_response);

                var response_buffer: [1024]u8 = undefined;
                const response = try std.fmt.bufPrint(response_buffer[0..],
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
                    .{json_response.len});
                _ = try std.posix.write(socket, response);
                _ = try std.posix.write(socket, json_response);
            } else {
                try self.sendMethodNotAllowed(socket);
            }
        } else if (std.mem.startsWith(u8, path, "/api/photos/") and std.mem.endsWith(u8, path, "/favorite")) {
            // Extract photo name: /api/photos/{photo_name}/favorite
            const prefix_len = "/api/photos/".len;
            const suffix_len = "/favorite".len;
            if (path.len > prefix_len + suffix_len) {
                const photo_name = path[prefix_len..path.len - suffix_len];

                if (std.mem.eql(u8, method, "PUT")) {
                    // Add to favorites
                    self.addPhotoToFavorites(photo_name) catch |err| {
                        print("❌ Failed to add '{s}' to favorites: {}\n", .{ photo_name, err });
                        try self.sendInternalServerError(socket);
                        return;
                    };
                    try self.sendSuccessResponse(socket, "Photo added to favorites");
                } else if (std.mem.eql(u8, method, "DELETE")) {
                    // Remove from favorites
                    self.removePhotoFromFavorites(photo_name) catch |err| {
                        print("❌ Failed to remove '{s}' from favorites: {}\n", .{ photo_name, err });
                        try self.sendInternalServerError(socket);
                        return;
                    };
                    try self.sendSuccessResponse(socket, "Photo removed from favorites");
                } else {
                    try self.sendMethodNotAllowed(socket);
                }
            } else {
                try self.send404(socket);
            }
        } else if (std.mem.eql(u8, path, "/api/people")) {
            if (std.mem.eql(u8, method, "GET")) {
                try self.handleGetPeople(socket);
            } else if (std.mem.eql(u8, method, "POST")) {
                try self.handleCreatePerson(socket);
            } else {
                try self.sendMethodNotAllowed(socket);
            }
        } else if (std.mem.startsWith(u8, path, "/api/people/")) {
            // Extract person ID: /api/people/{id}
            const prefix_len = "/api/people/".len;
            if (path.len > prefix_len) {
                const person_part = path[prefix_len..];

                // Check if it ends with a sub-path
                if (std.mem.indexOf(u8, person_part, "/")) |slash_idx| {
                    const person_id_str = person_part[0..slash_idx];
                    const sub_path = person_part[slash_idx..];

                    const person_id = std.fmt.parseInt(i64, person_id_str, 10) catch {
                        try self.send404(socket);
                        return;
                    };

                    if (std.mem.startsWith(u8, sub_path, "/photos/")) {
                        // Extract photo ID: /api/people/{person_id}/photos/{photo_id}
                        const photo_prefix_len = "/photos/".len;
                        if (sub_path.len > photo_prefix_len) {
                            const photo_id_str = sub_path[photo_prefix_len..];
                            const photo_id = std.fmt.parseInt(i64, photo_id_str, 10) catch {
                                try self.send404(socket);
                                return;
                            };

                            if (std.mem.eql(u8, method, "POST")) {
                                try self.handleTagPersonInPhoto(socket, person_id, photo_id);
                            } else if (std.mem.eql(u8, method, "DELETE")) {
                                try self.handleUntagPersonFromPhoto(socket, person_id, photo_id);
                            } else {
                                try self.sendMethodNotAllowed(socket);
                            }
                        } else {
                            try self.send404(socket);
                        }
                    } else {
                        try self.send404(socket);
                    }
                } else {
                    // Single person operations: /api/people/{id}
                    const person_id = std.fmt.parseInt(i64, person_part, 10) catch {
                        try self.send404(socket);
                        return;
                    };

                    if (std.mem.eql(u8, method, "PUT")) {
                        try self.handleUpdatePerson(socket, person_id);
                    } else if (std.mem.eql(u8, method, "DELETE")) {
                        try self.handleDeletePerson(socket, person_id);
                    } else {
                        try self.sendMethodNotAllowed(socket);
                    }
                }
            } else {
                try self.send404(socket);
            }
        } else if (std.mem.startsWith(u8, path, "/api/photos/") and std.mem.endsWith(u8, path, "/detect-faces")) {
            // Extract photo name: /api/photos/{photo_name}/detect-faces
            const prefix_len = "/api/photos/".len;
            const suffix_len = "/detect-faces".len;
            if (path.len > prefix_len + suffix_len) {
                const photo_name = path[prefix_len..path.len - suffix_len];

                if (std.mem.eql(u8, method, "POST")) {
                    try self.handleDetectFaces(socket, photo_name);
                } else {
                    try self.sendMethodNotAllowed(socket);
                }
            } else {
                try self.send404(socket);
            }
        } else if (std.mem.startsWith(u8, path, "/api/photos/") and std.mem.endsWith(u8, path, "/match-faces")) {
            // Extract photo name: /api/photos/{photo_name}/match-faces
            const prefix_len = "/api/photos/".len;
            const suffix_len = "/match-faces".len;
            if (path.len > prefix_len + suffix_len) {
                const photo_name = path[prefix_len..path.len - suffix_len];

                if (std.mem.eql(u8, method, "POST")) {
                    try self.handleMatchFaces(socket, photo_name);
                } else {
                    try self.sendMethodNotAllowed(socket);
                }
            } else {
                try self.send404(socket);
            }
        } else {
            try self.send404(socket);
        }
    }

    fn discoverPhotosJson(self: *Self, offset: usize, limit: usize) ![]const u8 {
        var json = std.ArrayList(u8).init(self.allocator);
        try json.append('[');
        
        // Scan directory on-demand (no memory storage!)
        var dir = std.fs.cwd().openDir(self.photos_dir, .{ .iterate = true }) catch {
            try json.append(']');
            return json.toOwnedSlice();
        };
        defer dir.close();
        
        var iterator = dir.iterate();
        var count: usize = 0;
        var found: usize = 0;
        
        while (try iterator.next()) |entry| {
            if (entry.kind != .file) continue;
            if (!isImageFile(entry.name)) continue;
            
            // Skip photos before offset
            if (count < offset) {
                count += 1;
                continue;
            }
            
            // Stop if we've reached the limit
            if (found >= limit) break;
            
            if (found > 0) try json.append(',');
            
            // Check if photo is favorited (symlink exists)
            const is_favorite = self.isPhotoFavorited(entry.name) catch false;

            // Extract real photo date from EXIF metadata
            var photo_path_buf: [512]u8 = undefined;
            const photo_path = try std.fmt.bufPrint(photo_path_buf[0..], "{s}/{s}", .{ self.photos_dir, entry.name });
            const photo_date = try extractPhotoDate(self.allocator, photo_path);
            defer self.allocator.free(photo_date);

            // Generate JSON for this photo (no storing in memory!)
            const photo_json = try std.fmt.allocPrint(self.allocator,
                \\{{"id":{}, "name":"{s}", "thumbnail":"/photos/{s}", "date":"{s}", "favorite":{s}, "tags":["real"]}}
            , .{
                count + 1,
                entry.name,
                entry.name,
                photo_date,
                if (is_favorite) "true" else "false"
            });
            defer self.allocator.free(photo_json);
            try json.appendSlice(photo_json);
            
            found += 1;
            count += 1;
        }
        
        try json.append(']');
        print("📡 Discovered {} photos (offset: {}, limit: {}) - Zero memory storage!\n", .{found, offset, limit});
        return json.toOwnedSlice();
    }

    // Symlink-based favorites management
    fn isPhotoFavorited(self: *Self, photo_name: []const u8) !bool {
        var favorites_path_buf: [512]u8 = undefined;
        const favorites_path = try std.fmt.bufPrint(favorites_path_buf[0..], "{s}/favorites/{s}", .{ self.photos_dir, photo_name });

        // Check if symlink exists
        std.fs.cwd().access(favorites_path, .{}) catch |err| switch (err) {
            error.FileNotFound => return false,
            else => return err,
        };
        return true;
    }

    fn addPhotoToFavorites(self: *Self, photo_name: []const u8) !void {
        // Ensure favorites directory exists
        var favorites_dir_path_buf: [512]u8 = undefined;
        const favorites_dir_path = try std.fmt.bufPrint(favorites_dir_path_buf[0..], "{s}/favorites", .{self.photos_dir});
        std.fs.cwd().makeDir(favorites_dir_path) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };

        // Create symlink: favorites/photo.jpg -> ../photo.jpg
        var source_path_buf: [512]u8 = undefined;
        const source_path = try std.fmt.bufPrint(source_path_buf[0..], "../{s}", .{photo_name});

        var target_path_buf: [512]u8 = undefined;
        const target_path = try std.fmt.bufPrint(target_path_buf[0..], "{s}/favorites/{s}", .{ self.photos_dir, photo_name });

        // Remove existing symlink if it exists
        std.fs.cwd().deleteFile(target_path) catch |err| switch (err) {
            error.FileNotFound => {},
            else => return err,
        };

        // Create new symlink
        try std.fs.cwd().symLink(source_path, target_path, .{});
        print("⭐ Added '{s}' to favorites\n", .{photo_name});
    }

    fn removePhotoFromFavorites(self: *Self, photo_name: []const u8) !void {
        var favorites_path_buf: [512]u8 = undefined;
        const favorites_path = try std.fmt.bufPrint(favorites_path_buf[0..], "{s}/favorites/{s}", .{ self.photos_dir, photo_name });

        std.fs.cwd().deleteFile(favorites_path) catch |err| switch (err) {
            error.FileNotFound => return, // Already not a favorite
            else => return err,
        };
        print("💔 Removed '{s}' from favorites\n", .{photo_name});
    }

    fn send404(_: *Self, socket: std.posix.fd_t) !void {
        const not_found = "404 Not Found";
        var response_buffer: [256]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{s}",
            .{ not_found.len, not_found });
        _ = try std.posix.write(socket, response);
    }

    fn sendMethodNotAllowed(_: *Self, socket: std.posix.fd_t) !void {
        const message = "Method Not Allowed";
        var response_buffer: [256]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 405 Method Not Allowed\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{s}",
            .{ message.len, message });
        _ = try std.posix.write(socket, response);
    }

    fn sendInternalServerError(_: *Self, socket: std.posix.fd_t) !void {
        const message = "Internal Server Error";
        var response_buffer: [256]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{s}",
            .{ message.len, message });
        _ = try std.posix.write(socket, response);
    }

    fn sendSuccessResponse(_: *Self, socket: std.posix.fd_t, message: []const u8) !void {
        var response_buffer: [512]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{s}",
            .{ message.len, message });
        _ = try std.posix.write(socket, response);
    }

    fn handleGetPeople(self: *Self, socket: std.posix.fd_t) !void {
        const people = self.database.getPeople(self.allocator) catch |err| {
            print("❌ Failed to get people: {}\n", .{err});
            try self.sendInternalServerError(socket);
            return;
        };
        defer {
            for (people) |person| {
                self.allocator.free(person.name);
                if (person.face_encodings) |encodings| {
                    self.allocator.free(encodings);
                }
            }
            self.allocator.free(people);
        }

        var json = std.ArrayList(u8).init(self.allocator);
        defer json.deinit();

        try json.append('[');
        for (people, 0..) |person, i| {
            if (i > 0) try json.append(',');
            const person_json = try std.fmt.allocPrint(self.allocator,
                \\{{"id":{}, "name":"{s}", "created_at":{}}}
            , .{ person.id, person.name, person.created_at });
            defer self.allocator.free(person_json);
            try json.appendSlice(person_json);
        }
        try json.append(']');

        const json_response = try json.toOwnedSlice();
        defer self.allocator.free(json_response);

        var response_buffer: [1024]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
            .{json_response.len});
        _ = try std.posix.write(socket, response);
        _ = try std.posix.write(socket, json_response);
    }

    fn handleCreatePerson(self: *Self, socket: std.posix.fd_t) !void {
        // For now, just create a person with a default name
        // In a real implementation, you'd parse the request body
        const person_id = self.database.insertPerson("New Person", null) catch |err| {
            print("❌ Failed to create person: {}\n", .{err});
            try self.sendInternalServerError(socket);
            return;
        };

        const response_json = try std.fmt.allocPrint(self.allocator,
            \\{{"id":{}, "name":"New Person"}}
        , .{person_id});
        defer self.allocator.free(response_json);

        var response_buffer: [1024]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
            .{response_json.len});
        _ = try std.posix.write(socket, response);
        _ = try std.posix.write(socket, response_json);
    }

    fn handleUpdatePerson(self: *Self, socket: std.posix.fd_t, person_id: i64) !void {
        // For now, just update with a default name
        // In a real implementation, you'd parse the request body
        self.database.updatePerson(person_id, "Updated Person", null) catch |err| {
            print("❌ Failed to update person {}: {}\n", .{ person_id, err });
            try self.sendInternalServerError(socket);
            return;
        };

        try self.sendSuccessResponse(socket, "Person updated successfully");
    }

    fn handleDeletePerson(self: *Self, socket: std.posix.fd_t, person_id: i64) !void {
        self.database.deletePerson(person_id) catch |err| {
            print("❌ Failed to delete person {}: {}\n", .{ person_id, err });
            try self.sendInternalServerError(socket);
            return;
        };

        try self.sendSuccessResponse(socket, "Person deleted successfully");
    }

    fn handleTagPersonInPhoto(self: *Self, socket: std.posix.fd_t, person_id: i64, photo_id: i64) !void {
        _ = self.database.tagPersonInPhoto(photo_id, person_id, 1.0, true) catch |err| {
            print("❌ Failed to tag person {} in photo {}: {}\n", .{ person_id, photo_id, err });
            try self.sendInternalServerError(socket);
            return;
        };

        try self.sendSuccessResponse(socket, "Person tagged in photo successfully");
    }

    fn handleUntagPersonFromPhoto(self: *Self, socket: std.posix.fd_t, person_id: i64, photo_id: i64) !void {
        self.database.untagPersonFromPhoto(photo_id, person_id) catch |err| {
            print("❌ Failed to untag person {} from photo {}: {}\n", .{ person_id, photo_id, err });
            try self.sendInternalServerError(socket);
            return;
        };

        try self.sendSuccessResponse(socket, "Person untagged from photo successfully");
    }

    fn createPersonDirectory(self: *Self, person_name: []const u8) !void {
        var person_dir_path_buf: [512]u8 = undefined;
        const person_dir_path = try std.fmt.bufPrint(person_dir_path_buf[0..], "{s}/people/{s}", .{ self.photos_dir, person_name });

        std.fs.cwd().makeDir(person_dir_path) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };
    }

    fn addPhotoToPersonDirectory(self: *Self, person_name: []const u8, photo_name: []const u8) !void {
        // Ensure person directory exists
        try self.createPersonDirectory(person_name);

        // Create symlink: people/{person_name}/photo.jpg -> ../../photo.jpg
        var source_path_buf: [512]u8 = undefined;
        const source_path = try std.fmt.bufPrint(source_path_buf[0..], "../../{s}", .{photo_name});

        var target_path_buf: [512]u8 = undefined;
        const target_path = try std.fmt.bufPrint(target_path_buf[0..], "{s}/people/{s}/{s}", .{ self.photos_dir, person_name, photo_name });

        // Remove existing symlink if it exists
        std.fs.cwd().deleteFile(target_path) catch |err| switch (err) {
            error.FileNotFound => {},
            else => return err,
        };

        // Create new symlink
        try std.fs.cwd().symLink(source_path, target_path, .{});
        print("👤 Added '{s}' to {s}'s photos\n", .{ photo_name, person_name });
    }

    fn removePhotoFromPersonDirectory(self: *Self, person_name: []const u8, photo_name: []const u8) !void {
        var person_photo_path_buf: [512]u8 = undefined;
        const person_photo_path = try std.fmt.bufPrint(person_photo_path_buf[0..], "{s}/people/{s}/{s}", .{ self.photos_dir, person_name, photo_name });

        std.fs.cwd().deleteFile(person_photo_path) catch |err| switch (err) {
            error.FileNotFound => return, // Already not in person's directory
            else => return err,
        };
        print("👤 Removed '{s}' from {s}'s photos\n", .{ photo_name, person_name });
    }

    fn handleDetectFaces(self: *Self, socket: std.posix.fd_t, photo_name: []const u8) !void {
        var photo_path_buf: [512]u8 = undefined;
        const photo_path = try std.fmt.bufPrint(photo_path_buf[0..], "{s}/{s}", .{ self.photos_dir, photo_name });

        // Check if photo exists
        std.fs.cwd().access(photo_path, .{}) catch |err| switch (err) {
            error.FileNotFound => {
                try self.send404(socket);
                return;
            },
            else => return err,
        };

        // Run face detection via Node.js script
        const cmd = [_][]const u8{ "node", "scripts/face-detection.cjs", "detect", photo_path };

        const result = std.process.Child.run(.{
            .allocator = self.allocator,
            .argv = &cmd,
        }) catch |err| {
            print("❌ Failed to run face detection for {s}: {}\n", .{ photo_name, err });
            try self.sendInternalServerError(socket);
            return;
        };
        defer self.allocator.free(result.stdout);
        defer self.allocator.free(result.stderr);

        if (result.term != .Exited or result.term.Exited != 0) {
            print("❌ Face detection failed for {s}: {s}\n", .{ photo_name, result.stderr });
            try self.sendInternalServerError(socket);
            return;
        }

        // Return the JSON response from the Node.js script
        var response_buffer: [1024]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
            .{result.stdout.len});
        _ = try std.posix.write(socket, response);
        _ = try std.posix.write(socket, result.stdout);

        print("🔍 Detected faces in {s}\n", .{photo_name});
    }

    fn handleMatchFaces(self: *Self, socket: std.posix.fd_t, photo_name: []const u8) !void {
        var photo_path_buf: [512]u8 = undefined;
        const photo_path = try std.fmt.bufPrint(photo_path_buf[0..], "{s}/{s}", .{ self.photos_dir, photo_name });

        // Check if photo exists
        std.fs.cwd().access(photo_path, .{}) catch |err| switch (err) {
            error.FileNotFound => {
                try self.send404(socket);
                return;
            },
            else => return err,
        };

        // Get all people with face encodings from database
        const people = self.database.getPeople(self.allocator) catch |err| {
            print("❌ Failed to get people for face matching: {}\n", .{err});
            try self.sendInternalServerError(socket);
            return;
        };
        defer {
            for (people) |person| {
                self.allocator.free(person.name);
                if (person.face_encodings) |encodings| {
                    self.allocator.free(encodings);
                }
            }
            self.allocator.free(people);
        }

        // Build known encodings JSON for the Node.js script
        var known_encodings = std.ArrayList(u8).init(self.allocator);
        defer known_encodings.deinit();

        try known_encodings.append('[');
        var first = true;
        for (people) |person| {
            if (person.face_encodings) |encodings| {
                if (!first) try known_encodings.append(',');
                first = false;

                const person_encoding = try std.fmt.allocPrint(self.allocator,
                    \\{{"personId":{}, "descriptor":"{s}"}}
                , .{ person.id, encodings });
                defer self.allocator.free(person_encoding);
                try known_encodings.appendSlice(person_encoding);
            }
        }
        try known_encodings.append(']');

        const known_encodings_json = try known_encodings.toOwnedSlice();
        defer self.allocator.free(known_encodings_json);

        // Run face matching via Node.js script
        const cmd = [_][]const u8{ "node", "scripts/face-detection.cjs", "match", photo_path, known_encodings_json };

        const result = std.process.Child.run(.{
            .allocator = self.allocator,
            .argv = &cmd,
        }) catch |err| {
            print("❌ Failed to run face matching for {s}: {}\n", .{ photo_name, err });
            try self.sendInternalServerError(socket);
            return;
        };
        defer self.allocator.free(result.stdout);
        defer self.allocator.free(result.stderr);

        if (result.term != .Exited or result.term.Exited != 0) {
            print("❌ Face matching failed for {s}: {s}\n", .{ photo_name, result.stderr });
            try self.sendInternalServerError(socket);
            return;
        }

        // Return the JSON response from the Node.js script
        var response_buffer: [1024]u8 = undefined;
        const response = try std.fmt.bufPrint(response_buffer[0..],
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
            .{result.stdout.len});
        _ = try std.posix.write(socket, response);
        _ = try std.posix.write(socket, result.stdout);

        print("🎯 Matched faces in {s}\n", .{photo_name});
    }
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var server = try Server.init(allocator);

    const address = net.Address.parseIp("0.0.0.0", 8080) catch unreachable;
    try server.listen(address);
}
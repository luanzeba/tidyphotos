const std = @import("std");
const net = std.net;
const print = std.debug.print;
const PhotoImporter = @import("import/photo_importer.zig").PhotoImporter;
const PhotoInfo = @import("import/photo_importer.zig").PhotoInfo;
const ThumbnailGenerator = @import("thumbnails/thumbnail_generator.zig").ThumbnailGenerator;

const Server = struct {
    allocator: std.mem.Allocator,
    photo_importer: PhotoImporter,
    thumbnail_generator: ThumbnailGenerator,
    photos_dir: []const u8,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) !Self {
        // Initialize in test mode for now
        const photo_importer = PhotoImporter.init(allocator, "photos", true);
        const thumbnail_generator = ThumbnailGenerator.init(allocator, "thumbnails");
        const photos_dir = "test_photos";
        
        print("TidyPhotos: Ready to serve photos from {s}/ (on-demand discovery)\n", .{photos_dir});
        
        return Self{
            .allocator = allocator,
            .photo_importer = photo_importer,
            .thumbnail_generator = thumbnail_generator,
            .photos_dir = photos_dir,
        };
    }

    pub fn listen(self: *Self, address: net.Address) !void {
        const socket = try std.posix.socket(std.posix.AF.INET, std.posix.SOCK.STREAM, 0);
        defer std.posix.close(socket);
        
        try std.posix.setsockopt(socket, std.posix.SOL.SOCKET, std.posix.SO.REUSEADDR, &std.mem.toBytes(@as(c_int, 1)));
        try std.posix.bind(socket, &address.any, address.getOsSockLen());
        try std.posix.listen(socket, 128);
        
        print("TidyPhotos server listening on http://127.0.0.1:8080\n", .{});

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
            if (!std.mem.endsWith(u8, entry.name, ".jpeg") and !std.mem.endsWith(u8, entry.name, ".jpg")) continue;
            
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

            // Generate JSON for this photo (no storing in memory!)
            const photo_json = try std.fmt.allocPrint(self.allocator,
                \\{{"id":{}, "name":"{s}", "thumbnail":"/photos/{s}", "date":"2024-05-22T12:00:00Z", "favorite":{s}, "tags":["real"]}}
            , .{
                count + 1,
                entry.name,
                entry.name,
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
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var server = try Server.init(allocator);

    const address = net.Address.parseIp("127.0.0.1", 8080) catch unreachable;
    try server.listen(address);
}
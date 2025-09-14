const std = @import("std");
const fs = std.fs;
const print = std.debug.print;

pub const ThumbnailGenerator = struct {
    allocator: std.mem.Allocator,
    thumbnails_dir: []const u8,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator, thumbnails_dir: []const u8) Self {
        return Self{
            .allocator = allocator,
            .thumbnails_dir = thumbnails_dir,
        };
    }

    pub fn generateThumbnail(self: *Self, photo_path: []const u8, size: ThumbnailSize) ![]const u8 {
        // Create thumbnails directory if it doesn't exist
        fs.cwd().makeDir(self.thumbnails_dir) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };

        const basename = fs.path.stem(fs.path.basename(photo_path));
        const size_suffix = switch (size) {
            .small => "_thumb_s",
            .medium => "_thumb_m", 
            .large => "_thumb_l",
        };
        
        const thumbnail_filename = try std.fmt.allocPrint(
            self.allocator, 
            "{s}{s}.jpg", 
            .{ basename, size_suffix }
        );
        
        const thumbnail_path = try std.fmt.allocPrint(
            self.allocator,
            "{s}/{s}",
            .{ self.thumbnails_dir, thumbnail_filename }
        );

        // For now, just copy the original file as thumbnail
        // TODO: Use image processing library to actually resize images
        try self.copyFile(photo_path, thumbnail_path);
        
        print("Generated thumbnail: {s}\n", .{thumbnail_path});
        return thumbnail_path;
    }

    fn copyFile(self: *Self, src_path: []const u8, dest_path: []const u8) !void {
        _ = self;
        
        const src_file = try fs.cwd().openFile(src_path, .{});
        defer src_file.close();
        
        const dest_file = try fs.cwd().createFile(dest_path, .{});
        defer dest_file.close();
        
        var buffer: [4096]u8 = undefined;
        while (true) {
            const bytes_read = try src_file.read(&buffer);
            if (bytes_read == 0) break;
            try dest_file.writeAll(buffer[0..bytes_read]);
        }
    }

    pub fn getThumbnailPath(self: *Self, photo_path: []const u8, size: ThumbnailSize) ![]const u8 {
        const basename = fs.path.stem(fs.path.basename(photo_path));
        const size_suffix = switch (size) {
            .small => "_thumb_s",
            .medium => "_thumb_m",
            .large => "_thumb_l",
        };
        
        return try std.fmt.allocPrint(
            self.allocator,
            "{s}/{s}{s}.jpg",
            .{ self.thumbnails_dir, basename, size_suffix }
        );
    }

    pub fn thumbnailExists(self: *Self, photo_path: []const u8, size: ThumbnailSize) bool {
        const thumbnail_path = self.getThumbnailPath(photo_path, size) catch return false;
        defer self.allocator.free(thumbnail_path);
        
        const file = fs.cwd().openFile(thumbnail_path, .{}) catch return false;
        file.close();
        return true;
    }
};

pub const ThumbnailSize = enum {
    small,   // 150x150
    medium,  // 300x300
    large,   // 600x600
};
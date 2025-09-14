const std = @import("std");
const fs = std.fs;
const print = std.debug.print;

pub const PhotoImporter = struct {
    allocator: std.mem.Allocator,
    photos_dir: []const u8,
    test_mode: bool,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator, photos_dir: []const u8, test_mode: bool) Self {
        return Self{
            .allocator = allocator,
            .photos_dir = photos_dir,
            .test_mode = test_mode,
        };
    }

    pub fn importPhotos(self: *Self) ![]PhotoInfo {
        if (self.test_mode) {
            return self.createTestPhotos();
        }
        // TODO: Implement real photo import from Apple Photos library
        return &[_]PhotoInfo{};
    }

    fn createTestPhotos(self: *Self) ![]PhotoInfo {
        var photos = std.ArrayList(PhotoInfo).init(self.allocator);
        
        // Scan the test_photos directory for real photos
        var dir = fs.cwd().openDir("test_photos", .{ .iterate = true }) catch |err| switch (err) {
            error.FileNotFound => {
                print("test_photos directory not found\n", .{});
                return photos.toOwnedSlice();
            },
            else => return err,
        };
        defer dir.close();
        
        var iterator = dir.iterate();
        while (try iterator.next()) |entry| {
            if (entry.kind != .file) continue;
            
            // Only process JPEG files
            if (!std.mem.endsWith(u8, entry.name, ".jpeg") and !std.mem.endsWith(u8, entry.name, ".jpg")) {
                continue;
            }
            
            const filename = try self.allocator.dupe(u8, entry.name);
            const filepath = try std.fmt.allocPrint(self.allocator, "test_photos/{s}", .{filename});
            
            const stat = try dir.statFile(entry.name);
            const photo_info = PhotoInfo{
                .filename = filename,
                .path = filepath,
                .size = stat.size,
                .created_date = @intCast(@divTrunc(stat.mtime, 1_000_000_000)),
                .is_test = true,
            };
            
            try photos.append(photo_info);
            print("Found real photo: {s} ({} bytes)\n", .{ filename, stat.size });
        }
        
        return photos.toOwnedSlice();
    }

    pub fn extractMetadata(self: *Self, photo_path: []const u8) !PhotoMetadata {
        _ = self;
        
        const file = try fs.cwd().openFile(photo_path, .{});
        defer file.close();
        
        const stat = try file.stat();
        
        // TODO: Extract real EXIF data using a library
        return PhotoMetadata{
            .filename = std.fs.path.basename(photo_path),
            .size = stat.size,
            .created_date = @intCast(@divTrunc(stat.mtime, 1_000_000_000)), // Convert nanoseconds to seconds
            .width = 800, // Mock values for now
            .height = 600,
            .camera_make = null,
            .camera_model = null,
            .gps_latitude = null,
            .gps_longitude = null,
        };
    }
};

pub const PhotoInfo = struct {
    filename: []const u8,
    path: []const u8,
    size: u64,
    created_date: i64,
    is_test: bool,
};

pub const PhotoMetadata = struct {
    filename: []const u8,
    size: u64,
    created_date: i64,
    width: u32,
    height: u32,
    camera_make: ?[]const u8,
    camera_model: ?[]const u8,
    gps_latitude: ?f64,
    gps_longitude: ?f64,
};
const std = @import("std");
const fs = std.fs;
const print = std.debug.print;

/// High-performance thumbnail generator using libvips for WebP thumbnails
/// Optimized for handling thousands of photos with minimal memory usage
pub const ThumbnailGenerator = struct {
    allocator: std.mem.Allocator,
    cache_dir: []const u8,
    thumbnail_size: u32,

    const Self = @This();

    /// Initialize thumbnail generator with cache directory
    /// Default thumbnail size is 284px (optimal for grid display)
    pub fn init(allocator: std.mem.Allocator, cache_dir: []const u8) Self {
        return Self{
            .allocator = allocator,
            .cache_dir = cache_dir,
            .thumbnail_size = 284, // Optimal size based on reference architecture
        };
    }

    /// Generate or retrieve WebP thumbnail for a photo
    /// Returns the relative path to the thumbnail (e.g., "cache/thumbnails/123.webp")
    pub fn generateThumbnail(self: *Self, out_alloc: std.mem.Allocator, photo_id: i64, photo_path: []const u8) ![]u8 {
        // Build "…/thumbnails"
        const thumbnail_dir = try std.fmt.allocPrint(self.allocator, "{s}/thumbnails", .{self.cache_dir});
        defer self.allocator.free(thumbnail_dir);

        // Ensure directory exists
        std.fs.cwd().makePath(thumbnail_dir) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };

        // Build the filename (temp in self.allocator)
        const filename = try std.fmt.allocPrint(self.allocator, "{d}.webp", .{photo_id});
        defer self.allocator.free(filename);

        // Build the full path in **out_alloc** (this is the memory we return)
        const out_path = try std.fmt.allocPrint(out_alloc, "{s}/{s}", .{ thumbnail_dir, filename });

        if (self.thumbnailExistsAt(out_path)) {
            print("✓ Using cached thumbnail: {s}\n", .{filename});
            return out_path;
        }

        print("⚡ Generating thumbnail for photo ID {d}...\n", .{photo_id});

        // Generate to the same path (we can reuse abs path building with self.allocator)
        try self.generateWebPThumbnail(photo_path, out_path);

        print("✓ Generated thumbnail: {s} (ID: {d})\n", .{ filename, photo_id });
        return out_path;
    }

    /// Generate WebP thumbnail using vips for maximum performance
    /// vips is ~4-8x faster than ImageMagick and uses much less memory
    fn generateWebPThumbnail(self: *Self, source_path: []const u8, dest_path: []const u8) !void {
        // Get absolute paths to avoid vips path confusion
        const cwd = std.fs.cwd();

        // Get absolute source path
        const abs_source = try cwd.realpathAlloc(self.allocator, source_path);
        defer self.allocator.free(abs_source);

        // Get absolute dest path - vips interprets relative paths relative to source!
        var cwd_path_buf: [std.fs.max_path_bytes]u8 = undefined;
        const cwd_path = try cwd.realpath(".", &cwd_path_buf);

        const abs_dest = try std.fmt.allocPrint(self.allocator, "{s}/{s}", .{ cwd_path, dest_path });
        defer self.allocator.free(abs_dest);

        const size_arg = try std.fmt.allocPrint(self.allocator, "{d}x{d}", .{ self.thumbnail_size, self.thumbnail_size });
        defer self.allocator.free(size_arg);

        const output_arg = try std.fmt.allocPrint(self.allocator, "{s}[Q=85,strip]", .{abs_dest});
        defer self.allocator.free(output_arg);

        // Use vips thumbnail command for fast, memory-efficient thumbnails
        // --size=284x284 = max dimensions (maintains aspect ratio)
        // -o {dest}[Q=85,strip] = quality 85, strip metadata for smaller files
        const args = [_][]const u8{
            "vipsthumbnail",
            abs_source,
            "--size",
            size_arg,
            "-o",
            output_arg,
        };

        var child = std.process.Child.init(&args, self.allocator);
        child.stdin_behavior = .Ignore;
        child.stdout_behavior = .Ignore;
        child.stderr_behavior = .Pipe;

        try child.spawn();

        // Capture stderr for error reporting
        const stderr = try child.stderr.?.readToEndAlloc(self.allocator, 10 * 1024 * 1024);
        defer self.allocator.free(stderr);

        const term = try child.wait();
        if (term != .Exited or term.Exited != 0) {
            print("⚠️  vips error: {s}\n", .{stderr});
            // Fallback to sips (macOS native tool) if vips fails
            return self.generateWithSips(source_path, dest_path);
        }
    }

    /// Fallback thumbnail generation using macOS sips command
    /// Used when vips is unavailable or fails (e.g., for HEIC files)
    fn generateWithSips(self: *Self, source_path: []const u8, dest_path: []const u8) !void {
        // First, use sips to resize to temp JPEG with auto-rotation
        const temp_jpg = try std.fmt.allocPrint(self.allocator, "{s}.tmp.jpg", .{dest_path});
        defer self.allocator.free(temp_jpg);

        const size_str = try std.fmt.allocPrint(self.allocator, "{d}", .{self.thumbnail_size});
        defer self.allocator.free(size_str);

        const sips_args = [_][]const u8{
            "sips",
            "-s",
            "format",
            "jpeg",
            "-Z",
            size_str,
            "--out",
            temp_jpg,
            source_path,
        };

        var sips_child = std.process.Child.init(&sips_args, self.allocator);
        sips_child.stdin_behavior = .Ignore;
        sips_child.stdout_behavior = .Ignore;
        sips_child.stderr_behavior = .Ignore;

        try sips_child.spawn();
        _ = try sips_child.wait();

        // Auto-rotate based on EXIF orientation
        const rotate_args = [_][]const u8{
            "sips",
            "--rotate",
            "auto",
            temp_jpg,
        };

        var rotate_child = std.process.Child.init(&rotate_args, self.allocator);
        rotate_child.stdin_behavior = .Ignore;
        rotate_child.stdout_behavior = .Ignore;
        rotate_child.stderr_behavior = .Ignore;

        try rotate_child.spawn();
        _ = try rotate_child.wait();

        // Convert JPEG to WebP using cwebp
        const cwebp_args = [_][]const u8{
            "cwebp",
            "-q",
            "85",
            "-m",      "4", // Compression method (0=fast, 6=slow but smaller)
            temp_jpg,  "-o",
            dest_path,
        };

        var cwebp_child = std.process.Child.init(&cwebp_args, self.allocator);
        cwebp_child.stdin_behavior = .Ignore;
        cwebp_child.stdout_behavior = .Ignore;
        cwebp_child.stderr_behavior = .Ignore;

        try cwebp_child.spawn();
        _ = try cwebp_child.wait();

        // Clean up temp file
        fs.cwd().deleteFile(temp_jpg) catch {};
    }

    /// Build thumbnail path (no generation). Allocation goes to `out_alloc`.
    pub fn getThumbnailPath(self: *Self, out_alloc: std.mem.Allocator, photo_id: i64) ![]u8 {
        return try std.fmt.allocPrint(out_alloc, "{s}/thumbnails/{d}.webp", .{ self.cache_dir, photo_id });
    }

    /// Get thumbnail URL for use in API responses
    pub fn getThumbnailUrl(self: *Self, photo_id: i64) ![]const u8 {
        return try std.fmt.allocPrint(self.allocator, "/api/thumbnails/{d}", .{photo_id});
    }

    /// Check if thumbnail exists for a photo ID
    pub fn thumbnailExists(self: *Self, photo_id: i64) bool {
        const thumbnail_path = self.getThumbnailPath(self.allocator, photo_id) catch return false;
        defer self.allocator.free(thumbnail_path);
        return self.thumbnailExistsAt(thumbnail_path);
    }

    fn thumbnailExistsAt(self: *Self, path: []const u8) bool {
        _ = self;
        const file = fs.cwd().openFile(path, .{}) catch return false;
        file.close();
        return true;
    }
};

/// Photo information for batch thumbnail generation
pub const PhotoInfo = struct {
    id: i64,
    path: []const u8,
};


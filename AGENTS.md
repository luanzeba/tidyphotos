# TidyPhotos - Agent Instructions

This document provides essential context and instructions for AI coding assistants working on the TidyPhotos project.

## Project Overview

TidyPhotos is a self-hosted photo management application designed as an Apple Photos alternative. It features a Zig backend HTTP server, Alpine.js frontend, and focuses on minimal memory usage with on-demand photo discovery.

## Architecture

- **Backend**: Zig HTTP server with manual request parsing
- **Frontend**: Alpine.js with reactive state management
- **Storage**: File system as source of truth, SQLite for metadata (planned)
- **Photos**: On-demand discovery with zero memory storage
- **Build**: Zig build system

## Key Technical Decisions

1. **Memory Efficiency**: Photos are discovered on-demand, not pre-loaded into memory
2. **Chunked File Serving**: Large images (2-3MB) are served in 8KB chunks to prevent connection issues
3. **Performance Optimizations**: CSS Grid uses `contain: layout` and `will-change` for fast repositioning
4. **Responsive Design**: Desktop sidebar (120px) + mobile bottom slider with backdrop blur

## File Structure

```
tidyphotos/
├── build.zig                 # Zig build configuration
├── src/
│   ├── main.zig             # HTTP server, routing, photo discovery
│   └── import/
│       └── photo_importer.zig # Photo scanning and metadata
└── public/
    ├── index.html           # Alpine.js application
    ├── js/app.js           # Reactive state and methods
    └── styles/main.css     # Responsive styling
```

## Current Features

- ✅ Photo gallery with thumbnail grid
- ✅ Year/Month timeline filtering
- ✅ Search functionality
- ✅ Keyboard navigation (arrows, F for favorite, space for full-screen)
- ✅ Full-screen photo viewer with navigation
- ✅ Mobile responsive design
- ✅ Favorite system

## Build & Run Commands

```bash
# Build the application
zig build

# Run the server
./zig-out/bin/tidyphotos

# Server runs on http://127.0.0.1:8080
```

## Development Guidelines

### Zig Backend
- Use manual HTTP request parsing (no external frameworks)
- Implement chunked file serving for large images
- Always handle errors gracefully with proper HTTP status codes
- Use on-demand photo discovery, never store photos in memory

### Frontend (Alpine.js)
- Keep reactive state minimal and focused
- Use computed properties for derived data
- Implement keyboard shortcuts for power users
- Maintain responsive design for mobile/desktop

### CSS Performance
- Use `contain: layout` for grid optimizations
- Avoid layout-affecting transitions on frequently changing elements
- Use hardware acceleration (`will-change`) sparingly
- Implement mobile-first responsive design

### File Serving
- Handle HEAD requests properly
- Use appropriate MIME types
- Implement proper error handling (404s)
- Stream large files in chunks

## Common Issues & Solutions

1. **BrokenPipe Errors**: Fixed with chunked file serving and proper HEAD request handling
2. **Memory Concerns**: Use on-demand discovery instead of pre-loading photos
3. **Slow Grid Repositioning**: Remove transitions that affect layout, use CSS containment
4. **Mobile UI**: Use bottom slider with backdrop blur for timeline navigation

## Testing

- Test photos should be placed in `test_photos/` directory
- Server supports both `.jpg` and `.jpeg` extensions
- Mock data is generated if no photos are found

## Future Features (Planned)

- SQLite metadata storage
- Thumbnail generation
- Album management via symlinks
- Facial recognition and tagging
- Bulk photo operations
- Advanced search and filtering

## Important Notes

- The application prioritizes performance and memory efficiency
- File system is the source of truth for photos
- UI follows Apple-style design patterns
- Mobile experience is equally important as desktop
- All photos are served from `test_photos/` directory in development mode

## Quick Start for New Agents

1. Run `zig build && ./zig-out/bin/tidyphotos` to start the server
2. Access http://127.0.0.1:8080 in browser
3. Place test images in `test_photos/` directory
4. Use keyboard shortcuts: arrows (navigate), space (full-screen), F (favorite), escape (close)

## Testing Real Photos

The application can serve real photos from `/Users/vieira/Downloads/test_pictures` for testing purposes. The server automatically discovers and serves any `.jpg` or `.jpeg` files in the configured photos directory.

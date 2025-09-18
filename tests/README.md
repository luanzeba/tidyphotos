# TidyPhotos Testing

This directory contains the test suite for TidyPhotos using Vitest.

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once and exit
npm run test:run

# Run tests with UI
npm run test:ui
```

## Test Structure

```
tests/
├── setup.ts                    # Test configuration and global mocks
├── test-utils.ts               # Shared test utilities and helpers
├── photo-manager.test.ts       # Core PhotoManager logic tests
├── timeline-manager.test.ts    # Timeline filtering and selection tests
└── integration/
    └── favorites-api.test.ts   # API integration tests
```

## What's Tested

### High-Priority Coverage (80% of testing value)
- **PhotoManager.toggleFavorite()** - Critical optimistic updates logic with error handling
- **TimelineManager.filterPhotos()** - Core photo filtering by date and search
- **Favorites API** - REST endpoint behavior and error handling

### Coverage Strategy
- ✅ Business logic with complex state management
- ✅ Error handling and rollback mechanisms
- ✅ API integration points
- ❌ Simple getters/setters (not tested to keep suite lightweight)
- ❌ Third-party library internals (Alpine.js)

## Key Test Features

- **Optimistic Updates**: Tests verify immediate UI updates and rollback on API failures
- **Error Scenarios**: Network errors, server errors, and edge cases
- **Search Logic**: Photo filtering by name, tags, dates with case-insensitive search
- **API Contract**: Validates correct HTTP methods and URL encoding

## Adding New Tests

1. Use `createMockPhoto()` and `createMockPhotos()` from `test-utils.ts` for consistent test data
2. Mock fetch calls with `vi.mocked(fetch)` for API tests
3. Focus on testing business logic, not implementation details
4. Test error cases and edge conditions
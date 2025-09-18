// Test setup file
import { vi } from 'vitest'

// Mock fetch globally for all tests
global.fetch = vi.fn()

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
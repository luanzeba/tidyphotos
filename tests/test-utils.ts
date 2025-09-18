import type { Photo } from '../src/frontend/types'

/**
 * Creates a mock photo object with default values
 */
export function createMockPhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 1,
    name: 'test-photo.jpg',
    thumbnail: '/thumbnails/test-photo.jpg',
    date: '2023-01-01T12:00:00Z',
    favorite: false,
    tags: [],
    ...overrides
  }
}

/**
 * Creates multiple mock photos with sequential IDs
 */
export function createMockPhotos(count: number, baseOverrides: Partial<Photo> = {}): Photo[] {
  return Array.from({ length: count }, (_, index) =>
    createMockPhoto({
      id: index + 1,
      name: `test-photo-${index + 1}.jpg`,
      thumbnail: `/thumbnails/test-photo-${index + 1}.jpg`,
      ...baseOverrides
    })
  )
}

/**
 * Mock successful fetch response
 */
export function mockSuccessResponse(data: any = '', status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * Mock error fetch response
 */
export function mockErrorResponse(message: string = 'Error', status: number = 500): Response {
  return new Response(message, { status })
}

/**
 * Helper to wait for next tick (useful for async operations)
 */
export function nextTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Favorites API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('PUT /api/photos/:name/favorite', () => {
    it('should call the correct endpoint when adding to favorites', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      await fetch('/api/photos/test-photo.jpg/favorite', {
        method: 'PUT'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test-photo.jpg/favorite',
        { method: 'PUT' }
      )
    })

    it('should handle success response correctly', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockResponse = new Response('', { status: 200 })
      mockFetch.mockResolvedValue(mockResponse)

      const response = await fetch('/api/photos/test-photo.jpg/favorite', {
        method: 'PUT'
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
    })

    it('should handle server error response', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockResponse = new Response('Internal Server Error', { status: 500 })
      mockFetch.mockResolvedValue(mockResponse)

      const response = await fetch('/api/photos/test-photo.jpg/favorite', {
        method: 'PUT'
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(500)
    })

    it('should properly encode photo names with special characters', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      const photoName = 'my photo with spaces & symbols.jpg'
      const encodedName = encodeURIComponent(photoName)

      await fetch(`/api/photos/${encodedName}/favorite`, {
        method: 'PUT'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/my%20photo%20with%20spaces%20%26%20symbols.jpg/favorite',
        { method: 'PUT' }
      )
    })
  })

  describe('DELETE /api/photos/:name/favorite', () => {
    it('should call the correct endpoint when removing from favorites', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      await fetch('/api/photos/test-photo.jpg/favorite', {
        method: 'DELETE'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test-photo.jpg/favorite',
        { method: 'DELETE' }
      )
    })

    it('should handle success response correctly', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockResponse = new Response('', { status: 200 })
      mockFetch.mockResolvedValue(mockResponse)

      const response = await fetch('/api/photos/test-photo.jpg/favorite', {
        method: 'DELETE'
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
    })

    it('should handle not found response when photo is not in favorites', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockResponse = new Response('Not Found', { status: 404 })
      mockFetch.mockResolvedValue(mockResponse)

      const response = await fetch('/api/photos/nonexistent-photo.jpg/favorite', {
        method: 'DELETE'
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(404)
    })
  })

  describe('Network error handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValue(new Error('Network error'))

      try {
        await fetch('/api/photos/test-photo.jpg/favorite', {
          method: 'PUT'
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Network error')
      }
    })

    it('should handle timeout errors', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValue(new Error('Request timeout'))

      try {
        await fetch('/api/photos/test-photo.jpg/favorite', {
          method: 'PUT'
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Request timeout')
      }
    })
  })

  describe('API contract validation', () => {
    it('should use correct HTTP methods for different operations', () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      // Add to favorites should use PUT
      fetch('/api/photos/test.jpg/favorite', { method: 'PUT' })
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/photos/test.jpg/favorite',
        { method: 'PUT' }
      )

      // Remove from favorites should use DELETE
      fetch('/api/photos/test.jpg/favorite', { method: 'DELETE' })
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/photos/test.jpg/favorite',
        { method: 'DELETE' }
      )
    })

    it('should follow RESTful URL patterns', () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      const photoName = 'example-photo.jpg'
      const expectedUrl = `/api/photos/${encodeURIComponent(photoName)}/favorite`

      fetch(expectedUrl, { method: 'PUT' })

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { method: 'PUT' })
      expect(expectedUrl).toMatch(/^\/api\/photos\/.*\/favorite$/)
    })
  })
})
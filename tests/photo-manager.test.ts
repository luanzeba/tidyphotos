import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PhotoManager } from '../src/frontend/photo-manager'
import type { Photo } from '../src/frontend/types'

describe('PhotoManager', () => {
  let photoManager: PhotoManager

  beforeEach(() => {
    photoManager = new PhotoManager()
    // Set up some test photos
    photoManager['photos'] = [
      {
        id: 1,
        name: 'test1.jpg',
        thumbnail: '/thumbnails/test1.jpg',
        date: '2023-01-01',
        favorite: false,
        tags: ['vacation']
      },
      {
        id: 2,
        name: 'test2.jpg',
        thumbnail: '/thumbnails/test2.jpg',
        date: '2023-01-02',
        favorite: true,
        tags: ['family']
      }
    ]
    photoManager['loading'] = false
  })

  describe('toggleFavorite with optimistic updates', () => {
    it('should immediately update UI when toggling favorite to true', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      const photo = photoManager.allPhotos[0] // test1.jpg, favorite: false
      expect(photo.favorite).toBe(false)

      // Start the toggle operation
      const togglePromise = photoManager.toggleFavorite(1)

      // UI should be updated immediately (optimistic update)
      expect(photo.favorite).toBe(true)

      // Wait for API call to complete
      await togglePromise

      // Should still be true after successful API call
      expect(photo.favorite).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test1.jpg/favorite',
        { method: 'PUT' }
      )
    })

    it('should immediately update UI when toggling favorite to false', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      const photo = photoManager.allPhotos[1] // test2.jpg, favorite: true
      expect(photo.favorite).toBe(true)

      // Start the toggle operation
      const togglePromise = photoManager.toggleFavorite(2)

      // UI should be updated immediately (optimistic update)
      expect(photo.favorite).toBe(false)

      // Wait for API call to complete
      await togglePromise

      // Should still be false after successful API call
      expect(photo.favorite).toBe(false)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test2.jpg/favorite',
        { method: 'DELETE' }
      )
    })

    it('should revert optimistic update when API call fails', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }))

      const photo = photoManager.allPhotos[0] // test1.jpg, favorite: false
      const originalState = photo.favorite
      expect(originalState).toBe(false)

      // Start the toggle operation
      const togglePromise = photoManager.toggleFavorite(1)

      // UI should be updated immediately (optimistic update)
      expect(photo.favorite).toBe(true)

      // Wait for API call to complete
      await togglePromise

      // Should be reverted back to original state after failed API call
      expect(photo.favorite).toBe(originalState)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test1.jpg/favorite',
        { method: 'PUT' }
      )
    })

    it('should revert optimistic update when network error occurs', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValue(new Error('Network error'))

      const photo = photoManager.allPhotos[1] // test2.jpg, favorite: true
      const originalState = photo.favorite
      expect(originalState).toBe(true)

      // Start the toggle operation
      const togglePromise = photoManager.toggleFavorite(2)

      // UI should be updated immediately (optimistic update)
      expect(photo.favorite).toBe(false)

      // Wait for API call to complete
      await togglePromise

      // Should be reverted back to original state after network error
      expect(photo.favorite).toBe(originalState)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test2.jpg/favorite',
        { method: 'DELETE' }
      )
    })

    it('should handle invalid photo ID gracefully', async () => {
      const mockFetch = vi.mocked(fetch)

      await photoManager.toggleFavorite(999) // Non-existent ID

      // Should not make any API calls
      expect(mockFetch).not.toHaveBeenCalled()

      // Other photos should be unaffected
      expect(photoManager.allPhotos[0].favorite).toBe(false)
      expect(photoManager.allPhotos[1].favorite).toBe(true)
    })

    it('should encode photo names properly in API URLs', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue(new Response('', { status: 200 }))

      // Add a photo with special characters in the name
      photoManager['photos'].push({
        id: 3,
        name: 'test photo with spaces & symbols.jpg',
        thumbnail: '/thumbnails/test3.jpg',
        date: '2023-01-03',
        favorite: false,
        tags: []
      })

      await photoManager.toggleFavorite(3)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test%20photo%20with%20spaces%20%26%20symbols.jpg/favorite',
        { method: 'PUT' }
      )
    })
  })

  describe('basic functionality', () => {
    it('should return correct loading state', () => {
      photoManager['loading'] = true
      expect(photoManager.isLoading).toBe(true)

      photoManager['loading'] = false
      expect(photoManager.isLoading).toBe(false)
    })

    it('should return all photos', () => {
      expect(photoManager.allPhotos).toHaveLength(2)
      expect(photoManager.allPhotos[0].name).toBe('test1.jpg')
      expect(photoManager.allPhotos[1].name).toBe('test2.jpg')
    })

    it('should format dates correctly', () => {
      const formatted = photoManager.formatDate('2023-12-25T10:30:00Z')
      expect(formatted).toMatch(/Dec.*25.*2023/)
    })
  })
})
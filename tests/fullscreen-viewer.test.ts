import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FullscreenViewer } from '../src/frontend/fullscreen-viewer'
import type { TidyPhotosApp } from '../src/frontend/tidyphotos-app'
import type { Photo } from '../src/frontend/types'

// Mock the TidyPhotosApp for testing
const createMockApp = (): TidyPhotosApp => ({
  getFilteredPhotos: vi.fn(() => [
    {
      id: 1,
      name: 'test1.jpg',
      thumbnail: '/photos/test1.jpg',
      date: '2023-01-01',
      favorite: false
    },
    {
      id: 2,
      name: 'test2.jpg',
      thumbnail: '/photos/test2.jpg',
      date: '2023-01-02',
      favorite: true
    }
  ] as Photo[]),
  getRouter: vi.fn(() => ({
    updateUrl: vi.fn()
  })),
  setSelectedPhotoId: vi.fn(),
  getCurrentGallery: vi.fn(() => 'all')
} as any)

// Mock DOM methods
const createMockMouseEvent = (clientX: number, clientY: number, target?: HTMLElement): MouseEvent => {
  const event = new MouseEvent('click', {
    clientX,
    clientY,
    bubbles: true,
    cancelable: true
  })

  // Mock the target and getBoundingClientRect
  const mockTarget = target || document.createElement('div')
  const mockImg = document.createElement('img')
  mockImg.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: vi.fn()
  }))

  mockTarget.querySelector = vi.fn(() => mockImg)
  Object.defineProperty(event, 'target', { value: mockTarget })
  Object.defineProperty(event, 'currentTarget', { value: mockTarget })

  return event
}

describe('FullscreenViewer Face Tagging', () => {
  let viewer: FullscreenViewer
  let mockApp: TidyPhotosApp
  let mockFetch: any

  beforeEach(() => {
    mockApp = createMockApp()
    viewer = new FullscreenViewer(mockApp)
    mockFetch = vi.mocked(fetch)

    // Set up viewer in fullscreen mode with first photo
    viewer['fullScreenMode'] = true
    viewer['currentPhotoIndex'] = 0
    viewer['currentFaceTags'] = []
  })

  describe('Face Tagging Mode Toggle', () => {
    it('should toggle tagging mode on and off', () => {
      expect(viewer.isTaggingMode).toBe(false)

      viewer.toggleTaggingMode()
      expect(viewer.isTaggingMode).toBe(true)

      viewer.toggleTaggingMode()
      expect(viewer.isTaggingMode).toBe(false)
    })

    it('should reset drawing state when exiting tagging mode', () => {
      viewer.toggleTaggingMode()

      // Set up some drawing state
      viewer['isDrawingTag'] = true
      viewer['drawStartPos'] = { x: 10, y: 10, width: 5, height: 5 }
      viewer['originalStartPos'] = { x: 10, y: 10 }
      viewer['isDragging'] = true

      viewer.toggleTaggingMode()

      expect(viewer.isTaggingMode).toBe(false)
      expect(viewer.isDrawing).toBe(false)
      expect(viewer.drawingPreview).toBe(null)
      expect(viewer['isDragging']).toBe(false)
    })
  })

  describe('Click-Click Mode Face Tag Creation', () => {
    beforeEach(() => {
      viewer.toggleTaggingMode()
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          faceTag: {
            id: 123,
            x: 10,
            y: 10,
            width: 30,
            height: 30,
            personId: null,
            personName: '',
            confidence: 1.0,
            isManual: true,
            createdAt: Date.now()
          }
        })
      })
    })

    it('should start drawing on first click', () => {
      const event = createMockMouseEvent(50, 50)
      viewer.startDrawingTag(event)

      expect(viewer.isDrawing).toBe(true)
      expect(viewer.drawingPreview).toEqual({
        x: 50,
        y: 50,
        width: 0,
        height: 0
      })
    })

    it('should create face tag on second click (click-click mode)', async () => {
      // First click to start
      const firstClick = createMockMouseEvent(10, 10)
      viewer.startDrawingTag(firstClick)

      expect(viewer.isDrawing).toBe(true)

      // Second click to finish
      const secondClick = createMockMouseEvent(40, 40)
      viewer.startDrawingTag(secondClick)

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0))

      // Should have called API to save face tag
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test1.jpg/face-tags',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x: 10,
            y: 10,
            width: 30,
            height: 30,
            personId: null,
            confidence: 1.0,
            isManual: true
          })
        }
      )

      // Should reset drawing state
      expect(viewer.isDrawing).toBe(false)
      expect(viewer.drawingPreview).toBe(null)
    })

    it('should handle very small click-click tags (minimum 1px)', async () => {
      // First click
      viewer.startDrawingTag(createMockMouseEvent(10, 10))

      // Second click very close (would be < 2px in drag mode but > 1px)
      viewer.startDrawingTag(createMockMouseEvent(12, 12))

      await new Promise(resolve => setTimeout(resolve, 0))

      // Should still create tag because click-click mode has lower minimum
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should ignore clicks on UI elements', () => {
      const button = document.createElement('button')
      const event = createMockMouseEvent(50, 50, button)
      Object.defineProperty(event, 'target', { value: button })

      viewer.startDrawingTag(event)

      expect(viewer.isDrawing).toBe(false)
    })
  })

  describe('Drag Mode Face Tag Creation', () => {
    beforeEach(() => {
      viewer.toggleTaggingMode()
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          faceTag: {
            id: 124,
            x: 10,
            y: 10,
            width: 40,
            height: 40,
            personId: null,
            personName: '',
            confidence: 1.0,
            isManual: true,
            createdAt: Date.now()
          }
        })
      })
    })

    it('should update preview while dragging', () => {
      // Start drawing
      viewer.startDrawingTag(createMockMouseEvent(10, 10))

      // Simulate mouse move to trigger drag
      viewer.updateDrawingTag(createMockMouseEvent(15, 15))
      viewer.updateDrawingTag(createMockMouseEvent(50, 50))

      expect(viewer['isDragging']).toBe(true)
      expect(viewer.drawingPreview).toEqual({
        x: 10,
        y: 10,
        width: 40,
        height: 40
      })
    })

    it('should create tag on mouseup after dragging', async () => {
      // Start drawing
      viewer.startDrawingTag(createMockMouseEvent(10, 10))

      // Trigger drag by moving
      viewer.updateDrawingTag(createMockMouseEvent(15, 15))
      viewer.updateDrawingTag(createMockMouseEvent(50, 50))

      // Finish with mouseup
      viewer.finishDrawingTag(createMockMouseEvent(50, 50))

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/test1.jpg/face-tags',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    it('should handle bi-directional dragging', () => {
      // Start from bottom-right, drag to top-left
      viewer.startDrawingTag(createMockMouseEvent(50, 50))
      viewer.updateDrawingTag(createMockMouseEvent(45, 45))
      viewer.updateDrawingTag(createMockMouseEvent(10, 10))

      expect(viewer.drawingPreview).toEqual({
        x: 10,
        y: 10,
        width: 40,
        height: 40
      })
    })

    it('should not create tag if drag is too small', async () => {
      viewer.startDrawingTag(createMockMouseEvent(10, 10))
      viewer.updateDrawingTag(createMockMouseEvent(11, 11))
      viewer.finishDrawingTag(createMockMouseEvent(11, 11))

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Face Tag Management', () => {
    beforeEach(() => {
      viewer['currentFaceTags'] = [
        {
          id: 1,
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          personId: null,
          personName: '',
          confidence: 1.0,
          isManual: true,
          createdAt: Date.now()
        }
      ]
    })

    it('should remove face tag via API', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      await viewer.removeTag(1)

      expect(mockFetch).toHaveBeenCalledWith('/api/face-tags/1', {
        method: 'DELETE'
      })
      expect(viewer.faceTags).toHaveLength(0)
    })

    it('should assign person to face tag via API', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      await viewer.assignPersonToTag(1, 42, 'John Doe')

      expect(mockFetch).toHaveBeenCalledWith('/api/face-tags/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          personId: 42,
          confidence: 1.0
        })
      })

      expect(viewer.faceTags[0].personId).toBe(42)
      expect(viewer.faceTags[0].personName).toBe('John Doe')
    })

    it('should handle API errors gracefully during removal', async () => {
      mockFetch.mockResolvedValue({ ok: false, statusText: 'Not Found' })

      await viewer.removeTag(1)

      // Should not remove from local array if API fails
      expect(viewer.faceTags).toHaveLength(1)
    })

    it('should handle network errors gracefully during assignment', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await viewer.assignPersonToTag(1, 42, 'John Doe')

      // Should not update local data if API fails
      expect(viewer.faceTags[0].personId).toBe(null)
      expect(viewer.faceTags[0].personName).toBe('')
    })
  })

  describe('Face Tag Loading', () => {
    it('should load face tags from API when photo changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          faceTags: [
            {
              id: 1,
              x: 20,
              y: 20,
              width: 25,
              height: 25,
              personId: 1,
              personName: 'Jane Doe',
              confidence: 0.95,
              isManual: false,
              createdAt: Date.now()
            }
          ]
        })
      })

      await viewer['loadFaceTagsForCurrentPhoto']()

      expect(mockFetch).toHaveBeenCalledWith('/api/photos/test1.jpg/face-tags')
      expect(viewer.faceTags).toHaveLength(1)
      expect(viewer.faceTags[0].personName).toBe('Jane Doe')
    })

    it('should handle API errors during loading', async () => {
      mockFetch.mockResolvedValue({ ok: false, statusText: 'Server Error' })

      await viewer['loadFaceTagsForCurrentPhoto']()

      expect(viewer.faceTags).toHaveLength(0)
    })

    it('should reset drawing state when loading', async () => {
      viewer.toggleTaggingMode()
      viewer['isDrawingTag'] = true
      viewer['drawStartPos'] = { x: 10, y: 10, width: 5, height: 5 }

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ faceTags: [] })
      })

      await viewer['loadFaceTagsForCurrentPhoto']()

      expect(viewer.isTaggingMode).toBe(false)
      expect(viewer.isDrawing).toBe(false)
    })
  })

  describe('Coordinate Conversion', () => {
    it('should convert mouse coordinates to percentage-based coordinates', () => {
      const event = createMockMouseEvent(25, 75) // 25% right, 75% down

      const coordinates = viewer['convertEventToCoordinates'](event)

      expect(coordinates).toEqual({ x: 25, y: 75 })
    })

    it('should handle missing image element', () => {
      const event = new MouseEvent('click', { clientX: 50, clientY: 50 })
      const mockTarget = document.createElement('div')
      mockTarget.querySelector = vi.fn(() => null) // No img element

      Object.defineProperty(event, 'currentTarget', {
        value: mockTarget,
        configurable: true
      })

      const coordinates = viewer['convertEventToCoordinates'](event)

      expect(coordinates).toBe(null)
    })
  })

  describe('Regression Prevention', () => {
    it('should not break when switching photos rapidly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ faceTags: [] })
      })

      // Simulate rapid photo switching
      await viewer.openFullScreen(1)
      await viewer.nextPhoto()
      await viewer.previousPhoto()

      expect(viewer.currentPhoto?.id).toBe(1)
      expect(() => viewer.toggleTaggingMode()).not.toThrow()
    })

    it('should maintain drawing state consistency during errors', async () => {
      viewer.toggleTaggingMode()
      viewer.startDrawingTag(createMockMouseEvent(10, 10))

      mockFetch.mockRejectedValue(new Error('Network error'))

      // This should not throw even if API fails
      viewer.startDrawingTag(createMockMouseEvent(40, 40))

      await new Promise(resolve => setTimeout(resolve, 0))

      // Should still be in drawing mode waiting for user action
      expect(viewer.isTaggingMode).toBe(true)
    })

    it('should handle invalid tag IDs gracefully', async () => {
      await viewer.removeTag(999) // Non-existent tag
      await viewer.assignPersonToTag(999, 1, 'Test')

      // Should not throw or make API calls
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
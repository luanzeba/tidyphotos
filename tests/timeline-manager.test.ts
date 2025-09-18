import { describe, it, expect, beforeEach } from 'vitest'
import { TimelineManager } from '../src/frontend/timeline-manager'
import type { Photo } from '../src/frontend/types'

describe('TimelineManager', () => {
  let timelineManager: TimelineManager
  let mockPhotos: Photo[]

  beforeEach(() => {
    timelineManager = new TimelineManager()

    // Create test photos with various dates and tags
    mockPhotos = [
      {
        id: 1,
        name: 'vacation1.jpg',
        thumbnail: '/thumbnails/vacation1.jpg',
        date: '2023-07-15T10:00:00Z',
        favorite: false,
        tags: ['vacation', 'beach']
      },
      {
        id: 2,
        name: 'family2.jpg',
        thumbnail: '/thumbnails/family2.jpg',
        date: '2023-07-20T14:30:00Z',
        favorite: true,
        tags: ['family', 'birthday']
      },
      {
        id: 3,
        name: 'work3.jpg',
        thumbnail: '/thumbnails/work3.jpg',
        date: '2022-12-01T09:15:00Z',
        favorite: false,
        tags: ['work', 'conference']
      },
      {
        id: 4,
        name: 'holiday4.jpg',
        thumbnail: '/thumbnails/holiday4.jpg',
        date: '2023-12-25T16:45:00Z',
        favorite: true,
        tags: ['holiday', 'family']
      }
    ]
  })

  describe('year filtering', () => {
    it('should extract unique years from photos', () => {
      const years = timelineManager.getYears(mockPhotos)
      expect(years).toEqual([2023, 2022]) // Should be sorted descending
    })

    it('should return empty array when no photos provided', () => {
      const years = timelineManager.getYears([])
      expect(years).toEqual([])
    })
  })

  describe('month filtering', () => {
    it('should extract months for a specific year', () => {
      const months = timelineManager.getMonths(mockPhotos, 2023)
      expect(months).toHaveLength(2)
      expect(months[0]).toEqual({ number: 11, name: 'December' }) // December (month 11)
      expect(months[1]).toEqual({ number: 6, name: 'July' }) // July (month 6)
    })

    it('should return empty array when no year selected', () => {
      const months = timelineManager.getMonths(mockPhotos, null)
      expect(months).toEqual([])
    })

    it('should return empty array when year has no photos', () => {
      const months = timelineManager.getMonths(mockPhotos, 2021)
      expect(months).toEqual([])
    })
  })

  describe('photo filtering', () => {
    it('should return all photos when no filters applied', () => {
      const filtered = timelineManager.filterPhotos(mockPhotos, '')
      expect(filtered).toHaveLength(4)
      // Should be sorted by date descending (newest first)
      expect(filtered[0].name).toBe('holiday4.jpg') // 2023-12-25
      expect(filtered[1].name).toBe('family2.jpg')  // 2023-07-20
      expect(filtered[2].name).toBe('vacation1.jpg') // 2023-07-15
      expect(filtered[3].name).toBe('work3.jpg')     // 2022-12-01
    })

    it('should filter by search query in photo names', () => {
      const filtered = timelineManager.filterPhotos(mockPhotos, 'family2')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('family2.jpg')
    })

    it('should filter by search query in tags', () => {
      const filtered = timelineManager.filterPhotos(mockPhotos, 'beach')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('vacation1.jpg')
    })

    it('should be case insensitive when searching', () => {
      const filtered = timelineManager.filterPhotos(mockPhotos, 'VACATION')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('vacation1.jpg')
    })

    it('should filter by selected year only', () => {
      timelineManager.selectYear(2023)
      const filtered = timelineManager.filterPhotos(mockPhotos, '')
      expect(filtered).toHaveLength(3)
      expect(filtered.every(photo => new Date(photo.date).getFullYear() === 2023)).toBe(true)
    })

    it('should filter by selected year and month', () => {
      timelineManager.selectYear(2023)
      timelineManager.selectMonth(6) // July (0-indexed)
      const filtered = timelineManager.filterPhotos(mockPhotos, '')
      expect(filtered).toHaveLength(2)
      expect(filtered.every(photo => {
        const date = new Date(photo.date)
        return date.getFullYear() === 2023 && date.getMonth() === 6
      })).toBe(true)
    })

    it('should search in both photo names and tags', () => {
      // 'family' should match both family2.jpg (name) and holiday4.jpg (tag)
      const filtered = timelineManager.filterPhotos(mockPhotos, 'family')
      expect(filtered).toHaveLength(2)
      expect(filtered.map(p => p.name).sort()).toEqual(['family2.jpg', 'holiday4.jpg'])
    })

    it('should combine search query with timeline filters', () => {
      timelineManager.selectYear(2023)
      const filtered = timelineManager.filterPhotos(mockPhotos, 'family')
      expect(filtered).toHaveLength(2) // family2.jpg and holiday4.jpg (both have 'family' tag and are from 2023)
    })
  })

  describe('selection management', () => {
    it('should select year and clear month', () => {
      timelineManager.selectMonth(5)
      expect(timelineManager.currentSelectedMonth).toBe(5)

      timelineManager.selectYear(2023)
      expect(timelineManager.currentSelectedYear).toBe(2023)
      expect(timelineManager.currentSelectedMonth).toBe(null)
    })

    it('should select month when year is already selected', () => {
      timelineManager.selectYear(2023)
      timelineManager.selectMonth(6)
      expect(timelineManager.currentSelectedYear).toBe(2023)
      expect(timelineManager.currentSelectedMonth).toBe(6)
    })

    it('should clear all filters', () => {
      timelineManager.selectYear(2023)
      timelineManager.selectMonth(6)

      timelineManager.clearFilters()
      expect(timelineManager.currentSelectedYear).toBe(null)
      expect(timelineManager.currentSelectedMonth).toBe(null)
    })
  })

  describe('mobile view management', () => {
    it('should set mobile view and clear filters when set to "all"', () => {
      timelineManager.selectYear(2023)
      timelineManager.selectMonth(6)

      timelineManager.setMobileView('all')
      expect(timelineManager.currentMobileView).toBe('all')
      expect(timelineManager.currentSelectedYear).toBe(null)
      expect(timelineManager.currentSelectedMonth).toBe(null)
    })

    it('should set mobile view without clearing filters when not "all"', () => {
      timelineManager.selectYear(2023)
      timelineManager.selectMonth(6)

      timelineManager.setMobileView('years')
      expect(timelineManager.currentMobileView).toBe('years')
      expect(timelineManager.currentSelectedYear).toBe(2023)
      expect(timelineManager.currentSelectedMonth).toBe(6)
    })
  })
})
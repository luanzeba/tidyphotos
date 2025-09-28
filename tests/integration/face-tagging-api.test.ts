import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Integration tests for face tagging API endpoints
// These tests ensure the API contract doesn't break

const API_BASE = 'http://127.0.0.1:8080'

describe('Face Tagging API Integration', () => {
  let testPhotoName: string
  let createdTagIds: number[] = []

  beforeEach(() => {
    testPhotoName = 'test1.jpg' // Use a photo that should exist in test data
    createdTagIds = []
  })

  afterEach(async () => {
    // Clean up any tags we created during tests
    for (const tagId of createdTagIds) {
      try {
        await fetch(`${API_BASE}/api/face-tags/${tagId}`, {
          method: 'DELETE'
        })
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  describe('GET /api/photos/:filename/face-tags', () => {
    it('should return face tags for a photo', async () => {
      const response = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('faceTags')
      expect(Array.isArray(data.faceTags)).toBe(true)
    })

    it('should handle URL encoding for photo names with special characters', async () => {
      const specialPhotoName = 'test photo with spaces & symbols.jpg'
      const response = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(specialPhotoName)}/face-tags`)

      // Should not return 404 due to encoding issues (even if photo doesn't exist)
      expect(response.status).toBe(200)
    })

    it('should return empty array for non-existent photo', async () => {
      const response = await fetch(`${API_BASE}/api/photos/nonexistent.jpg/face-tags`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.faceTags).toEqual([])
    })
  })

  describe('POST /api/photos/:filename/face-tags', () => {
    it('should create a new face tag', async () => {
      const tagData = {
        x: 10.5,
        y: 20.3,
        width: 30.7,
        height: 40.2,
        personId: null,
        confidence: 1.0,
        isManual: true
      }

      const response = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tagData)
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data).toHaveProperty('faceTag')
      expect(data.faceTag).toMatchObject({
        x: tagData.x,
        y: tagData.y,
        width: tagData.width,
        height: tagData.height,
        confidence: tagData.confidence,
        isManual: tagData.isManual
      })
      expect(data.faceTag).toHaveProperty('id')
      expect(data.faceTag).toHaveProperty('createdAt')

      // Track for cleanup
      createdTagIds.push(data.faceTag.id)
    })

    it('should validate required fields', async () => {
      const invalidTagData = {
        x: 10,
        // Missing required fields
      }

      const response = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidTagData)
      })

      expect(response.status).toBe(400)
    })

    it('should handle coordinate validation', async () => {
      const invalidCoords = {
        x: -10,  // Invalid negative coordinate
        y: 150,  // Invalid > 100%
        width: 30,
        height: 40,
        personId: null,
        confidence: 1.0,
        isManual: true
      }

      const response = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidCoords)
      })

      expect(response.status).toBe(400)
    })
  })

  describe('PUT /api/face-tags/:id', () => {
    let testTagId: number

    beforeEach(async () => {
      // Create a test tag first
      const tagData = {
        x: 15,
        y: 25,
        width: 35,
        height: 45,
        personId: null,
        confidence: 1.0,
        isManual: true
      }

      const response = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tagData)
      })

      const data = await response.json()
      testTagId = data.faceTag.id
      createdTagIds.push(testTagId)
    })

    it('should update face tag coordinates and person assignment', async () => {
      const updateData = {
        x: 20,
        y: 30,
        width: 40,
        height: 50,
        personId: 1,
        confidence: 0.95
      }

      const response = await fetch(`${API_BASE}/api/face-tags/${testTagId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      expect(response.status).toBe(200)

      // Verify the update by fetching the photo's tags
      const getResponse = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`)
      const getData = await getResponse.json()

      const updatedTag = getData.faceTags.find((tag: any) => tag.id === testTagId)
      expect(updatedTag).toMatchObject(updateData)
    })

    it('should return 404 for non-existent tag ID', async () => {
      const updateData = {
        x: 20,
        y: 30,
        width: 40,
        height: 50,
        personId: 1,
        confidence: 0.95
      }

      const response = await fetch(`${API_BASE}/api/face-tags/99999`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      expect(response.status).toBe(404)
    })

    it('should validate update data', async () => {
      const invalidUpdate = {
        x: 'invalid',  // Should be number
        y: 30,
        width: 40,
        height: 50
      }

      const response = await fetch(`${API_BASE}/api/face-tags/${testTagId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidUpdate)
      })

      expect(response.status).toBe(400)
    })
  })

  describe('DELETE /api/face-tags/:id', () => {
    let testTagId: number

    beforeEach(async () => {
      // Create a test tag first
      const tagData = {
        x: 15,
        y: 25,
        width: 35,
        height: 45,
        personId: null,
        confidence: 1.0,
        isManual: true
      }

      const response = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tagData)
      })

      const data = await response.json()
      testTagId = data.faceTag.id
    })

    it('should delete a face tag', async () => {
      const response = await fetch(`${API_BASE}/api/face-tags/${testTagId}`, {
        method: 'DELETE'
      })

      expect(response.status).toBe(200)

      // Verify deletion by checking it's no longer in the photo's tags
      const getResponse = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`)
      const getData = await getResponse.json()

      const deletedTag = getData.faceTags.find((tag: any) => tag.id === testTagId)
      expect(deletedTag).toBeUndefined()
    })

    it('should return 404 for non-existent tag ID', async () => {
      const response = await fetch(`${API_BASE}/api/face-tags/99999`, {
        method: 'DELETE'
      })

      expect(response.status).toBe(404)
    })

    it('should handle deletion of already deleted tag gracefully', async () => {
      // Delete once
      await fetch(`${API_BASE}/api/face-tags/${testTagId}`, {
        method: 'DELETE'
      })

      // Try to delete again
      const response = await fetch(`${API_BASE}/api/face-tags/${testTagId}`, {
        method: 'DELETE'
      })

      expect(response.status).toBe(404)
    })
  })

  describe('Data Persistence', () => {
    it('should persist face tags across API calls', async () => {
      // Create a tag
      const tagData = {
        x: 25,
        y: 35,
        width: 45,
        height: 55,
        personId: null,
        confidence: 1.0,
        isManual: true
      }

      const createResponse = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tagData)
      })

      const createData = await createResponse.json()
      const tagId = createData.faceTag.id
      createdTagIds.push(tagId)

      // Retrieve tags and verify persistence
      const getResponse = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`)
      const getData = await getResponse.json()

      const persistedTag = getData.faceTags.find((tag: any) => tag.id === tagId)
      expect(persistedTag).toMatchObject({
        id: tagId,
        x: tagData.x,
        y: tagData.y,
        width: tagData.width,
        height: tagData.height,
        confidence: tagData.confidence,
        isManual: tagData.isManual
      })
    })

    it('should maintain foreign key relationships with people', async () => {
      // First ensure we have a person to associate
      const peopleResponse = await fetch(`${API_BASE}/api/people`)
      const peopleData = await peopleResponse.json()

      if (peopleData.people.length === 0) {
        // Create a test person
        await fetch(`${API_BASE}/api/people`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: 'Test Person' })
        })
      }

      // Get updated people list
      const updatedPeopleResponse = await fetch(`${API_BASE}/api/people`)
      const updatedPeopleData = await updatedPeopleResponse.json()
      const testPerson = updatedPeopleData.people[0]

      // Create tag with person assignment
      const tagData = {
        x: 30,
        y: 40,
        width: 50,
        height: 60,
        personId: testPerson.id,
        confidence: 0.9,
        isManual: true
      }

      const createResponse = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tagData)
      })

      const createData = await createResponse.json()
      createdTagIds.push(createData.faceTag.id)

      // Verify person name is included in the response
      const getResponse = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(testPhotoName)}/face-tags`)
      const getData = await getResponse.json()

      const tagWithPerson = getData.faceTags.find((tag: any) => tag.id === createData.faceTag.id)
      expect(tagWithPerson.personId).toBe(testPerson.id)
      expect(tagWithPerson.personName).toBe(testPerson.name)
    })
  })
})
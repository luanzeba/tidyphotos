package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/vieira/tidyphotos/internal/db"
	"github.com/vieira/tidyphotos/internal/importer"
)

func main() {
	// Configuration
	port := getEnv("PORT", "8080")
	photosDir := getEnv("PHOTOS_DIR", "test_photos")
	cacheDir := getEnv("CACHE_DIR", "cache")

	log.Printf("🚀 TidyPhotos Server Starting...")
	log.Printf("   Photos: %s", photosDir)
	log.Printf("   Cache: %s", cacheDir)

	// Ensure cache directory exists
	thumbDir := filepath.Join(cacheDir, "thumbnails")
	if err := os.MkdirAll(thumbDir, 0755); err != nil {
		log.Fatal(err)
	}

	// Open database
	dbPath := getEnv("DB_PATH", "photos.db")
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	log.Printf("   Database: %s", dbPath)

	// Run photo import on startup
	log.Printf("\n⚡ Scanning photo library...")
	imp := importer.New(database, photosDir, thumbDir)
	if err := imp.ScanAndImport(); err != nil {
		log.Printf("⚠️  Import warning: %v", err)
	}

	// Setup routes
	mux := http.NewServeMux()

	// Static files
	mux.Handle("/", http.FileServer(http.Dir("public")))
	mux.Handle("/js/", http.FileServer(http.Dir("public")))
	mux.Handle("/styles/", http.FileServer(http.Dir("public")))

	// API routes
	mux.HandleFunc("/api/photos", listPhotos(database))
	mux.HandleFunc("/api/people", handlePeople(database))
	mux.HandleFunc("/api/people/", handlePersonActions(database))
	mux.HandleFunc("/api/face-tags", handleFaceTags(database))
	mux.HandleFunc("/api/face-tags/", handleFaceTagActions(database))

	// Thumbnail serving (instant, filesystem-based)
	mux.HandleFunc("/api/thumbnails/", serveThumbnail(thumbDir))

	// Photo serving (instant, filesystem-based)
	mux.HandleFunc("/api/photos/", servePhoto(photosDir))

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "OK")
	})

	addr := fmt.Sprintf(":%s", port)
	log.Printf("✅ Server ready!")
	log.Printf("   Local:   http://127.0.0.1:%s", port)
	log.Printf("   Network: http://192.168.1.201:%s\n", port)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

// serveThumbnail serves pre-generated 284px WebP thumbnails
func serveThumbnail(thumbDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract photo ID from path /api/thumbnails/{id}
		photoID := r.URL.Path[len("/api/thumbnails/"):]

		thumbPath := filepath.Join(thumbDir, photoID+".webp")

		// Check if thumbnail exists
		if _, err := os.Stat(thumbPath); os.IsNotExist(err) {
			http.Error(w, "Thumbnail not found", http.StatusNotFound)
			return
		}

		// Serve with aggressive caching (1 year)
		w.Header().Set("Content-Type", "image/webp")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

		http.ServeFile(w, r, thumbPath)
	}
}

// servePhoto serves full-size photos directly from filesystem
func servePhoto(photosDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract photo path from /api/photos/{id}/full or /api/photos/{filename}
		photoPath := r.URL.Path[len("/api/photos/"):]

		fullPath := filepath.Join(photosDir, photoPath)

		// Security: ensure path is within photosDir
		if !isPathSafe(fullPath, photosDir) {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		// Check if file exists
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			http.Error(w, "Photo not found", http.StatusNotFound)
			return
		}

		// Detect content type from extension
		contentType := "image/jpeg"
		ext := filepath.Ext(fullPath)
		switch ext {
		case ".png":
			contentType = "image/png"
		case ".heic", ".HEIC":
			contentType = "image/heic"
		case ".webp":
			contentType = "image/webp"
		}

		// Serve with moderate caching (1 day)
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "public, max-age=86400")

		http.ServeFile(w, r, fullPath)
	}
}

// isPathSafe checks if a path is within the allowed directory
func isPathSafe(path, baseDir string) bool {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false
	}

	absBase, err := filepath.Abs(baseDir)
	if err != nil {
		return false
	}

	rel, err := filepath.Rel(absBase, absPath)
	if err != nil {
		return false
	}

	// Check if path escapes the base directory
	return !filepath.IsAbs(rel) && len(rel) > 0 && rel[0] != '.'
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// listPhotos returns JSON list of all photos
func listPhotos(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		photos, err := database.GetPhotos()
		if err != nil {
			http.Error(w, "Failed to get photos", http.StatusInternalServerError)
			log.Printf("Error getting photos: %v", err)
			return
		}

		// Convert to JSON-friendly format matching frontend expectations
		type PhotoResponse struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`      // Frontend expects 'name' not 'filename'
			Thumbnail string `json:"thumbnail"` // Frontend expects 'thumbnail' not 'thumbnail_url'
			Date      string `json:"date"`      // Frontend expects ISO date string
			Favorite  bool   `json:"favorite"`
			Tags      []string `json:"tags,omitempty"`
		}

		response := make([]PhotoResponse, len(photos))
		for i, photo := range photos {
			// Convert Unix timestamp to ISO 8601 date string
			dateTime := time.Unix(photo.ImportedAt, 0)

			response[i] = PhotoResponse{
				ID:        photo.ID,
				Name:      photo.Filename,
				Thumbnail: fmt.Sprintf("/api/thumbnails/%d", photo.ID),
				Date:      dateTime.Format(time.RFC3339),
				Favorite:  photo.Favorite,
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// handlePeople handles GET (list) and POST (create) for people
func handlePeople(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			people, err := database.GetPeople()
			if err != nil {
				http.Error(w, "Failed to get people", http.StatusInternalServerError)
				return
			}

			type PersonResponse struct {
				ID        int64  `json:"id"`
				Name      string `json:"name"`
				CreatedAt int64  `json:"created_at"`
			}

			response := make([]PersonResponse, len(people))
			for i, person := range people {
				response[i] = PersonResponse{
					ID:        person.ID,
					Name:      person.Name,
					CreatedAt: person.CreatedAt,
				}
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)

		case "POST":
			var req struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid request", http.StatusBadRequest)
				return
			}

			if req.Name == "" {
				http.Error(w, "Name is required", http.StatusBadRequest)
				return
			}

			id, err := database.InsertPerson(req.Name)
			if err != nil {
				http.Error(w, "Failed to create person", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id":   id,
				"name": req.Name,
			})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// handlePersonActions handles PUT (update) and DELETE for specific people
func handlePersonActions(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract person ID from path /api/people/{id}
		idStr := r.URL.Path[len("/api/people/"):]
		var personID int64
		if _, err := fmt.Sscanf(idStr, "%d", &personID); err != nil {
			http.Error(w, "Invalid person ID", http.StatusBadRequest)
			return
		}

		switch r.Method {
		case "PUT":
			var req struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid request", http.StatusBadRequest)
				return
			}

			if req.Name == "" {
				http.Error(w, "Name is required", http.StatusBadRequest)
				return
			}

			if err := database.UpdatePerson(personID, req.Name); err != nil {
				http.Error(w, "Failed to update person", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id":   personID,
				"name": req.Name,
			})

		case "DELETE":
			if err := database.DeletePerson(personID); err != nil {
				http.Error(w, "Failed to delete person", http.StatusInternalServerError)
				return
			}

			w.WriteHeader(http.StatusNoContent)

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// handleFaceTags handles GET (list by photo) and POST (create)
func handleFaceTags(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			// Get face tags for a specific photo
			photoFilename := r.URL.Query().Get("photo")
			if photoFilename == "" {
				http.Error(w, "photo parameter required", http.StatusBadRequest)
				return
			}

			tags, err := database.GetFaceTagsForPhoto(photoFilename)
			if err != nil {
				http.Error(w, "Failed to get face tags", http.StatusInternalServerError)
				return
			}

			type FaceTagResponse struct {
				ID            int64   `json:"id"`
				PhotoFilename string  `json:"photo_filename"`
				PersonID      *int64  `json:"person_id,omitempty"`
				X             float64 `json:"x"`
				Y             float64 `json:"y"`
				Width         float64 `json:"width"`
				Height        float64 `json:"height"`
				Confidence    float64 `json:"confidence"`
				IsManual      bool    `json:"is_manual"`
			}

			response := make([]FaceTagResponse, len(tags))
			for i, tag := range tags {
				response[i] = FaceTagResponse{
					ID:            tag.ID,
					PhotoFilename: tag.PhotoFilename,
					X:             tag.X,
					Y:             tag.Y,
					Width:         tag.Width,
					Height:        tag.Height,
					Confidence:    tag.Confidence,
					IsManual:      tag.IsManual,
				}
				if tag.PersonID.Valid {
					response[i].PersonID = &tag.PersonID.Int64
				}
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)

		case "POST":
			var req struct {
				PhotoFilename string  `json:"photo_filename"`
				PersonID      *int64  `json:"person_id,omitempty"`
				X             float64 `json:"x"`
				Y             float64 `json:"y"`
				Width         float64 `json:"width"`
				Height        float64 `json:"height"`
				Confidence    float64 `json:"confidence"`
				IsManual      bool    `json:"is_manual"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid request", http.StatusBadRequest)
				return
			}

			if req.PhotoFilename == "" {
				http.Error(w, "photo_filename is required", http.StatusBadRequest)
				return
			}

			// Default confidence to 1.0 if not provided
			if req.Confidence == 0 {
				req.Confidence = 1.0
			}

			id, err := database.InsertFaceTag(
				req.PhotoFilename,
				req.PersonID,
				req.X, req.Y,
				req.Width, req.Height,
				req.Confidence,
				req.IsManual,
			)
			if err != nil {
				http.Error(w, "Failed to create face tag", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id": id,
			})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// handleFaceTagActions handles PUT (update) and DELETE for specific face tags
func handleFaceTagActions(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract face tag ID from path /api/face-tags/{id}
		idStr := r.URL.Path[len("/api/face-tags/"):]
		var tagID int64
		if _, err := fmt.Sscanf(idStr, "%d", &tagID); err != nil {
			http.Error(w, "Invalid face tag ID", http.StatusBadRequest)
			return
		}

		switch r.Method {
		case "PUT":
			var req struct {
				PersonID   *int64  `json:"person_id,omitempty"`
				X          float64 `json:"x"`
				Y          float64 `json:"y"`
				Width      float64 `json:"width"`
				Height     float64 `json:"height"`
				Confidence float64 `json:"confidence"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid request", http.StatusBadRequest)
				return
			}

			if err := database.UpdateFaceTag(tagID, req.PersonID, req.X, req.Y, req.Width, req.Height, req.Confidence); err != nil {
				http.Error(w, "Failed to update face tag", http.StatusInternalServerError)
				return
			}

			w.WriteHeader(http.StatusOK)

		case "DELETE":
			if err := database.DeleteFaceTag(tagID); err != nil {
				http.Error(w, "Failed to delete face tag", http.StatusInternalServerError)
				return
			}

			w.WriteHeader(http.StatusNoContent)

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

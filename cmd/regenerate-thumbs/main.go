package main

import (
	"log"
	"os"

	"github.com/vieira/tidyphotos/internal/db"
	"github.com/vieira/tidyphotos/internal/importer"
)

func main() {
	// Configuration
	photosDir := getEnv("PHOTOS_DIR", "test_photos")
	cacheDir := getEnv("CACHE_DIR", "cache")
	dbPath := getEnv("DB_PATH", "photos.db")

	log.Printf("🔄 Regenerating thumbnails...")
	log.Printf("   Photos: %s", photosDir)
	log.Printf("   Cache: %s", cacheDir)
	log.Printf("   Database: %s", dbPath)

	// Open database
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	// Get all photos
	photos, err := database.GetPhotos()
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("\n📸 Found %d photos to process\n", len(photos))

	thumbDir := cacheDir + "/thumbnails"
	os.MkdirAll(thumbDir, 0755)

	// Regenerate thumbnails
	for i, photo := range photos {
		thumbPath := thumbDir + "/" + string(rune(photo.ID)) + ".webp"

		log.Printf("[%d/%d] Generating thumbnail for %s (ID: %d)",
			i+1, len(photos), photo.Filename, photo.ID)

		if err := importer.GenerateThumbnail(photo.Path, thumbPath); err != nil {
			log.Printf("  ⚠️  Failed: %v", err)
		}
	}

	log.Printf("\n✅ Thumbnail regeneration complete!")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

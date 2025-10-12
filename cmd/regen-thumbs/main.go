package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/vieira/tidyphotos/internal/db"
	"github.com/vieira/tidyphotos/internal/importer"
)

func main() {
	cacheDir := getEnv("CACHE_DIR", "cache")
	dbPath := getEnv("DB_PATH", "photos.db")

	log.Printf("🔄 Regenerating thumbnails...")

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	photos, err := database.GetPhotos()
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("📸 Processing %d photos\n", len(photos))

	thumbDir := filepath.Join(cacheDir, "thumbnails")
	os.MkdirAll(thumbDir, 0755)

	success := 0
	for i, photo := range photos {
		thumbPath := filepath.Join(thumbDir, fmt.Sprintf("%d.webp", photo.ID))

		log.Printf("[%d/%d] %s", i+1, len(photos), photo.Filename)

		if err := importer.GenerateThumbnail(photo.Path, thumbPath); err != nil {
			log.Printf("  ⚠️  Error: %v", err)
		} else {
			success++
		}
	}

	log.Printf("\n✅ Done! Successfully regenerated %d/%d thumbnails", success, len(photos))
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

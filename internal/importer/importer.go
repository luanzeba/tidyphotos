package importer

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/vieira/tidyphotos/internal/db"
)

type Importer struct {
	db        *db.DB
	photosDir string
	thumbsDir string
}

func New(database *db.DB, photosDir, thumbsDir string) *Importer {
	return &Importer{
		db:        database,
		photosDir: photosDir,
		thumbsDir: thumbsDir,
	}
}

// EXIFData represents the EXIF metadata we care about
type EXIFData struct {
	DateTimeOriginal string      `json:"DateTimeOriginal"`
	CreateDate       string      `json:"CreateDate"`
	Make             string      `json:"Make"`
	Model            string      `json:"Model"`
	LensModel        string      `json:"LensModel"`
	ISO              int         `json:"ISO"`
	FNumber          interface{} `json:"FNumber"` // Can be string or number
	ExposureTime     string      `json:"ExposureTime"`
	FocalLength      string      `json:"FocalLength"`
}

// ScanAndImport scans the photos directory and imports new photos
func (imp *Importer) ScanAndImport() error {
	log.Printf("📂 Scanning photos directory: %s", imp.photosDir)

	// Get existing photos from database
	existingPhotos, err := imp.db.GetPhotos()
	if err != nil {
		return fmt.Errorf("failed to get existing photos: %w", err)
	}

	// Create a map for quick lookup
	existing := make(map[string]bool)
	for _, photo := range existingPhotos {
		existing[photo.Filename] = true
	}

	// Walk through photos directory
	var newPhotos int
	var thumbnailsGenerated int

	err = filepath.Walk(imp.photosDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories
		if info.IsDir() {
			return nil
		}

		// Check if it's an image file
		if !isImageFile(path) {
			return nil
		}

		filename := info.Name()

		// Skip if already imported
		if existing[filename] {
			return nil
		}

		// Extract EXIF data
		exifData, err := extractEXIF(path)
		if err != nil {
			log.Printf("⚠️  Failed to extract EXIF from %s: %v", filename, err)
		}

		// Convert EXIF to JSON
		var metadataJSON *string
		if exifData != nil {
			jsonBytes, err := json.Marshal(exifData)
			if err == nil {
				jsonStr := string(jsonBytes)
				metadataJSON = &jsonStr
			}
		}

		// Insert into database
		photoID, err := imp.db.InsertPhoto(path, filename, metadataJSON)
		if err != nil {
			log.Printf("❌ Failed to import %s: %v", filename, err)
			return nil
		}

		newPhotos++
		log.Printf("  📷 Imported: %s (ID: %d)", filename, photoID)

		// Generate thumbnail
		thumbPath := filepath.Join(imp.thumbsDir, fmt.Sprintf("%d.webp", photoID))
		if err := GenerateThumbnail(path, thumbPath); err != nil {
			log.Printf("⚠️  Failed to generate thumbnail for %s: %v", filename, err)
		} else {
			thumbnailsGenerated++
		}

		return nil
	})

	if err != nil {
		return fmt.Errorf("failed to walk directory: %w", err)
	}

	log.Printf("\n✅ Import complete:")
	log.Printf("   New photos: %d", newPhotos)
	log.Printf("   Thumbnails generated: %d", thumbnailsGenerated)

	return nil
}

// extractEXIF uses exiftool to extract EXIF data from a photo
func extractEXIF(photoPath string) (*EXIFData, error) {
	cmd := exec.Command("exiftool",
		"-DateTimeOriginal",
		"-CreateDate",
		"-Make",
		"-Model",
		"-LensModel",
		"-ISO",
		"-FNumber",
		"-ExposureTime",
		"-FocalLength",
		"-json",
		photoPath,
	)

	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	// exiftool returns an array with one object
	var result []EXIFData
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, err
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("no EXIF data found")
	}

	return &result[0], nil
}

// GenerateThumbnail creates a 284px WebP thumbnail using vips or sips
func GenerateThumbnail(sourcePath, destPath string) error {
	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}

	// Try vipsthumbnail first (fastest)
	if err := generateWithVips(sourcePath, destPath); err == nil {
		return nil
	}

	// Fallback to sips + cwebp (macOS)
	return generateWithSips(sourcePath, destPath)
}

// generateWithVips uses vips thumbnail for fast WebP generation with auto-rotation
func generateWithVips(sourcePath, destPath string) error {
	// vips thumbnail auto-rotates based on EXIF orientation by default
	// The [Q=85,strip] output options compress and strip EXIF after rotation
	cmd := exec.Command("vips",
		"thumbnail",
		sourcePath,
		fmt.Sprintf("%s[Q=85,strip]", destPath),
		"284",
	)

	return cmd.Run()
}

// generateWithSips uses macOS sips + cwebp as fallback
func generateWithSips(sourcePath, destPath string) error {
	// Create temp JPEG
	tempJPG := destPath + ".tmp.jpg"
	defer os.Remove(tempJPG)

	// Convert to JPEG with sips
	cmd := exec.Command("sips",
		"-s", "format", "jpeg",
		"-Z", "284",
		"--out", tempJPG,
		sourcePath,
	)
	if err := cmd.Run(); err != nil {
		return err
	}

	// Auto-rotate
	cmd = exec.Command("sips", "--rotate", "auto", tempJPG)
	cmd.Run() // Ignore errors

	// Convert to WebP
	cmd = exec.Command("cwebp",
		"-q", "85",
		"-m", "4",
		tempJPG,
		"-o", destPath,
	)

	return cmd.Run()
}

// isImageFile checks if a file is a supported image format
func isImageFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".heic", ".webp":
		return true
	}
	return false
}

// ImportStats returns import statistics
func (imp *Importer) ImportStats() (map[string]interface{}, error) {
	photos, err := imp.db.GetPhotos()
	if err != nil {
		return nil, err
	}

	stats := map[string]interface{}{
		"total_photos":   len(photos),
		"last_import":    time.Now().Unix(),
		"thumbnails_dir": imp.thumbsDir,
	}

	return stats, nil
}

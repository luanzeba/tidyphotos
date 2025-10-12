package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite" // Pure Go SQLite driver
)

type DB struct {
	*sql.DB
}

// Open opens a connection to the SQLite database and initializes schema
func Open(dbPath string) (*DB, error) {
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db := &DB{sqlDB}

	// Initialize schema
	if err := db.initSchema(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return db, nil
}

func (db *DB) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS photos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		path TEXT NOT NULL UNIQUE,
		filename TEXT NOT NULL,
		imported_at INTEGER NOT NULL,
		favorite BOOLEAN DEFAULT FALSE,
		metadata_json TEXT,
		thumbnail_path TEXT
	);

	CREATE TABLE IF NOT EXISTS albums (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		directory_path TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		description TEXT
	);

	CREATE TABLE IF NOT EXISTS people (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		face_encodings TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS photo_people (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		photo_id INTEGER NOT NULL,
		person_id INTEGER NOT NULL,
		confidence REAL DEFAULT 1.0,
		confirmed BOOLEAN DEFAULT FALSE,
		created_at INTEGER NOT NULL,
		FOREIGN KEY (photo_id) REFERENCES photos (id),
		FOREIGN KEY (person_id) REFERENCES people (id),
		UNIQUE (photo_id, person_id)
	);

	CREATE TABLE IF NOT EXISTS face_tags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		photo_filename TEXT NOT NULL,
		person_id INTEGER,
		x REAL NOT NULL,
		y REAL NOT NULL,
		width REAL NOT NULL,
		height REAL NOT NULL,
		confidence REAL DEFAULT 1.0,
		is_manual BOOLEAN DEFAULT TRUE,
		created_at INTEGER NOT NULL,
		FOREIGN KEY (person_id) REFERENCES people (id)
	);

	CREATE TABLE IF NOT EXISTS import_status (
		id INTEGER PRIMARY KEY,
		last_scan INTEGER NOT NULL,
		photos_imported INTEGER DEFAULT 0,
		last_import_path TEXT
	);

	-- Indexes for performance
	CREATE INDEX IF NOT EXISTS idx_photos_path ON photos (path);
	CREATE INDEX IF NOT EXISTS idx_photos_imported_at ON photos (imported_at);
	CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos (favorite);
	CREATE INDEX IF NOT EXISTS idx_photo_people_photo_id ON photo_people (photo_id);
	CREATE INDEX IF NOT EXISTS idx_photo_people_person_id ON photo_people (person_id);
	CREATE INDEX IF NOT EXISTS idx_face_tags_photo_filename ON face_tags (photo_filename);
	CREATE INDEX IF NOT EXISTS idx_face_tags_person_id ON face_tags (person_id);
	`

	_, err := db.Exec(schema)
	return err
}

// Photo represents a photo in the database
type Photo struct {
	ID            int64
	Path          string
	Filename      string
	ImportedAt    int64
	Favorite      bool
	MetadataJSON  sql.NullString
	ThumbnailPath sql.NullString
}

// Person represents a person for face tagging
type Person struct {
	ID            int64
	Name          string
	FaceEncodings sql.NullString
	CreatedAt     int64
}

// FaceTag represents a face tag on a photo
type FaceTag struct {
	ID            int64
	PhotoFilename string
	PersonID      sql.NullInt64
	X             float64
	Y             float64
	Width         float64
	Height        float64
	Confidence    float64
	IsManual      bool
	CreatedAt     int64
}

// InsertPhoto inserts a new photo into the database
func (db *DB) InsertPhoto(path, filename string, metadataJSON *string) (int64, error) {
	now := time.Now().Unix()

	var meta sql.NullString
	if metadataJSON != nil {
		meta = sql.NullString{String: *metadataJSON, Valid: true}
	}

	result, err := db.Exec(
		"INSERT INTO photos (path, filename, imported_at, metadata_json) VALUES (?, ?, ?, ?)",
		path, filename, now, meta,
	)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

// GetPhotos retrieves all photos ordered by import time
func (db *DB) GetPhotos() ([]Photo, error) {
	rows, err := db.Query(`
		SELECT id, path, filename, imported_at, favorite, metadata_json, thumbnail_path
		FROM photos
		ORDER BY imported_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var photos []Photo
	for rows.Next() {
		var p Photo
		if err := rows.Scan(&p.ID, &p.Path, &p.Filename, &p.ImportedAt, &p.Favorite, &p.MetadataJSON, &p.ThumbnailPath); err != nil {
			return nil, err
		}
		photos = append(photos, p)
	}

	return photos, rows.Err()
}

// GetPeople retrieves all people
func (db *DB) GetPeople() ([]Person, error) {
	rows, err := db.Query(`
		SELECT id, name, face_encodings, created_at
		FROM people
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var people []Person
	for rows.Next() {
		var p Person
		if err := rows.Scan(&p.ID, &p.Name, &p.FaceEncodings, &p.CreatedAt); err != nil {
			return nil, err
		}
		people = append(people, p)
	}

	return people, rows.Err()
}

// InsertPerson creates a new person
func (db *DB) InsertPerson(name string) (int64, error) {
	now := time.Now().Unix()
	result, err := db.Exec(
		"INSERT INTO people (name, created_at) VALUES (?, ?)",
		name, now,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// UpdatePerson updates a person's name
func (db *DB) UpdatePerson(id int64, name string) error {
	_, err := db.Exec("UPDATE people SET name = ? WHERE id = ?", name, id)
	return err
}

// DeletePerson deletes a person
func (db *DB) DeletePerson(id int64) error {
	_, err := db.Exec("DELETE FROM people WHERE id = ?", id)
	return err
}

// GetFaceTagsForPhoto retrieves face tags for a specific photo
func (db *DB) GetFaceTagsForPhoto(photoFilename string) ([]FaceTag, error) {
	rows, err := db.Query(`
		SELECT id, photo_filename, person_id, x, y, width, height, confidence, is_manual, created_at
		FROM face_tags
		WHERE photo_filename = ?
		ORDER BY created_at
	`, photoFilename)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []FaceTag
	for rows.Next() {
		var t FaceTag
		if err := rows.Scan(&t.ID, &t.PhotoFilename, &t.PersonID, &t.X, &t.Y, &t.Width, &t.Height, &t.Confidence, &t.IsManual, &t.CreatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}

	return tags, rows.Err()
}

// InsertFaceTag creates a new face tag
func (db *DB) InsertFaceTag(photoFilename string, personID *int64, x, y, width, height, confidence float64, isManual bool) (int64, error) {
	now := time.Now().Unix()

	var pid sql.NullInt64
	if personID != nil {
		pid = sql.NullInt64{Int64: *personID, Valid: true}
	}

	result, err := db.Exec(`
		INSERT INTO face_tags (photo_filename, person_id, x, y, width, height, confidence, is_manual, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, photoFilename, pid, x, y, width, height, confidence, isManual, now)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

// UpdateFaceTag updates a face tag
func (db *DB) UpdateFaceTag(id int64, personID *int64, x, y, width, height, confidence float64) error {
	var pid sql.NullInt64
	if personID != nil {
		pid = sql.NullInt64{Int64: *personID, Valid: true}
	}

	_, err := db.Exec(`
		UPDATE face_tags
		SET person_id = ?, x = ?, y = ?, width = ?, height = ?, confidence = ?
		WHERE id = ?
	`, pid, x, y, width, height, confidence, id)
	return err
}

// DeleteFaceTag deletes a face tag
func (db *DB) DeleteFaceTag(id int64) error {
	_, err := db.Exec("DELETE FROM face_tags WHERE id = ?", id)
	return err
}

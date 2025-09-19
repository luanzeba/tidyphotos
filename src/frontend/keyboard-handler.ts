import { Photo } from "./types.js";
import type { TidyPhotosApp } from "./tidyphotos-app.js";

export class KeyboardHandler {
  private app: TidyPhotosApp;

  constructor(app: TidyPhotosApp) {
    this.app = app;
  }

  private calculateGridColumns(): number {
    // Get the actual grid container
    const gridElement = document.querySelector('.photo-grid') as HTMLElement;
    if (!gridElement) return 1;

    // Get computed styles to find the actual grid layout
    const computedStyles = window.getComputedStyle(gridElement);
    const gridTemplateColumns = computedStyles.gridTemplateColumns;

    // Count the number of columns by splitting the grid-template-columns value
    // Example: "200px 200px 200px" -> 3 columns
    // Example: "repeat(5, 200px)" is handled by browser as actual values
    if (gridTemplateColumns && gridTemplateColumns !== 'none') {
      const columns = gridTemplateColumns.split(' ').length;
      return Math.max(1, columns);
    }

    // Fallback: calculate based on container width and current thumbnail size
    const containerWidth = gridElement.clientWidth;
    const gap = parseInt(computedStyles.gap) || 16; // 1rem default

    // Get the actual thumbnail size from CSS custom property
    const thumbnailSizeProperty = computedStyles.getPropertyValue('--thumbnail-size') || '200px';
    const minColumnWidth = parseInt(thumbnailSizeProperty) || 200;

    const availableWidth = containerWidth - (gap * 2); // subtract padding
    const approxColumns = Math.floor(availableWidth / (minColumnWidth + gap));
    return Math.max(1, approxColumns);
  }

  handleGalleryKeyboard(event: KeyboardEvent): void {
    const photos = this.app.getFilteredPhotos();
    if (photos.length === 0) return;

    // Handle space bar to open full screen
    if (event.key === " " || event.key === "Spacebar") {
      const selectedPhotoId = this.app.getSelectedPhotoId();
      if (selectedPhotoId !== null && !this.app.getViewer().isFullScreen) {
        event.preventDefault();
        this.app.getViewer().openFullScreen(selectedPhotoId);
        return;
      }
    }

    const selectedPhotoId = this.app.getSelectedPhotoId();
    const currentIndex =
      selectedPhotoId !== null
        ? photos.findIndex((p) => p.id === selectedPhotoId)
        : -1;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        if (selectedPhotoId === null) {
          this.app.selectPhoto(photos[0].id);
        } else {
          const nextIndex = (currentIndex + 1) % photos.length;
          this.app.selectPhoto(photos[nextIndex].id);
        }
        break;

      case "ArrowLeft":
        event.preventDefault();
        if (selectedPhotoId === null) {
          this.app.selectPhoto(photos[photos.length - 1].id);
        } else {
          const prevIndex =
            currentIndex === 0 ? photos.length - 1 : currentIndex - 1;
          this.app.selectPhoto(photos[prevIndex].id);
        }
        break;

      case "ArrowDown":
        event.preventDefault();
        // Navigate down a row using actual grid layout
        const gridColsDown = this.calculateGridColumns();
        const nextRowIndex = Math.min(
          photos.length - 1,
          currentIndex + gridColsDown,
        );
        this.app.selectPhoto(photos[nextRowIndex].id);
        break;

      case "ArrowUp":
        event.preventDefault();
        // Navigate up a row using actual grid layout
        const gridColsUp = this.calculateGridColumns();
        const prevRowIndex = Math.max(0, currentIndex - gridColsUp);
        this.app.selectPhoto(photos[prevRowIndex].id);
        break;

      case "f":
      case "F":
        console.log("Toggle favorite");
        if (selectedPhotoId !== null && !this.app.getViewer().isFullScreen) {
          event.preventDefault();
          this.app.toggleFavorite(selectedPhotoId);
        }
        break;

      case "Escape":
        if (this.app.getViewer().isFullScreen) {
          event.preventDefault();
          this.app.getViewer().closeFullScreen();
        } else {
          this.app.setSelectedPhotoId(null);
        }
        break;
    }

    // Scroll selected photo into view
    const newSelectedPhotoId = this.app.getSelectedPhotoId();
    if (newSelectedPhotoId !== null && !this.app.getViewer().isFullScreen) {
      this.app.scrollSelectedIntoView();
    }
  }
}


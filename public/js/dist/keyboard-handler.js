export class KeyboardHandler {
    constructor(app) {
        this.app = app;
    }
    handleGalleryKeyboard(event) {
        const photos = this.app.getFilteredPhotos();
        if (photos.length === 0)
            return;
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
        const currentIndex = selectedPhotoId !== null
            ? photos.findIndex((p) => p.id === selectedPhotoId)
            : -1;
        switch (event.key) {
            case "ArrowRight":
                event.preventDefault();
                if (selectedPhotoId === null) {
                    this.app.selectPhoto(photos[0].id);
                }
                else {
                    const nextIndex = (currentIndex + 1) % photos.length;
                    this.app.selectPhoto(photos[nextIndex].id);
                }
                break;
            case "ArrowLeft":
                event.preventDefault();
                if (selectedPhotoId === null) {
                    this.app.selectPhoto(photos[photos.length - 1].id);
                }
                else {
                    const prevIndex = currentIndex === 0 ? photos.length - 1 : currentIndex - 1;
                    this.app.selectPhoto(photos[prevIndex].id);
                }
                break;
            case "ArrowDown":
                event.preventDefault();
                // Navigate down a row (approximate)
                const gridCols = Math.floor(window.innerWidth / 220); // approximate
                const nextRowIndex = Math.min(photos.length - 1, currentIndex + gridCols);
                this.app.selectPhoto(photos[nextRowIndex].id);
                break;
            case "ArrowUp":
                event.preventDefault();
                // Navigate up a row
                const gridColsUp = Math.floor(window.innerWidth / 220);
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
                }
                else {
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
//# sourceMappingURL=keyboard-handler.js.map
class KeyboardHandler {
    constructor(app) {
        this.app = app;
    }

    handleGalleryKeyboard(event) {
        const photos = this.app.filteredPhotos;
        if (photos.length === 0) return;

        // Handle space bar to open full screen
        if (event.key === ' ' || event.key === 'Spacebar') {
            if (this.app.selectedPhotoId !== null && !this.app.viewer.fullScreenMode) {
                event.preventDefault();
                this.app.viewer.openFullScreen(this.app.selectedPhotoId);
                return;
            }
        }

        const currentIndex = photos.findIndex(p => p.id === this.app.selectedPhotoId);
        
        switch (event.key) {
            case 'ArrowRight':
                event.preventDefault();
                if (this.app.selectedPhotoId === null) {
                    this.app.selectPhoto(photos[0].id);
                } else {
                    const nextIndex = (currentIndex + 1) % photos.length;
                    this.app.selectPhoto(photos[nextIndex].id);
                }
                break;
                
            case 'ArrowLeft':
                event.preventDefault();
                if (this.app.selectedPhotoId === null) {
                    this.app.selectPhoto(photos[photos.length - 1].id);
                } else {
                    const prevIndex = currentIndex === 0 ? photos.length - 1 : currentIndex - 1;
                    this.app.selectPhoto(photos[prevIndex].id);
                }
                break;
                
            case 'ArrowDown':
                event.preventDefault();
                // Navigate down a row (approximate)
                const gridCols = Math.floor(window.innerWidth / 220); // approximate
                const nextRowIndex = Math.min(photos.length - 1, currentIndex + gridCols);
                this.app.selectPhoto(photos[nextRowIndex].id);
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                // Navigate up a row
                const gridColsUp = Math.floor(window.innerWidth / 220);
                const prevRowIndex = Math.max(0, currentIndex - gridColsUp);
                this.app.selectPhoto(photos[prevRowIndex].id);
                break;
                
            case 'f':
            case 'F':
                if (this.app.selectedPhotoId !== null && !this.app.viewer.fullScreenMode) {
                    event.preventDefault();
                    this.app.photoManager.toggleFavorite(this.app.selectedPhotoId);
                }
                break;
                
            case 'Escape':
                if (this.app.viewer.fullScreenMode) {
                    event.preventDefault();
                    this.app.viewer.closeFullScreen();
                } else {
                    this.app.selectedPhotoId = null;
                }
                break;
        }
        
        // Scroll selected photo into view
        if (this.app.selectedPhotoId !== null && !this.app.viewer.fullScreenMode) {
            this.app.$nextTick(() => {
                const selectedElement = document.querySelector('.photo-item.selected');
                if (selectedElement) {
                    selectedElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'nearest' 
                    });
                }
            });
        }
    }
}
class FullscreenViewer {
    constructor(app) {
        this.app = app;
        this.fullScreenMode = false;
        this.currentPhotoIndex = 0;
    }

    get currentPhoto() {
        if (!this.fullScreenMode || this.app.filteredPhotos.length === 0) return null;
        return this.app.filteredPhotos[this.currentPhotoIndex];
    }

    openFullScreen(photoId) {
        const photoIndex = this.app.filteredPhotos.findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.app.router.updateUrl(true, this.app.currentGallery, this.currentPhoto);
        }
    }

    openFullScreenFromRoute(photoId) {
        // Wait for photos to load if needed
        if (this.app.photoManager.loading) {
            const checkPhotos = () => {
                if (!this.app.photoManager.loading) {
                    this.openFullScreenById(photoId);
                } else {
                    setTimeout(checkPhotos, 100);
                }
            };
            checkPhotos();
        } else {
            this.openFullScreenById(photoId);
        }
    }

    openFullScreenById(photoId) {
        const photoIndex = this.app.filteredPhotos.findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.app.selectedPhotoId = photoId;
        } else {
            // Photo not found, redirect to gallery
            console.warn('📷 TidyPhotos: Photo not found:', photoId);
            this.app.router.navigateToGallery();
        }
    }

    closeFullScreen() {
        this.fullScreenMode = false;
        this.app.router.updateUrl(false, this.app.currentGallery, null);
    }

    nextPhoto() {
        if (this.currentPhotoIndex < this.app.filteredPhotos.length - 1) {
            this.currentPhotoIndex++;
            this.app.router.updateUrl(true, this.app.currentGallery, this.currentPhoto);
        }
    }

    previousPhoto() {
        if (this.currentPhotoIndex > 0) {
            this.currentPhotoIndex--;
            this.app.router.updateUrl(true, this.app.currentGallery, this.currentPhoto);
        }
    }

    toggleFavorite() {
        if (this.currentPhoto) {
            this.app.photoManager.toggleFavorite(this.currentPhoto.id);
        }
    }

    handleKeyboard(event) {
        if (!this.fullScreenMode) return;

        switch (event.key) {
            case 'ArrowRight':
                event.preventDefault();
                this.nextPhoto();
                break;
                
            case 'ArrowLeft':
                event.preventDefault();
                this.previousPhoto();
                break;
                
            case 'f':
            case 'F':
                event.preventDefault();
                this.toggleFavorite();
                break;
                
            case 'Escape':
            case 'q':
            case 'Q':
                event.preventDefault();
                this.closeFullScreen();
                break;
        }
    }
}
export class FullscreenViewer {
    constructor(app) {
        this.fullScreenMode = false;
        this.currentPhotoIndex = 0;
        this.app = app;
    }
    get isFullScreen() {
        return this.fullScreenMode;
    }
    get photoIndex() {
        return this.currentPhotoIndex;
    }
    get currentPhoto() {
        if (!this.fullScreenMode || this.app.getFilteredPhotos().length === 0)
            return null;
        return this.app.getFilteredPhotos()[this.currentPhotoIndex];
    }
    openFullScreen(photoId) {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }
    openFullScreenFromRoute(photoId) {
        // Wait for photos to load if needed
        if (this.app.getPhotoManager().isLoading) {
            const checkPhotos = () => {
                if (!this.app.getPhotoManager().isLoading) {
                    this.openFullScreenById(photoId);
                }
                else {
                    setTimeout(checkPhotos, 100);
                }
            };
            checkPhotos();
        }
        else {
            this.openFullScreenById(photoId);
        }
    }
    openFullScreenById(photoId) {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.app.setSelectedPhotoId(photoId);
        }
        else {
            // Photo not found, redirect to gallery
            console.warn('📷 TidyPhotos: Photo not found:', photoId);
            this.app.getRouter().navigateToGallery();
        }
    }
    closeFullScreen() {
        this.fullScreenMode = false;
        this.app.getRouter().updateUrl(false, this.app.getCurrentGallery(), null);
    }
    nextPhoto() {
        if (this.currentPhotoIndex < this.app.getFilteredPhotos().length - 1) {
            this.currentPhotoIndex++;
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }
    previousPhoto() {
        if (this.currentPhotoIndex > 0) {
            this.currentPhotoIndex--;
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }
    toggleFavorite() {
        if (this.currentPhoto) {
            this.app.getPhotoManager().toggleFavorite(this.currentPhoto.id);
        }
    }
    handleKeyboard(event) {
        if (!this.fullScreenMode)
            return;
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
//# sourceMappingURL=fullscreen-viewer.js.map
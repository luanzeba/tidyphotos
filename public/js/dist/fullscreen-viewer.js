export class FullscreenViewer {
    // currentPhotoIndex REMOVED - now reads from Alpine.store('app').selectedPhotoIndex
    constructor(app) {
        this.fullScreenMode = false;
        this.app = app;
    }
    get isFullScreen() {
        return this.fullScreenMode;
    }
    // Read photo index from Alpine store (single source of truth)
    get photoIndex() {
        if (typeof Alpine !== "undefined") {
            return Alpine.store("app").selectedPhotoIndex ?? 0;
        }
        return 0;
    }
    // Read current photo from Alpine store (single source of truth)
    get currentPhoto() {
        if (!this.fullScreenMode)
            return null;
        if (typeof Alpine !== "undefined") {
            return Alpine.store("app").selectedPhoto;
        }
        return null;
    }
    // Navigation methods REMOVED - now handled by Alpine.store('app') and Alpine.store('viewer')
    async toggleFavorite() {
        if (this.currentPhoto) {
            await this.app.getPhotoManager().toggleFavorite(this.currentPhoto.id);
        }
    }
}
//# sourceMappingURL=fullscreen-viewer.js.map
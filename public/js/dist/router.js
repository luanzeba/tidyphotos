// ⚠️ DEPRECATED: This Router class is no longer used.
// All routing functionality has been moved to Alpine.store('app') in public/index.html
//
// Key methods now in Alpine store:
// - handleRoute() - handles URL changes and browser navigation
// - updateUrl() - updates browser URL based on current state
// - openPhotoWhenReady() - opens photo when data is loaded
//
// This file is kept for reference but may be deleted in the future.
export class Router {
    constructor(app) {
        this.app = app;
        this.setupEventListeners();
    }
    setupEventListeners() {
        window.addEventListener('popstate', () => {
            this.handleRouteChange();
        });
    }
    handleInitialRoute() {
        this.handleRouteChange();
    }
    handleRouteChange() {
        const path = window.location.pathname;
        console.log('🔗 TidyPhotos: Route change:', path);
        // Parse route patterns
        const galleryPhotoMatch = path.match(/^\/gallery\/([^\/]+)\/photo\/(\d+)$/);
        const galleryMatch = path.match(/^\/gallery\/([^\/]+)$/);
        // Router only updates state, never triggers URL updates
        // This prevents circular dependencies between route changes and state updates
        if (galleryPhotoMatch) {
            // Route: /gallery/{gallery}/photo/{photoId}
            const [, gallery, photoIdStr] = galleryPhotoMatch;
            const photoId = parseInt(photoIdStr, 10);
            Alpine.store('app').currentView = 'photos';
            this.app.setCurrentGallery(gallery);
            console.log('DEBUG: Navigating to photo ID', photoId, 'in gallery', gallery);
            // Open fullscreen via Alpine store
            Alpine.store('viewer').open(photoId);
        }
        else if (galleryMatch) {
            // Route: /gallery/{gallery}
            const [, gallery] = galleryMatch;
            Alpine.store('app').currentView = 'photos';
            this.app.setCurrentGallery(gallery);
            // Close viewer via Alpine store
            Alpine.store('viewer').close();
        }
        else if (path === '/people') {
            // Route: /people
            Alpine.store('app').currentView = 'people';
            // Close viewer via Alpine store
            Alpine.store('viewer').close();
        }
        else if (path === '/') {
            // Route: / (default to 'all' gallery)
            Alpine.store('app').currentView = 'photos';
            this.app.setCurrentGallery('all');
            // Close viewer via Alpine store
            Alpine.store('viewer').close();
        }
        else {
            // Unknown route, redirect to gallery
            this.navigateToGallery();
        }
    }
    updateUrl(fullScreenMode, currentGallery, currentPhoto) {
        const currentView = this.app.getCurrentView();
        let newPath;
        if (currentView === 'people') {
            // People view
            newPath = '/people';
        }
        else if (fullScreenMode && currentPhoto) {
            // Full-screen photo view
            newPath = `/gallery/${currentGallery}/photo/${currentPhoto.id}`;
        }
        else {
            // Gallery view
            newPath = currentGallery === 'all' ? '/' : `/gallery/${currentGallery}`;
        }
        if (window.location.pathname !== newPath) {
            const state = {
                gallery: currentGallery,
                photoId: currentPhoto?.id,
                view: currentView
            };
            window.history.pushState(state, '', newPath);
            console.log('🔗 TidyPhotos: Updated URL:', newPath);
        }
    }
    navigateToGallery() {
        this.app.setCurrentView('photos');
        // Close viewer via Alpine store
        if (typeof Alpine !== "undefined") {
            Alpine.store('viewer').close();
        }
        this.updateUrl(false, this.app.getCurrentGallery(), null);
    }
    navigateToPeople() {
        this.app.setCurrentView('people');
        // Close viewer via Alpine store
        if (typeof Alpine !== "undefined") {
            Alpine.store('viewer').close();
        }
        this.updateUrl(false, this.app.getCurrentGallery(), null);
    }
}
//# sourceMappingURL=router.js.map
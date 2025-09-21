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
        if (galleryPhotoMatch) {
            // Route: /gallery/{gallery}/photo/{photoId}
            const [, gallery, photoIdStr] = galleryPhotoMatch;
            const photoId = parseInt(photoIdStr, 10);
            this.app.setCurrentView('photos');
            this.app.setCurrentGallery(gallery);
            this.app.openFullScreenFromRoute(photoId);
        }
        else if (galleryMatch) {
            // Route: /gallery/{gallery}
            const [, gallery] = galleryMatch;
            this.app.setCurrentView('photos');
            this.app.setCurrentGallery(gallery);
            this.app.closeFullScreen();
        }
        else if (path === '/people') {
            // Route: /people
            this.app.setCurrentView('people');
            this.app.closeFullScreen();
        }
        else if (path === '/') {
            // Route: / (default to 'all' gallery)
            this.app.setCurrentView('photos');
            this.app.setCurrentGallery('all');
            this.app.closeFullScreen();
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
        this.app.setFullScreenMode(false);
        this.updateUrl(false, this.app.getCurrentGallery(), null);
    }
    navigateToPeople() {
        this.app.setCurrentView('people');
        this.app.closeFullScreen();
        this.updateUrl(false, this.app.getCurrentGallery(), null);
    }
}
//# sourceMappingURL=router.js.map
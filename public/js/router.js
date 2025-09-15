class Router {
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
            const [, gallery, photoId] = galleryPhotoMatch;
            this.app.currentGallery = gallery;
            this.app.openFullScreenFromRoute(parseInt(photoId));
        } else if (galleryMatch) {
            // Route: /gallery/{gallery}
            const [, gallery] = galleryMatch;
            this.app.currentGallery = gallery;
            this.app.closeFullScreen();
        } else if (path === '/') {
            // Route: / (default to 'all' gallery)
            this.app.currentGallery = 'all';
            this.app.closeFullScreen();
        } else {
            // Unknown route, redirect to gallery
            this.navigateToGallery();
        }
    }

    updateUrl(fullScreenMode, currentGallery, currentPhoto) {
        let newPath;
        
        if (fullScreenMode && currentPhoto) {
            // Full-screen photo view
            newPath = `/gallery/${currentGallery}/photo/${currentPhoto.id}`;
        } else {
            // Gallery view
            newPath = currentGallery === 'all' ? '/' : `/gallery/${currentGallery}`;
        }

        if (window.location.pathname !== newPath) {
            window.history.pushState({ 
                gallery: currentGallery, 
                photoId: currentPhoto?.id 
            }, '', newPath);
            console.log('🔗 TidyPhotos: Updated URL:', newPath);
        }
    }

    navigateToGallery() {
        this.app.fullScreenMode = false;
        this.updateUrl(false, this.app.currentGallery, null);
    }
}
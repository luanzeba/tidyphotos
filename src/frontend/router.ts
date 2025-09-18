import { Photo, RouteState } from './types.js';
import type { TidyPhotosApp } from './tidyphotos-app.js';

export class Router {
    private app: TidyPhotosApp;

    constructor(app: TidyPhotosApp) {
        this.app = app;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        window.addEventListener('popstate', () => {
            this.handleRouteChange();
        });
    }

    handleInitialRoute(): void {
        this.handleRouteChange();
    }

    private handleRouteChange(): void {
        const path = window.location.pathname;
        console.log('🔗 TidyPhotos: Route change:', path);

        // Parse route patterns
        const galleryPhotoMatch = path.match(/^\/gallery\/([^\/]+)\/photo\/(\d+)$/);
        const galleryMatch = path.match(/^\/gallery\/([^\/]+)$/);

        if (galleryPhotoMatch) {
            // Route: /gallery/{gallery}/photo/{photoId}
            const [, gallery, photoIdStr] = galleryPhotoMatch;
            const photoId = parseInt(photoIdStr, 10);
            this.app.setCurrentGallery(gallery);
            this.app.openFullScreenFromRoute(photoId);
        } else if (galleryMatch) {
            // Route: /gallery/{gallery}
            const [, gallery] = galleryMatch;
            this.app.setCurrentGallery(gallery);
            this.app.closeFullScreen();
        } else if (path === '/') {
            // Route: / (default to 'all' gallery)
            this.app.setCurrentGallery('all');
            this.app.closeFullScreen();
        } else {
            // Unknown route, redirect to gallery
            this.navigateToGallery();
        }
    }

    updateUrl(fullScreenMode: boolean, currentGallery: string, currentPhoto: Photo | null): void {
        let newPath: string;
        
        if (fullScreenMode && currentPhoto) {
            // Full-screen photo view
            newPath = `/gallery/${currentGallery}/photo/${currentPhoto.id}`;
        } else {
            // Gallery view
            newPath = currentGallery === 'all' ? '/' : `/gallery/${currentGallery}`;
        }

        if (window.location.pathname !== newPath) {
            const state: RouteState = { 
                gallery: currentGallery, 
                photoId: currentPhoto?.id 
            };
            window.history.pushState(state, '', newPath);
            console.log('🔗 TidyPhotos: Updated URL:', newPath);
        }
    }

    navigateToGallery(): void {
        this.app.setFullScreenMode(false);
        this.updateUrl(false, this.app.getCurrentGallery(), null);
    }
}
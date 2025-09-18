import { Photo } from './types.js';
import type { TidyPhotosApp } from './tidyphotos-app.js';

export class FullscreenViewer {
    private app: TidyPhotosApp;
    private fullScreenMode: boolean = false;
    private currentPhotoIndex: number = 0;

    constructor(app: TidyPhotosApp) {
        this.app = app;
    }

    get isFullScreen(): boolean {
        return this.fullScreenMode;
    }

    get photoIndex(): number {
        return this.currentPhotoIndex;
    }

    get currentPhoto(): Photo | null {
        if (!this.fullScreenMode || this.app.getFilteredPhotos().length === 0) return null;
        return this.app.getFilteredPhotos()[this.currentPhotoIndex];
    }

    openFullScreen(photoId: number): void {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }

    openFullScreenFromRoute(photoId: number): void {
        // Wait for photos to load if needed
        if (this.app.getPhotoManager().isLoading) {
            const checkPhotos = (): void => {
                if (!this.app.getPhotoManager().isLoading) {
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

    private openFullScreenById(photoId: number): void {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.app.setSelectedPhotoId(photoId);
        } else {
            // Photo not found, redirect to gallery
            console.warn('📷 TidyPhotos: Photo not found:', photoId);
            this.app.getRouter().navigateToGallery();
        }
    }

    closeFullScreen(): void {
        this.fullScreenMode = false;
        this.app.getRouter().updateUrl(false, this.app.getCurrentGallery(), null);
    }

    nextPhoto(): void {
        if (this.currentPhotoIndex < this.app.getFilteredPhotos().length - 1) {
            this.currentPhotoIndex++;
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }

    previousPhoto(): void {
        if (this.currentPhotoIndex > 0) {
            this.currentPhotoIndex--;
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }

    toggleFavorite(): void {
        if (this.currentPhoto) {
            this.app.getPhotoManager().toggleFavorite(this.currentPhoto.id);
        }
    }

    handleKeyboard(event: KeyboardEvent): void {
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
import { PhotoManager } from './photo-manager.js';
import { TimelineManager } from './timeline-manager.js';
import { Router } from './router.js';
import { FullscreenViewer } from './fullscreen-viewer.js';
import { KeyboardHandler } from './keyboard-handler.js';
export class TidyPhotosApp {
    constructor() {
        // App state
        this._searchQuery = '';
        this.selectedPhotoId = null;
        this.currentGallery = 'all';
        // Initialize managers
        this.photoManager = new PhotoManager();
        this.timelineManager = new TimelineManager();
        this.viewer = new FullscreenViewer(this);
        this.keyboardHandler = new KeyboardHandler(this);
        this.router = new Router(this);
    }
    // Public getters for internal components
    getPhotoManager() {
        return this.photoManager;
    }
    getTimelineManager() {
        return this.timelineManager;
    }
    getViewer() {
        return this.viewer;
    }
    getKeyboardHandler() {
        return this.keyboardHandler;
    }
    getRouter() {
        return this.router;
    }
    // State getters
    getSelectedPhotoId() {
        return this.selectedPhotoId;
    }
    // Public accessor for selectedPhotoId
    get currentSelectedPhotoId() {
        return this.selectedPhotoId;
    }
    getCurrentGallery() {
        return this.currentGallery;
    }
    getFilteredPhotos() {
        return this.timelineManager.filterPhotos(this.photoManager.allPhotos, this._searchQuery);
    }
    // State setters
    setSelectedPhotoId(photoId) {
        this.selectedPhotoId = photoId;
    }
    setCurrentGallery(gallery) {
        this.currentGallery = gallery;
    }
    setFullScreenMode(fullScreen) {
        // This method exists for Router compatibility
        if (!fullScreen) {
            this.viewer.closeFullScreen();
        }
    }
    setSearchQuery(query) {
        this._searchQuery = query;
    }
    // Computed properties (getters) for Alpine.js compatibility
    get loading() {
        return this.photoManager.isLoading;
    }
    get photos() {
        return this.photoManager.allPhotos;
    }
    get years() {
        return this.timelineManager.getYears(this.photos);
    }
    get months() {
        return this.timelineManager.getMonths(this.photos, this.timelineManager.currentSelectedYear);
    }
    get filteredPhotos() {
        return this.getFilteredPhotos();
    }
    get fullScreenMode() {
        return this.viewer.isFullScreen;
    }
    get currentPhoto() {
        return this.viewer.currentPhoto;
    }
    get currentPhotoIndex() {
        return this.viewer.photoIndex;
    }
    get selectedYear() {
        return this.timelineManager.currentSelectedYear;
    }
    get selectedMonth() {
        return this.timelineManager.currentSelectedMonth;
    }
    get mobileTimelineView() {
        return this.timelineManager.currentMobileView;
    }
    get searchQuery() {
        return this._searchQuery;
    }
    set searchQuery(value) {
        this.setSearchQuery(value);
    }
    // Initialization
    async init() {
        console.log('🚀 TidyPhotos: Initializing...');
        await this.photoManager.loadPhotos();
        this.router.handleInitialRoute();
        console.log('✅ TidyPhotos: Initialization complete');
    }
    // Photo selection
    selectPhoto(photoId) {
        this.selectedPhotoId = photoId;
    }
    // Timeline methods
    selectYear(year) {
        this.timelineManager.selectYear(year);
    }
    selectMonth(month) {
        this.timelineManager.selectMonth(month);
    }
    clearFilters() {
        this.timelineManager.clearFilters();
    }
    setMobileView(view) {
        this.timelineManager.setMobileView(view);
    }
    // Photo methods
    async toggleFavorite(photoId) {
        await this.photoManager.toggleFavorite(photoId);
    }
    formatDate(dateString) {
        return this.photoManager.formatDate(dateString);
    }
    // Fullscreen methods
    openFullScreen(photoId) {
        this.viewer.openFullScreen(photoId);
    }
    openFullScreenFromRoute(photoId) {
        this.viewer.openFullScreenFromRoute(photoId);
    }
    closeFullScreen() {
        this.viewer.closeFullScreen();
    }
    nextPhoto() {
        this.viewer.nextPhoto();
    }
    previousPhoto() {
        this.viewer.previousPhoto();
    }
    toggleFullScreenFavorite() {
        this.viewer.toggleFavorite();
    }
    // Keyboard event handlers
    handleKeyboard(event) {
        this.keyboardHandler.handleGalleryKeyboard(event);
    }
    handleFullScreenKeyboard(event) {
        this.viewer.handleKeyboard(event);
    }
    // Alpine.js compatibility methods
    scrollSelectedIntoView() {
        // Use setTimeout to simulate $nextTick
        setTimeout(() => {
            const selectedElement = document.querySelector('.photo-item.selected');
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }
        }, 0);
    }
}
// Create a single instance to avoid circular references
let appInstance = null;
let dataWrapper = null;
// Ensure photoApp is available globally as soon as this module loads
window.photoApp = function () {
    if (!appInstance) {
        appInstance = new TidyPhotosApp();
    }
    if (!dataWrapper) {
        // Return a plain object with methods bound to the instance
        // This prevents Alpine.js from trying to make getters reactive
        dataWrapper = {
            // Data properties (copied values, not reactive getters)
            loading: false,
            searchQuery: '',
            selectedPhotoId: null,
            selectedYear: null,
            selectedMonth: null,
            mobileTimelineView: 'all',
            fullScreenMode: false,
            currentPhoto: null,
            currentPhotoIndex: 0,
            photos: [],
            years: [],
            months: [],
            filteredPhotos: [],
            // Initialization
            async init() {
                await appInstance.init();
                this.updateData();
            },
            // Update data from the app instance
            updateData() {
                this.loading = appInstance.loading;
                this.searchQuery = appInstance.searchQuery;
                this.selectedPhotoId = appInstance.currentSelectedPhotoId;
                this.selectedYear = appInstance.selectedYear;
                this.selectedMonth = appInstance.selectedMonth;
                this.mobileTimelineView = appInstance.mobileTimelineView;
                this.fullScreenMode = appInstance.fullScreenMode;
                this.currentPhoto = appInstance.currentPhoto ? { ...appInstance.currentPhoto } : null;
                this.currentPhotoIndex = appInstance.currentPhotoIndex;
                this.photos = appInstance.photos.map(photo => ({ ...photo }));
                this.years = appInstance.years;
                this.months = appInstance.months;
                this.filteredPhotos = appInstance.filteredPhotos.map(photo => ({ ...photo }));
            },
            // Methods (bound to the instance)
            selectPhoto(photoId) {
                appInstance.selectPhoto(photoId);
                this.updateData();
            },
            selectYear(year) {
                appInstance.selectYear(year);
                this.updateData();
            },
            selectMonth(month) {
                appInstance.selectMonth(month);
                this.updateData();
            },
            clearFilters() {
                appInstance.clearFilters();
                this.updateData();
            },
            setMobileView(view) {
                appInstance.setMobileView(view);
                this.updateData();
            },
            async toggleFavorite(photoId) {
                await appInstance.toggleFavorite(photoId);
                this.updateData();
            },
            openFullScreen(photoId) {
                appInstance.openFullScreen(photoId);
                this.updateData();
            },
            closeFullScreen() {
                appInstance.closeFullScreen();
                this.updateData();
            },
            nextPhoto() {
                appInstance.nextPhoto();
                this.updateData();
            },
            previousPhoto() {
                appInstance.previousPhoto();
                this.updateData();
            },
            async toggleFullScreenFavorite() {
                await appInstance.toggleFullScreenFavorite();
                this.updateData();
            },
            handleKeyboard(event) {
                appInstance.handleKeyboard(event);
                this.updateData();
            },
            handleFullScreenKeyboard(event) {
                appInstance.handleFullScreenKeyboard(event);
                this.updateData();
            }
        };
    }
    return dataWrapper;
};
//# sourceMappingURL=tidyphotos-app.js.map
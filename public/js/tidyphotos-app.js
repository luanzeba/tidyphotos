class TidyPhotosApp {
    constructor() {
        // Initialize managers
        this.photoManager = new PhotoManager();
        this.timelineManager = new TimelineManager();
        this.viewer = new FullscreenViewer(this);
        this.keyboardHandler = new KeyboardHandler(this);
        this.router = new Router(this);

        // App state
        this.searchQuery = '';
        this.selectedPhotoId = null;
        this.currentGallery = 'all';
    }

    // Computed properties (getters)
    get loading() {
        return this.photoManager.loading;
    }

    get photos() {
        return this.photoManager.photos;
    }

    get years() {
        return this.timelineManager.getYears(this.photos);
    }

    get months() {
        return this.timelineManager.getMonths(this.photos, this.timelineManager.selectedYear);
    }

    get filteredPhotos() {
        return this.timelineManager.filterPhotos(this.photos, this.searchQuery);
    }

    get fullScreenMode() {
        return this.viewer.fullScreenMode;
    }

    get currentPhoto() {
        return this.viewer.currentPhoto;
    }

    get currentPhotoIndex() {
        return this.viewer.currentPhotoIndex;
    }

    get selectedYear() {
        return this.timelineManager.selectedYear;
    }

    get selectedMonth() {
        return this.timelineManager.selectedMonth;
    }

    get mobileTimelineView() {
        return this.timelineManager.mobileTimelineView;
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
    toggleFavorite(photoId) {
        this.photoManager.toggleFavorite(photoId);
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

    // Alpine.js compatibility layer
    $nextTick(callback) {
        // This will be provided by Alpine when this becomes an Alpine component
        setTimeout(callback, 0);
    }
}

// Factory function for Alpine.js compatibility
function photoApp() {
    return new TidyPhotosApp();
}
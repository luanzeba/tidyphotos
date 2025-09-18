import { Photo, Month, MobileTimelineView } from './types.js';
import { PhotoManager } from './photo-manager.js';
import { TimelineManager } from './timeline-manager.js';
import { Router } from './router.js';
import { FullscreenViewer } from './fullscreen-viewer.js';
import { KeyboardHandler } from './keyboard-handler.js';

export class TidyPhotosApp {
    private photoManager: PhotoManager;
    private timelineManager: TimelineManager;
    private viewer: FullscreenViewer;
    private keyboardHandler: KeyboardHandler;
    private router: Router;

    // App state
    private _searchQuery: string = '';
    private selectedPhotoId: number | null = null;
    private currentGallery: string = 'all';

    constructor() {
        // Initialize managers
        this.photoManager = new PhotoManager();
        this.timelineManager = new TimelineManager();
        this.viewer = new FullscreenViewer(this);
        this.keyboardHandler = new KeyboardHandler(this);
        this.router = new Router(this);
    }

    // Public getters for internal components
    getPhotoManager(): PhotoManager {
        return this.photoManager;
    }

    getTimelineManager(): TimelineManager {
        return this.timelineManager;
    }

    getViewer(): FullscreenViewer {
        return this.viewer;
    }

    getKeyboardHandler(): KeyboardHandler {
        return this.keyboardHandler;
    }

    getRouter(): Router {
        return this.router;
    }

    // State getters
    getSelectedPhotoId(): number | null {
        return this.selectedPhotoId;
    }

    // Public accessor for selectedPhotoId
    public get currentSelectedPhotoId(): number | null {
        return this.selectedPhotoId;
    }

    getCurrentGallery(): string {
        return this.currentGallery;
    }

    getFilteredPhotos(): Photo[] {
        return this.timelineManager.filterPhotos(this.photoManager.allPhotos, this._searchQuery);
    }

    // State setters
    setSelectedPhotoId(photoId: number | null): void {
        this.selectedPhotoId = photoId;
    }

    setCurrentGallery(gallery: string): void {
        this.currentGallery = gallery;
    }

    setFullScreenMode(fullScreen: boolean): void {
        // This method exists for Router compatibility
        if (!fullScreen) {
            this.viewer.closeFullScreen();
        }
    }

    setSearchQuery(query: string): void {
        this._searchQuery = query;
    }

    // Computed properties (getters) for Alpine.js compatibility
    get loading(): boolean {
        return this.photoManager.isLoading;
    }

    get photos(): Photo[] {
        return this.photoManager.allPhotos;
    }

    get years(): number[] {
        return this.timelineManager.getYears(this.photos);
    }

    get months(): Month[] {
        return this.timelineManager.getMonths(this.photos, this.timelineManager.currentSelectedYear);
    }

    get filteredPhotos(): Photo[] {
        return this.getFilteredPhotos();
    }

    get fullScreenMode(): boolean {
        return this.viewer.isFullScreen;
    }

    get currentPhoto(): Photo | null {
        return this.viewer.currentPhoto;
    }

    get currentPhotoIndex(): number {
        return this.viewer.photoIndex;
    }

    get selectedYear(): number | null {
        return this.timelineManager.currentSelectedYear;
    }

    get selectedMonth(): number | null {
        return this.timelineManager.currentSelectedMonth;
    }

    get mobileTimelineView(): MobileTimelineView {
        return this.timelineManager.currentMobileView;
    }

    get searchQuery(): string {
        return this._searchQuery;
    }

    set searchQuery(value: string) {
        this.setSearchQuery(value);
    }

    // Initialization
    async init(): Promise<void> {
        console.log('🚀 TidyPhotos: Initializing...');
        await this.photoManager.loadPhotos();
        this.router.handleInitialRoute();
        console.log('✅ TidyPhotos: Initialization complete');
    }

    // Photo selection
    selectPhoto(photoId: number): void {
        this.selectedPhotoId = photoId;
    }

    // Timeline methods
    selectYear(year: number): void {
        this.timelineManager.selectYear(year);
    }

    selectMonth(month: number): void {
        this.timelineManager.selectMonth(month);
    }

    clearFilters(): void {
        this.timelineManager.clearFilters();
    }

    setMobileView(view: MobileTimelineView): void {
        this.timelineManager.setMobileView(view);
    }

    // Photo methods
    async toggleFavorite(photoId: number): Promise<void> {
        await this.photoManager.toggleFavorite(photoId);
    }

    formatDate(dateString: string): string {
        return this.photoManager.formatDate(dateString);
    }

    // Fullscreen methods
    openFullScreen(photoId: number): void {
        this.viewer.openFullScreen(photoId);
    }

    openFullScreenFromRoute(photoId: number): void {
        this.viewer.openFullScreenFromRoute(photoId);
    }

    closeFullScreen(): void {
        this.viewer.closeFullScreen();
    }

    nextPhoto(): void {
        this.viewer.nextPhoto();
    }

    previousPhoto(): void {
        this.viewer.previousPhoto();
    }

    toggleFullScreenFavorite(): void {
        this.viewer.toggleFavorite();
    }

    // Keyboard event handlers
    handleKeyboard(event: KeyboardEvent): void {
        this.keyboardHandler.handleGalleryKeyboard(event);
    }

    handleFullScreenKeyboard(event: KeyboardEvent): void {
        this.viewer.handleKeyboard(event);
    }

    // Alpine.js compatibility methods
    scrollSelectedIntoView(): void {
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

// Factory function for Alpine.js compatibility
declare global {
    interface Window {
        photoApp(): TidyPhotosApp;
    }
}

// Create a single instance to avoid circular references
let appInstance: TidyPhotosApp | null = null;
let dataWrapper: any = null;

// Ensure photoApp is available globally as soon as this module loads
window.photoApp = function(): any {
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
            await appInstance!.init();
            this.updateData();
        },

        // Update data from the app instance
        updateData() {
            this.loading = appInstance!.loading;
            this.searchQuery = appInstance!.searchQuery;
            this.selectedPhotoId = appInstance!.currentSelectedPhotoId;
            this.selectedYear = appInstance!.selectedYear;
            this.selectedMonth = appInstance!.selectedMonth;
            this.mobileTimelineView = appInstance!.mobileTimelineView;
            this.fullScreenMode = appInstance!.fullScreenMode;
            this.currentPhoto = appInstance!.currentPhoto ? { ...appInstance!.currentPhoto } : null;
            this.currentPhotoIndex = appInstance!.currentPhotoIndex;
            this.photos = appInstance!.photos.map(photo => ({ ...photo }));
            this.years = appInstance!.years;
            this.months = appInstance!.months;
            this.filteredPhotos = appInstance!.filteredPhotos.map(photo => ({ ...photo }));
        },

        // Methods (bound to the instance)
        selectPhoto(photoId: number) {
            appInstance!.selectPhoto(photoId);
            this.updateData();
        },

        selectYear(year: number) {
            appInstance!.selectYear(year);
            this.updateData();
        },

        selectMonth(month: number) {
            appInstance!.selectMonth(month);
            this.updateData();
        },

        clearFilters() {
            appInstance!.clearFilters();
            this.updateData();
        },

        setMobileView(view: string) {
            appInstance!.setMobileView(view as any);
            this.updateData();
        },

        async toggleFavorite(photoId: number) {
            await appInstance!.toggleFavorite(photoId);
            this.updateData();
        },

        openFullScreen(photoId: number) {
            appInstance!.openFullScreen(photoId);
            this.updateData();
        },

        closeFullScreen() {
            appInstance!.closeFullScreen();
            this.updateData();
        },

        nextPhoto() {
            appInstance!.nextPhoto();
            this.updateData();
        },

        previousPhoto() {
            appInstance!.previousPhoto();
            this.updateData();
        },

        async toggleFullScreenFavorite() {
            await appInstance!.toggleFullScreenFavorite();
            this.updateData();
        },

        handleKeyboard(event: KeyboardEvent) {
            appInstance!.handleKeyboard(event);
            this.updateData();
        },

        handleFullScreenKeyboard(event: KeyboardEvent) {
            appInstance!.handleFullScreenKeyboard(event);
            this.updateData();
        }
        };
    }

    return dataWrapper;
};
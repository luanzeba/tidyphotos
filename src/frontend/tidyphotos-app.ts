import { Photo, Month, MobileTimelineView, Person } from './types.js';
import { PhotoManager } from './photo-manager.js';
import { TimelineManager } from './timeline-manager.js';
import { Router } from './router.js';
import { FullscreenViewer } from './fullscreen-viewer.js';
import { KeyboardHandler } from './keyboard-handler.js';
import { PeopleManager } from './people-manager.js';

export class TidyPhotosApp {
    private photoManager: PhotoManager;
    private timelineManager: TimelineManager;
    private peopleManager: PeopleManager;
    private viewer: FullscreenViewer;
    private keyboardHandler: KeyboardHandler;
    private router: Router;

    // App state
    private _searchQuery: string = '';
    private selectedPhotoId: number | null = null;
    private currentGallery: string = 'all';
    private _currentView: 'photos' | 'people' = 'photos';

    constructor() {
        // Initialize managers
        this.photoManager = new PhotoManager();
        this.timelineManager = new TimelineManager();
        this.peopleManager = new PeopleManager();
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

    getPeopleManager(): PeopleManager {
        return this.peopleManager;
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

    getCurrentView(): 'photos' | 'people' {
        return this._currentView;
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

    setCurrentView(view: 'photos' | 'people'): void {
        this._currentView = view;
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

    get currentView(): 'photos' | 'people' {
        return this._currentView;
    }

    get people(): Person[] {
        return this.peopleManager.people;
    }

    // Initialization
    async init(): Promise<void> {
        console.log('🚀 TidyPhotos: Initializing...');
        await Promise.all([
            this.photoManager.loadPhotos(),
            this.peopleManager.loadPeople()
        ]);
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

    // People management methods
    async addPerson(name: string): Promise<Person | null> {
        return await this.peopleManager.addPerson(name);
    }

    async updatePerson(id: number, name: string): Promise<boolean> {
        return await this.peopleManager.updatePerson(id, name);
    }

    async deletePerson(id: number): Promise<boolean> {
        return await this.peopleManager.deletePerson(id);
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
        thumbnailSize: 200,
        currentView: 'photos',
        people: [],
        showAddPersonModal: false,
        showEditPersonModal: false,
        personForm: { id: null, name: '' },

        // Initialization
        async init() {
            // Load thumbnail size from localStorage
            const savedSize = localStorage.getItem('tidyphotos-thumbnail-size');
            if (savedSize) {
                this.thumbnailSize = parseInt(savedSize);
                document.documentElement.style.setProperty('--thumbnail-size', savedSize + 'px');
            }

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
            this.currentView = appInstance!.currentView;
            this.people = appInstance!.people.map(person => ({ ...person }));
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
        },

        updateThumbnailSize(size: string) {
            this.thumbnailSize = parseInt(size);
            // Update CSS custom property
            document.documentElement.style.setProperty('--thumbnail-size', size + 'px');
            // Save to localStorage for persistence
            localStorage.setItem('tidyphotos-thumbnail-size', size);
        },

        // View management
        setCurrentView(view: string) {
            appInstance!.setCurrentView(view as any);
            this.updateData();
            // Update URL when view changes
            appInstance!.getRouter().updateUrl(
                appInstance!.fullScreenMode,
                appInstance!.getCurrentGallery(),
                appInstance!.currentPhoto
            );
        },

        // People management
        async addPerson() {
            if (this.personForm.name.trim()) {
                const result = await appInstance!.addPerson(this.personForm.name.trim());
                if (result) {
                    this.closePersonModal();
                    this.updateData();
                }
            }
        },

        async updatePerson() {
            if (this.personForm.id && this.personForm.name.trim()) {
                const result = await appInstance!.updatePerson(this.personForm.id, this.personForm.name.trim());
                if (result) {
                    this.closePersonModal();
                    this.updateData();
                }
            }
        },

        editPerson(person: any) {
            this.personForm.id = person.id;
            this.personForm.name = person.name;
            this.showEditPersonModal = true;
        },

        async deletePerson(person: any) {
            if (confirm(`Are you sure you want to delete "${person.name}"? This will remove all associated photo tags.`)) {
                const result = await appInstance!.deletePerson(person.id);
                if (result) {
                    this.updateData();
                }
            }
        },

        closePersonModal() {
            this.showAddPersonModal = false;
            this.showEditPersonModal = false;
            this.personForm.id = null;
            this.personForm.name = '';
        }
        };
    }

    return dataWrapper;
};
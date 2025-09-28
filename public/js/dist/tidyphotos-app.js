import { PhotoManager } from './photo-manager.js';
import { TimelineManager } from './timeline-manager.js';
import { Router } from './router.js';
import { FullscreenViewer } from './fullscreen-viewer.js';
import { KeyboardHandler } from './keyboard-handler.js';
import { PeopleManager } from './people-manager.js';
export class TidyPhotosApp {
    constructor() {
        // App state
        this._searchQuery = '';
        this.selectedPhotoId = null;
        this.currentGallery = 'all';
        this._currentView = 'photos';
        // Initialize managers
        this.photoManager = new PhotoManager();
        this.timelineManager = new TimelineManager();
        this.peopleManager = new PeopleManager();
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
    getPeopleManager() {
        return this.peopleManager;
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
    getCurrentView() {
        return this._currentView;
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
    setCurrentView(view) {
        this._currentView = view;
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
    get currentView() {
        return this._currentView;
    }
    get people() {
        return this.peopleManager.people;
    }
    get taggingMode() {
        return this.viewer.isTaggingMode;
    }
    get faceTags() {
        return this.viewer.faceTags;
    }
    get isDrawingTag() {
        return this.viewer.isDrawing;
    }
    get drawingPreview() {
        return this.viewer.drawingPreview;
    }
    // Initialization
    async init() {
        console.log('🚀 TidyPhotos: Initializing...');
        await Promise.all([
            this.photoManager.loadPhotos(),
            this.peopleManager.loadPeople()
        ]);
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
    async openFullScreen(photoId) {
        await this.viewer.openFullScreen(photoId);
    }
    openFullScreenFromRoute(photoId) {
        this.viewer.openFullScreenFromRoute(photoId);
    }
    closeFullScreen() {
        this.viewer.closeFullScreen();
    }
    async nextPhoto() {
        await this.viewer.nextPhoto();
    }
    async previousPhoto() {
        await this.viewer.previousPhoto();
    }
    async toggleFullScreenFavorite() {
        await this.viewer.toggleFavorite();
    }
    // Keyboard event handlers
    handleKeyboard(event) {
        this.keyboardHandler.handleGalleryKeyboard(event);
    }
    handleFullScreenKeyboard(event) {
        this.viewer.handleKeyboard(event);
    }
    // People management methods
    async addPerson(name) {
        return await this.peopleManager.addPerson(name);
    }
    async updatePerson(id, name) {
        return await this.peopleManager.updatePerson(id, name);
    }
    async deletePerson(id) {
        return await this.peopleManager.deletePerson(id);
    }
    // Face tagging methods removed - Alpine.js wrappers now call viewer directly
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
            thumbnailSize: 200,
            currentView: 'photos',
            people: [],
            showAddPersonModal: false,
            showEditPersonModal: false,
            personForm: { id: null, name: '' },
            taggingMode: false,
            faceTags: [],
            showTagAssignModal: false,
            selectedTagId: null,
            isDrawingTag: false,
            drawingPreview: null,
            // Initialization
            async init() {
                // Load thumbnail size from localStorage
                const savedSize = localStorage.getItem('tidyphotos-thumbnail-size');
                if (savedSize) {
                    this.thumbnailSize = parseInt(savedSize);
                    document.documentElement.style.setProperty('--thumbnail-size', savedSize + 'px');
                }
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
                this.currentView = appInstance.currentView;
                this.people = appInstance.people.map(person => ({ ...person }));
                this.taggingMode = appInstance.taggingMode;
                this.faceTags = appInstance.faceTags.map(tag => ({ ...tag }));
                this.isDrawingTag = appInstance.isDrawingTag;
                this.drawingPreview = appInstance.drawingPreview ? { ...appInstance.drawingPreview } : null;
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
            async openFullScreen(photoId) {
                await appInstance.openFullScreen(photoId);
                this.updateData();
            },
            closeFullScreen() {
                appInstance.closeFullScreen();
                this.updateData();
            },
            async nextPhoto() {
                await appInstance.nextPhoto();
                this.updateData();
            },
            async previousPhoto() {
                await appInstance.previousPhoto();
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
            },
            updateThumbnailSize(size) {
                this.thumbnailSize = parseInt(size);
                // Update CSS custom property
                document.documentElement.style.setProperty('--thumbnail-size', size + 'px');
                // Save to localStorage for persistence
                localStorage.setItem('tidyphotos-thumbnail-size', size);
            },
            // View management
            setCurrentView(view) {
                appInstance.setCurrentView(view);
                this.updateData();
                // Update URL when view changes
                appInstance.getRouter().updateUrl(appInstance.fullScreenMode, appInstance.getCurrentGallery(), appInstance.currentPhoto);
            },
            // People management
            async addPerson() {
                if (this.personForm.name.trim()) {
                    const result = await appInstance.addPerson(this.personForm.name.trim());
                    if (result) {
                        this.closePersonModal();
                        this.updateData();
                    }
                }
            },
            async updatePerson() {
                if (this.personForm.id && this.personForm.name.trim()) {
                    const result = await appInstance.updatePerson(this.personForm.id, this.personForm.name.trim());
                    if (result) {
                        this.closePersonModal();
                        this.updateData();
                    }
                }
            },
            editPerson(person) {
                this.personForm.id = person.id;
                this.personForm.name = person.name;
                this.showEditPersonModal = true;
            },
            async deletePerson(person) {
                if (confirm(`Are you sure you want to delete "${person.name}"? This will remove all associated photo tags.`)) {
                    const result = await appInstance.deletePerson(person.id);
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
            },
            // Face tagging methods - call FullscreenViewer directly
            toggleTaggingMode() {
                appInstance.getViewer().toggleTaggingMode();
                this.updateData();
            },
            startDrawingTag(event) {
                appInstance.getViewer().startDrawingTag(event);
                this.updateData();
            },
            updateDrawingTag(event) {
                appInstance.getViewer().updateDrawingTag(event);
                this.updateData();
            },
            finishDrawingTag(event) {
                appInstance.getViewer().finishDrawingTag(event);
                this.updateData();
            },
            removeTag(tagId) {
                appInstance.getViewer().removeTag(tagId);
                this.updateData();
            },
            openTagAssignModal(tagId) {
                this.selectedTagId = tagId;
                this.showTagAssignModal = true;
            },
            assignPersonToTag(personId, personName) {
                if (this.selectedTagId) {
                    appInstance.getViewer().assignPersonToTag(this.selectedTagId, personId, personName);
                    this.closeTagAssignModal();
                    this.updateData();
                }
            },
            closeTagAssignModal() {
                this.showTagAssignModal = false;
                this.selectedTagId = null;
            },
            async saveFaceTags() {
                await appInstance.getViewer().saveFaceTags();
                this.updateData();
            }
        };
    }
    return dataWrapper;
};
//# sourceMappingURL=tidyphotos-app.js.map
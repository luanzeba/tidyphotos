function photoApp() {
    return {
        // State
        photos: [],
        loading: true,
        searchQuery: '',
        selectedYear: null,
        selectedMonth: null,
        selectedPhotoId: null,
        mobileTimelineView: 'all', // 'years', 'months', 'all'
        fullScreenMode: false,
        currentPhotoIndex: 0,

        // Computed
        get years() {
            const yearSet = new Set();
            this.photos.forEach(photo => {
                const date = new Date(photo.date);
                yearSet.add(date.getFullYear());
            });
            return Array.from(yearSet).sort((a, b) => b - a);
        },

        get months() {
            if (!this.selectedYear) return [];
            
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            
            const monthSet = new Set();
            this.photos.forEach(photo => {
                const date = new Date(photo.date);
                if (date.getFullYear() === this.selectedYear) {
                    monthSet.add(date.getMonth());
                }
            });
            
            return Array.from(monthSet)
                .sort((a, b) => b - a)
                .map(month => ({
                    number: month,
                    name: monthNames[month]
                }));
        },

        get filteredPhotos() {
            let filtered = this.photos;

            // Filter by search query
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(photo => 
                    photo.name.toLowerCase().includes(query) ||
                    photo.tags?.some(tag => tag.toLowerCase().includes(query))
                );
            }

            // Filter by timeline selection
            if (this.selectedYear) {
                filtered = filtered.filter(photo => {
                    const date = new Date(photo.date);
                    const yearMatch = date.getFullYear() === this.selectedYear;
                    
                    if (this.selectedMonth !== null) {
                        return yearMatch && date.getMonth() === this.selectedMonth;
                    }
                    return yearMatch;
                });
            }

            return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        },

        get currentPhoto() {
            if (!this.fullScreenMode || this.filteredPhotos.length === 0) return null;
            return this.filteredPhotos[this.currentPhotoIndex];
        },

        // Methods
        async init() {
            console.log('🚀 TidyPhotos: Initializing...');
            await this.loadPhotos();
            this.setupKeyboardNavigation();
            console.log('✅ TidyPhotos: Initialization complete');
        },

        async loadPhotos() {
            console.log('📡 TidyPhotos: Loading photos from API...');
            try {
                const response = await fetch('/api/photos');
                console.log('📡 TidyPhotos: API response status:', response.status);
                this.photos = await response.json();
                console.log('📷 TidyPhotos: Loaded', this.photos.length, 'photos:', this.photos);
                
                // Mock data for now
                if (this.photos.length === 0) {
                    console.log('⚠️ TidyPhotos: No photos from API, using mock data');
                    this.photos = this.generateMockPhotos();
                }
                
                this.loading = false;
                console.log('✅ TidyPhotos: Photos loaded successfully');
            } catch (error) {
                console.error('❌ TidyPhotos: Failed to load photos:', error);
                this.photos = this.generateMockPhotos();
                this.loading = false;
            }
        },

        generateMockPhotos() {
            const photos = [];
            const currentDate = new Date();
            
            for (let i = 0; i < 50; i++) {
                const date = new Date(currentDate);
                date.setDate(date.getDate() - Math.floor(Math.random() * 365));
                
                photos.push({
                    id: i + 1,
                    name: `Photo ${i + 1}`,
                    thumbnail: `https://picsum.photos/300/300?random=${i}`,
                    date: date.toISOString(),
                    favorite: Math.random() > 0.8,
                    tags: ['family', 'vacation', 'nature'][Math.floor(Math.random() * 3)] || null
                });
            }
            
            return photos;
        },

        selectYear(year) {
            this.selectedYear = year;
            this.selectedMonth = null;
        },

        selectMonth(month) {
            this.selectedMonth = month;
        },

        clearFilters() {
            this.selectedYear = null;
            this.selectedMonth = null;
        },

        setMobileView(view) {
            this.mobileTimelineView = view;
            if (view === 'all') {
                this.selectedYear = null;
                this.selectedMonth = null;
            }
        },

        selectPhoto(photoId) {
            this.selectedPhotoId = photoId;
        },

        async toggleFavorite(photoId) {
            const photo = this.photos.find(p => p.id === photoId);
            if (photo) {
                photo.favorite = !photo.favorite;
                // TODO: API call to update favorite status
            }
        },

        formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },

        setupKeyboardNavigation() {
            // Will be called by the keyboard event handler
        },

        handleKeyboard(event) {
            const photos = this.filteredPhotos;
            if (photos.length === 0) return;

            // Handle space bar to open full screen
            if (event.key === ' ' || event.key === 'Spacebar') {
                if (this.selectedPhotoId !== null && !this.fullScreenMode) {
                    event.preventDefault();
                    this.openFullScreen(this.selectedPhotoId);
                    return;
                }
            }

            const currentIndex = photos.findIndex(p => p.id === this.selectedPhotoId);
            
            switch (event.key) {
                case 'ArrowRight':
                    event.preventDefault();
                    if (this.selectedPhotoId === null) {
                        this.selectPhoto(photos[0].id);
                    } else {
                        const nextIndex = (currentIndex + 1) % photos.length;
                        this.selectPhoto(photos[nextIndex].id);
                    }
                    break;
                    
                case 'ArrowLeft':
                    event.preventDefault();
                    if (this.selectedPhotoId === null) {
                        this.selectPhoto(photos[photos.length - 1].id);
                    } else {
                        const prevIndex = currentIndex === 0 ? photos.length - 1 : currentIndex - 1;
                        this.selectPhoto(photos[prevIndex].id);
                    }
                    break;
                    
                case 'ArrowDown':
                    event.preventDefault();
                    // Navigate down a row (approximate)
                    const gridCols = Math.floor(window.innerWidth / 220); // approximate
                    const nextRowIndex = Math.min(photos.length - 1, currentIndex + gridCols);
                    this.selectPhoto(photos[nextRowIndex].id);
                    break;
                    
                case 'ArrowUp':
                    event.preventDefault();
                    // Navigate up a row
                    const gridColsUp = Math.floor(window.innerWidth / 220);
                    const prevRowIndex = Math.max(0, currentIndex - gridColsUp);
                    this.selectPhoto(photos[prevRowIndex].id);
                    break;
                    
                case 'f':
                case 'F':
                    if (this.selectedPhotoId !== null && !this.fullScreenMode) {
                        event.preventDefault();
                        this.toggleFavorite(this.selectedPhotoId);
                    }
                    break;
                    
                case 'Escape':
                    if (this.fullScreenMode) {
                        event.preventDefault();
                        this.closeFullScreen();
                    } else {
                        this.selectedPhotoId = null;
                    }
                    break;
            }
            
            // Scroll selected photo into view
            if (this.selectedPhotoId !== null && !this.fullScreenMode) {
                this.$nextTick(() => {
                    const selectedElement = document.querySelector('.photo-item.selected');
                    if (selectedElement) {
                        selectedElement.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest' 
                        });
                    }
                });
            }
        },

        handleFullScreenKeyboard(event) {
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
                    this.toggleFullScreenFavorite();
                    break;
                    
                case 'Escape':
                case 'q':
                case 'Q':
                    event.preventDefault();
                    this.closeFullScreen();
                    break;
            }
        },

        openFullScreen(photoId) {
            const photoIndex = this.filteredPhotos.findIndex(p => p.id === photoId);
            if (photoIndex !== -1) {
                this.currentPhotoIndex = photoIndex;
                this.fullScreenMode = true;
            }
        },

        closeFullScreen() {
            this.fullScreenMode = false;
        },

        nextPhoto() {
            if (this.currentPhotoIndex < this.filteredPhotos.length - 1) {
                this.currentPhotoIndex++;
            }
        },

        previousPhoto() {
            if (this.currentPhotoIndex > 0) {
                this.currentPhotoIndex--;
            }
        },

        toggleFullScreenFavorite() {
            if (this.currentPhoto) {
                this.toggleFavorite(this.currentPhoto.id);
            }
        }
    }
}
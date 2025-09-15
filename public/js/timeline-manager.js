class TimelineManager {
    constructor() {
        this.selectedYear = null;
        this.selectedMonth = null;
        this.mobileTimelineView = 'all'; // 'years', 'months', 'all'
    }

    getYears(photos) {
        const yearSet = new Set();
        photos.forEach(photo => {
            const date = new Date(photo.date);
            yearSet.add(date.getFullYear());
        });
        return Array.from(yearSet).sort((a, b) => b - a);
    }

    getMonths(photos, selectedYear) {
        if (!selectedYear) return [];
        
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const monthSet = new Set();
        photos.forEach(photo => {
            const date = new Date(photo.date);
            if (date.getFullYear() === selectedYear) {
                monthSet.add(date.getMonth());
            }
        });
        
        return Array.from(monthSet)
            .sort((a, b) => b - a)
            .map(month => ({
                number: month,
                name: monthNames[month]
            }));
    }

    selectYear(year) {
        this.selectedYear = year;
        this.selectedMonth = null;
    }

    selectMonth(month) {
        this.selectedMonth = month;
    }

    clearFilters() {
        this.selectedYear = null;
        this.selectedMonth = null;
    }

    setMobileView(view) {
        this.mobileTimelineView = view;
        if (view === 'all') {
            this.selectedYear = null;
            this.selectedMonth = null;
        }
    }

    filterPhotos(photos, searchQuery) {
        let filtered = photos;

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
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
    }
}
import { Photo, Month, MobileTimelineView } from './types.js';

export class TimelineManager {
    private selectedYear: number | null = null;
    private selectedMonth: number | null = null;
    private mobileTimelineView: MobileTimelineView = 'all';

    get currentSelectedYear(): number | null {
        return this.selectedYear;
    }

    get currentSelectedMonth(): number | null {
        return this.selectedMonth;
    }

    get currentMobileView(): MobileTimelineView {
        return this.mobileTimelineView;
    }

    getYears(photos: Photo[]): number[] {
        const yearSet = new Set<number>();
        photos.forEach(photo => {
            const date = new Date(photo.date);
            yearSet.add(date.getFullYear());
        });
        return Array.from(yearSet).sort((a, b) => b - a);
    }

    getMonths(photos: Photo[], selectedYear: number | null): Month[] {
        if (!selectedYear) return [];
        
        const monthNames: string[] = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const monthSet = new Set<number>();
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

    selectYear(year: number): void {
        this.selectedYear = year;
        this.selectedMonth = null;
    }

    selectMonth(month: number): void {
        this.selectedMonth = month;
    }

    clearFilters(): void {
        this.selectedYear = null;
        this.selectedMonth = null;
    }

    setMobileView(view: MobileTimelineView): void {
        this.mobileTimelineView = view;
        if (view === 'all') {
            this.selectedYear = null;
            this.selectedMonth = null;
        }
    }

    filterPhotos(photos: Photo[], searchQuery: string): Photo[] {
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

        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
}
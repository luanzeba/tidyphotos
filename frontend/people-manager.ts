import { Person } from './types.js';

export class PeopleManager {
    private _people: Person[] = [];
    private _isLoading = false;

    get people(): Person[] {
        return this._people;
    }

    get isLoading(): boolean {
        return this._isLoading;
    }

    async loadPeople(): Promise<void> {
        this._isLoading = true;
        try {
            const response = await fetch('/api/people');
            if (!response.ok) {
                throw new Error(`Failed to load people: ${response.statusText}`);
            }
            const data = await response.json();
            this._people = data.people || [];
            console.log(`📋 Loaded ${this._people.length} people`);
        } catch (error) {
            console.error('❌ Error loading people:', error);
            this._people = [];
        } finally {
            this._isLoading = false;
        }
    }

    async addPerson(name: string): Promise<Person | null> {
        try {
            const response = await fetch('/api/people', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name }),
            });

            if (!response.ok) {
                throw new Error(`Failed to add person: ${response.statusText}`);
            }

            const data = await response.json();
            const newPerson = data.person;

            this._people.push(newPerson);
            console.log(`✅ Added person: ${newPerson.name}`);
            return newPerson;
        } catch (error) {
            console.error('❌ Error adding person:', error);
            return null;
        }
    }

    async updatePerson(id: number, name: string): Promise<boolean> {
        try {
            const response = await fetch(`/api/people/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name }),
            });

            if (!response.ok) {
                throw new Error(`Failed to update person: ${response.statusText}`);
            }

            const data = await response.json();
            const updatedPerson = data.person;

            const index = this._people.findIndex(p => p.id === id);
            if (index !== -1) {
                this._people[index] = updatedPerson;
                console.log(`✅ Updated person: ${updatedPerson.name}`);
            }
            return true;
        } catch (error) {
            console.error('❌ Error updating person:', error);
            return false;
        }
    }

    async deletePerson(id: number): Promise<boolean> {
        try {
            const response = await fetch(`/api/people/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(`Failed to delete person: ${response.statusText}`);
            }

            this._people = this._people.filter(p => p.id !== id);
            console.log(`✅ Deleted person with ID: ${id}`);
            return true;
        } catch (error) {
            console.error('❌ Error deleting person:', error);
            return false;
        }
    }

    getPerson(id: number): Person | null {
        return this._people.find(p => p.id === id) || null;
    }

    findPersonByName(name: string): Person | null {
        return this._people.find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
    }
}
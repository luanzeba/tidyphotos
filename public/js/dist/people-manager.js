// Self-contained People Manager with Alpine.js integration
// Usage in HTML: <div x-data="peopleManager()">
// Global singleton instance
let managerInstance = null;
class InternalPeopleManager {
    constructor() {
        this.people = [];
        this.isLoading = false;
    }
    async loadPeople() {
        this.isLoading = true;
        try {
            const response = await fetch("/api/people");
            if (!response.ok) {
                throw new Error(`Failed to load people: ${response.statusText}`);
            }
            const data = await response.json();
            this.people = data.people || [];
            console.log(`📋 Loaded ${this.people.length} people`);
        }
        catch (error) {
            console.error("❌ Error loading people:", error);
            this.people = [];
        }
        finally {
            this.isLoading = false;
        }
    }
    async addPerson(name) {
        try {
            const response = await fetch("/api/people", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name }),
            });
            if (!response.ok) {
                throw new Error(`Failed to add person: ${response.statusText}`);
            }
            const newPerson = await response.json();
            this.people.push(newPerson);
            console.log(`✅ Added person: ${newPerson.name}`);
            return newPerson;
        }
        catch (error) {
            console.error("❌ Error adding person:", error);
            return null;
        }
    }
    async updatePerson(id, name) {
        try {
            const response = await fetch(`/api/people/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name }),
            });
            if (!response.ok) {
                throw new Error(`Failed to update person: ${response.statusText}`);
            }
            const data = await response.json();
            const updatedPerson = data.person;
            const index = this.people.findIndex((p) => p.id === id);
            if (index !== -1) {
                this.people[index] = updatedPerson;
                console.log(`✅ Updated person: ${updatedPerson.name}`);
            }
            return true;
        }
        catch (error) {
            console.error("❌ Error updating person:", error);
            return false;
        }
    }
    async deletePerson(id) {
        try {
            const response = await fetch(`/api/people/${id}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                throw new Error(`Failed to delete person: ${response.statusText}`);
            }
            this.people = this.people.filter((p) => p.id !== id);
            console.log(`✅ Deleted person with ID: ${id}`);
            return true;
        }
        catch (error) {
            console.error("❌ Error deleting person:", error);
            return false;
        }
    }
    getPerson(id) {
        return this.people.find((p) => p.id === id) || null;
    }
    findPersonByName(name) {
        return (this.people.find((p) => p.name.toLowerCase() === name.toLowerCase()) || null);
    }
}
// Alpine.js data function
export function peopleManager() {
    // Create singleton instance
    if (!managerInstance) {
        managerInstance = new InternalPeopleManager();
    }
    return {
        // Reactive state
        people: managerInstance.people,
        isLoading: managerInstance.isLoading,
        showAddPersonModal: false,
        showEditPersonModal: false,
        personForm: { id: null, name: "" },
        // Lazy initialization - called when view becomes visible
        async init() {
            console.log("🔄 PeopleManager: Loading people...");
            await managerInstance.loadPeople();
            // Sync reactive data with manager
            this.people = managerInstance.people;
            this.isLoading = managerInstance.isLoading;
            console.log("✅ PeopleManager: Loaded", this.people.length, "people");
        },
        // Add person
        async addPerson() {
            if (this.personForm.name.trim()) {
                const result = await managerInstance.addPerson(this.personForm.name.trim());
                if (result) {
                    // Sync state
                    this.people = managerInstance.people;
                    this.closePersonModal();
                }
            }
        },
        // Update person
        async updatePerson() {
            if (this.personForm.id && this.personForm.name.trim()) {
                const result = await managerInstance.updatePerson(this.personForm.id, this.personForm.name.trim());
                if (result) {
                    // Sync state
                    this.people = managerInstance.people;
                    this.closePersonModal();
                }
            }
        },
        // Edit person (open modal)
        editPerson(person) {
            this.personForm.id = person.id;
            this.personForm.name = person.name;
            this.showEditPersonModal = true;
        },
        // Delete person
        async deletePerson(person) {
            if (confirm(`Are you sure you want to delete "${person.name}"? This will remove all associated photo tags.`)) {
                const result = await managerInstance.deletePerson(person.id);
                if (result) {
                    // Sync state
                    this.people = managerInstance.people;
                }
            }
        },
        // Close modal
        closePersonModal() {
            this.showAddPersonModal = false;
            this.showEditPersonModal = false;
            this.personForm.id = null;
            this.personForm.name = "";
        },
    };
}
window.peopleManager = peopleManager;
//# sourceMappingURL=people-manager.js.map
/**
 * Memory Store for Screen Control
 * Provides persistent memory across computer control steps
 * Inspired by Meka Agent's memory system
 */

class MemoryStore {
    constructor() {
        this.dataStore = new Map();
        this.metadata = new Map();
        this.maxSize = 100; // Maximum number of memory entries
    }

    /**
     * Store a new memory entry
     */
    store(key, value, metadata = {}) {
        if (this.dataStore.size >= this.maxSize) {
            // Remove oldest entry if at capacity
            const firstKey = this.dataStore.keys().next().value;
            this.delete(firstKey);
        }

        this.dataStore.set(key, value);
        this.metadata.set(key, {
            ...metadata,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            accessCount: 0
        });

        console.log(`[MemoryStore] Stored: ${key} = ${JSON.stringify(value).substring(0, 100)}`);
        return { success: true, key, value };
    }

    /**
     * Update an existing memory entry
     */
    update(key, value, metadata = {}) {
        if (!this.dataStore.has(key)) {
            return this.store(key, value, metadata);
        }

        const existingMeta = this.metadata.get(key) || {};
        this.dataStore.set(key, value);
        this.metadata.set(key, {
            ...existingMeta,
            ...metadata,
            updatedAt: Date.now(),
            accessCount: (existingMeta.accessCount || 0) + 1
        });

        console.log(`[MemoryStore] Updated: ${key} = ${JSON.stringify(value).substring(0, 100)}`);
        return { success: true, key, value };
    }

    /**
     * Retrieve a memory entry
     */
    retrieve(key) {
        if (!this.dataStore.has(key)) {
            console.log(`[MemoryStore] Key not found: ${key}`);
            return { success: false, error: `Key "${key}" not found` };
        }

        const value = this.dataStore.get(key);
        const meta = this.metadata.get(key);
        
        // Update access count
        if (meta) {
            meta.accessCount = (meta.accessCount || 0) + 1;
            meta.lastAccessedAt = Date.now();
            this.metadata.set(key, meta);
        }

        console.log(`[MemoryStore] Retrieved: ${key} = ${JSON.stringify(value).substring(0, 100)}`);
        return { success: true, key, value, metadata: meta };
    }

    /**
     * Delete a memory entry
     */
    delete(key) {
        const existed = this.dataStore.has(key);
        this.dataStore.delete(key);
        this.metadata.delete(key);
        
        console.log(`[MemoryStore] Deleted: ${key} (existed: ${existed})`);
        return { success: existed };
    }

    /**
     * List all memory keys
     */
    list() {
        const entries = [];
        for (const [key, value] of this.dataStore.entries()) {
            const meta = this.metadata.get(key);
            entries.push({
                key,
                valuePreview: JSON.stringify(value).substring(0, 50),
                metadata: meta
            });
        }
        
        console.log(`[MemoryStore] Listed ${entries.length} entries`);
        return { success: true, entries };
    }

    /**
     * Clear all memory
     */
    clear() {
        const size = this.dataStore.size;
        this.dataStore.clear();
        this.metadata.clear();
        
        console.log(`[MemoryStore] Cleared ${size} entries`);
        return { success: true, cleared: size };
    }

    /**
     * Search memory by pattern
     */
    search(pattern) {
        const results = [];
        const regex = new RegExp(pattern, 'i');
        
        for (const [key, value] of this.dataStore.entries()) {
            const valueStr = JSON.stringify(value);
            if (regex.test(key) || regex.test(valueStr)) {
                results.push({
                    key,
                    value,
                    metadata: this.metadata.get(key)
                });
            }
        }
        
        console.log(`[MemoryStore] Found ${results.length} matches for pattern: ${pattern}`);
        return { success: true, results };
    }

    /**
     * Get memory statistics
     */
    getStats() {
        const stats = {
            totalEntries: this.dataStore.size,
            maxSize: this.maxSize,
            utilizationPercent: (this.dataStore.size / this.maxSize) * 100,
            oldestEntry: null,
            newestEntry: null,
            mostAccessed: null
        };

        let oldest = Infinity;
        let newest = 0;
        let maxAccess = 0;

        for (const [key, meta] of this.metadata.entries()) {
            if (meta.createdAt < oldest) {
                oldest = meta.createdAt;
                stats.oldestEntry = { key, createdAt: new Date(meta.createdAt) };
            }
            if (meta.createdAt > newest) {
                newest = meta.createdAt;
                stats.newestEntry = { key, createdAt: new Date(meta.createdAt) };
            }
            if (meta.accessCount > maxAccess) {
                maxAccess = meta.accessCount;
                stats.mostAccessed = { key, accessCount: meta.accessCount };
            }
        }

        return stats;
    }

    /**
     * Export memory to JSON
     */
    export() {
        const data = {
            store: Object.fromEntries(this.dataStore),
            metadata: Object.fromEntries(this.metadata),
            timestamp: Date.now()
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import memory from JSON
     */
    import(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            this.dataStore.clear();
            this.metadata.clear();
            
            for (const [key, value] of Object.entries(data.store)) {
                this.dataStore.set(key, value);
            }
            
            for (const [key, meta] of Object.entries(data.metadata)) {
                this.metadata.set(key, meta);
            }
            
            console.log(`[MemoryStore] Imported ${this.dataStore.size} entries`);
            return { success: true, imported: this.dataStore.size };
        } catch (error) {
            console.error('[MemoryStore] Import failed:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = MemoryStore;
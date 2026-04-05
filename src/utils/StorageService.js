// StorageService.js — now delegates to ApiService (PostgreSQL backend).
// All browser storage backends (OPFS, IndexedDB, localStorage) are replaced
// by the Django REST API. This file is kept for import compatibility.
export { apiService as storageService, apiService } from './ApiService.js';

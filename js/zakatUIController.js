import {DateConverter} from './dateConverter.js';
import {NisabService} from './nisabService.js';
import {LanguageManager} from './languageManager.js';
import {ZakatCalculator} from './zakatCalculator.js';

export class ZakatUIController {
    constructor() {
        // Initialize services and dependencies
        this.languageManager = new LanguageManager();
        this.dateConverter = new DateConverter();
        this.nisabService = new NisabService();
        this.calculator = new ZakatCalculator(this.languageManager, this.dateConverter, this.nisabService);
        this.zakatData = [];
        
        // Cache DOM elements that are frequently accessed
        this.domElements = {};
        
        this.init();
    }

    init() {
        // Cache DOM elements for better performance
        this.cacheDOMElements();
        this.setupEventListeners();
        
        // Set initial language based on browser preference
        const browserLang = navigator.language.split('-')[0];
        const initialLang = ['fr', 'ar', 'en'].includes(browserLang) ? browserLang : 'en';
        this.languageManager.changeLanguage(initialLang);
    }
    
    cacheDOMElements() {
        // Cache frequently accessed DOM elements
        this.domElements = {
            zakatTable: document.getElementById('zakatTable'),
            nisabTable: document.getElementById('nisabTable'),
            languageSelect: document.getElementById('languageSelect'),
            filterToggle: document.getElementById('filterZakatToggle'),
            uploadButton: document.querySelector('.file-upload button'),
            fileInput: document.getElementById('dataUpload'),
            apiNote: document.querySelector('.api-note')
        };
    }

    setupEventListeners() {
        // Use cached DOM elements and add event listeners
        if (this.domElements.languageSelect) {
            this.domElements.languageSelect.addEventListener('change', (e) => {
                if (e?.target?.value) {
                    this.changeLanguage(e.target.value);
                }
            });
        }

        this.domElements.uploadButton?.addEventListener('click', 
            () => this.processUploads());

        this.domElements.filterToggle?.addEventListener('change', 
            () => this.updateUI());
    }

    changeLanguage(lang) {
        this.languageManager.changeLanguage(lang);
        if (this.zakatData.length > 0) {
            this.updateUI();
        }
    }

    async processUploads() {
        if (!this.domElements.fileInput?.files.length) return;

        try {
            this.showLoadingState();
            const file = this.domElements.fileInput.files[0];
            const data = JSON.parse(await file.text());

            // Validate JSON structure
            this.validateJsonData(data);

            this.calculator.setMonthlyData(data.monthlyData);
            this.nisabService.setNisabData(data.nisabData);

            if (data.goldApiKey) {
                this.nisabService.setApiKey(data.goldApiKey);
            }

            this.zakatData = await this.calculator.calculateZakat();
            this.updateUI();
        } catch (error) {
            this.showErrorState(error);
        }
    }

    // Add validation method
    validateJsonData(data) {
        // Basic validation
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid JSON format');
        }

        // Check required data sections
        if (!data.monthlyData || !Array.isArray(data.monthlyData) || data.monthlyData.length === 0) {
            throw new Error('Missing or invalid monthly data');
        }

        if (!data.nisabData || typeof data.nisabData !== 'object' || Object.keys(data.nisabData).length === 0) {
            throw new Error('Missing or invalid nisab data');
        }

        // Validate monthly data structure
        for (const entry of data.monthlyData) {
            if (!entry.date || typeof entry.date !== 'string' ||
                !entry.amount || isNaN(Number(entry.amount))) {
                throw new Error('Invalid monthly data format');
            }
        }

        // Validate nisab data structure
        for (const [year, value] of Object.entries(data.nisabData)) {
            if (!/^\d{4}$/.test(year) || isNaN(Number(value))) {
                throw new Error('Invalid nisab data format');
            }
        }
    }

    updateUI() {
        this.generateZakatTable();
        this.generateNisabTable();
    }

    showLoadingState() {
        const loadingHTML = `<div class="loading">${this.languageManager.translate('loading')}</div>`;
        this.domElements.zakatTable.innerHTML = loadingHTML;
        this.domElements.nisabTable.innerHTML = loadingHTML;
    }

    showErrorState(error) {
        console.error('File processing error:', error);
        const errorMessage = this.languageManager.translate('error-loading-data');
        const errorHTML = `<p class="error">${errorMessage}</p>`;
        this.domElements.zakatTable.innerHTML = errorHTML;
        this.domElements.nisabTable.innerHTML = errorHTML;
    }

    generateZakatTable() {
        const container = this.domElements.zakatTable;
        container.innerHTML = '';
    
        const isFiltered = this.domElements.filterToggle?.checked || false;
    
        // Filter data if the toggle is checked - use more efficient filtering
        const displayData = isFiltered
            ? this.zakatData.filter(row => row.zakat || row.note.includes('due'))
            : this.zakatData;
    
        // Create table with ID for DataTables
        const table = document.createElement('table');
        table.id = 'zakatDataTable';
        table.className = 'display';
        
        // Use template literals for better performance with large datasets
        const headers = this.getTableHeaders().map(h => `<th>${h}</th>`).join('');
        const rows = this.generateTableRows(displayData);
        
        table.innerHTML = `
            <thead>
                <tr>${headers}</tr>
            </thead>
            <tbody>${rows}</tbody>
        `;
    
        container.appendChild(table);
        
        // Initialize DataTables with configuration
        this.initializeDataTable('zakatDataTable', true);
    }
    
    generateTableRows(data) {
        return data.map(row => `
            <tr data-row-class="${row.rowClass}">
                <td>${row.date}</td>
                <td>${row.hijriDate}</td>
                <td>${this.formatCurrency(row.amount)}</td>
                <td>${this.formatCurrency(row.interest)}</td>
                <td>${this.formatCurrency(row.total)}</td>
                <td>${this.formatCurrency(row.nisab)}</td>
                <td>${row.zakat ? this.formatCurrency(row.zakat) : '-'}</td>
                <td data-i18n="${row.note}">${this.languageManager.translate(row.note).replace('{date}', row.date)}</td>     
            </tr>
        `).join('');
    }

    generateNisabTable() {
        const container = this.domElements.nisabTable;
        container.innerHTML = '';
    
        const nisabData = this.nisabService.getNisabData();
    
        // Show/hide API note based on data source
        if (this.domElements.apiNote) {
            this.domElements.apiNote.style.display = nisabData.fromApi ? '' : 'none';
        }
    
        // Create table with ID for DataTables
        const table = document.createElement('table');
        table.id = 'nisabDataTable';
        table.className = 'display';
        
        const yearHeader = this.languageManager.translate('year');
        const nisabHeader = this.languageManager.translate('nisab-eur');
        
        const rows = Object.entries(nisabData.data).map(([year, value]) => `
            <tr>
                <td>${year}</td>
                <td>${this.formatCurrency(value)}</td>
            </tr>
        `).join('');
        
        table.innerHTML = `
            <thead>
                <tr>
                    <th>${yearHeader}</th>
                    <th>${nisabHeader}</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        `;
    
        container.appendChild(table);
        
        // Initialize DataTables with configuration
        this.initializeDataTable('nisabDataTable', false);
    }
    
    initializeDataTable(tableId, isPaginated) {
        $(document).ready(() => {
            $(`#${tableId}`).DataTable({
                responsive: true,
                paging: isPaginated,
                searching: false,  // Disable searching
                ordering: false,   // Disable ordering/sorting
                info: isPaginated,
                stripe: false,     // Disable striping (even/odd rows)
                // Enable scroller extension for infinite scroll (only for paginated tables)
                scrollY: isPaginated ? '50vh' : '',
                scrollCollapse: isPaginated,
                scroller: isPaginated,
                deferRender: isPaginated,
                // Set page length options
                lengthMenu: isPaginated ? [[25, 50, 100, -1], [25, 50, 100, this.languageManager.translate('all') || 'All']] : undefined,
                language: this.getDataTableLanguage(),
                // Apply row classes after DataTables processing
                createdRow: function(row, data, dataIndex) {
                    // Get the row class from the data-row-class attribute
                    const rowClass = $(row).attr('data-row-class');
                    if (rowClass) {
                        $(row).addClass(rowClass);
                    }
                }
            });
        });
    }
    
    getDataTableLanguage() {
        return {
            lengthMenu: this.languageManager.translate('show_entries') || 'Show _MENU_ entries',
            info: this.languageManager.translate('showing_entries') || 'Showing _START_ to _END_ of _TOTAL_ entries',
            infoEmpty: this.languageManager.translate('showing_0_entries') || 'Showing 0 to 0 of 0 entries',
            paginate: {
                first: this.languageManager.translate('first') || 'First',
                last: this.languageManager.translate('last') || 'Last',
                next: this.languageManager.translate('next') || 'Next',
                previous: this.languageManager.translate('previous') || 'Previous'
            }
        };
    }

    getTableHeaders() {
        return ['date', 'hijri-date', 'amount', 'interest', 'total', 'nisab', 'zakat', 'notes']
            .map(key => this.languageManager.translate(key));
    }

    formatCurrency(value) {
        return value ? `€${Number(value).toFixed(2)}` : '-';
    }
}
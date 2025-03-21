import {DateConverter} from './dateConverter.js';
import {NisabService} from './nisabService.js';
import {LanguageManager} from './languageManager.js';
import {ZakatCalculator} from './zakatCalculator.js';

// Configuration constants
const CONFIG = {
    DEFAULT_LANGUAGE: 'en',
    SUPPORTED_LANGUAGES: ['fr', 'ar', 'en'],
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    DEFAULT_NISAB_VALUE: 5200,
    TABLE_CONFIG: {
        paging: true,
        searching: true,
        ordering: true,
        responsive: true,
        language: {
            search: "",
            searchPlaceholder: "Search..."
        }
    },
    // Add date configuration options
    DATE_CONFIG: {
        USE_HIJRI: true, // Whether to use Hijri calendar for Hawl calculations
        HAWL_PERIOD_MONTHS: 12, // Standard Hawl period in months
        DATE_FORMAT: {
            GREGORIAN: 'YYYY-MM-DD',
            HIJRI: 'iYYYY/iMM/iDD'
        }
    }
};

// DOM element IDs
const DOM_IDS = {
    ZAKAT_TABLE: 'zakatTable',
    NISAB_TABLE: 'nisabTable',
    LANGUAGE_SELECT: 'languageSelect',
    FILTER_TOGGLE: 'filterZakatToggle',
    FILE_INPUT: 'dataUpload',
    API_NOTE: '.api-note',
    DOWNLOAD_LINK: 'downloadLink',
    DOWNLOAD_EXCEL_LINK: 'downloadExcelLink',
    DOWNLOAD_CSV_LINK: 'downloadCsvLink',
    ADD_ROW_FORM: 'addRowForm',
    ADD_ROW_BUTTON: '.add-row-button',
    SAVE_ROW_BUTTON: '.save-row-button',
    CANCEL_ROW_BUTTON: '.cancel-row-button',
    NEW_ROW_DATE: 'newRowDate',
    NEW_ROW_AMOUNT: 'newRowAmount',
    NEW_ROW_INTEREST: 'newRowInterest'
};

export class ZakatUIController {
    constructor(options = {}) {
        // Merge provided options with defaults
        this.options = {
            ...{
                defaultLanguage: CONFIG.DEFAULT_LANGUAGE,
                supportedLanguages: CONFIG.SUPPORTED_LANGUAGES,
                cacheDuration: CONFIG.CACHE_DURATION,
                defaultNisabValue: CONFIG.DEFAULT_NISAB_VALUE,
                tableConfig: CONFIG.TABLE_CONFIG,
                dateConfig: CONFIG.DATE_CONFIG // Add date configuration
            },
            ...options
        };

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

    // Add method to initialize moment-hijri
    async initializeMomentHijri() {
        // Only load if we're using Hijri dates
        if (this.options.dateConfig.USE_HIJRI) {
            try {
                // Check if moment is already available
                if (!window.moment) {
                    console.warn('Moment.js not loaded. Loading from CDN...');
                    await this.loadScript('https://cdn.jsdelivr.net/npm/moment@2.29.4/moment.min.js');
                }
                
                // Check if moment-hijri is already available
                if (!window.moment.hijri) {
                    console.log('Loading moment-hijri...');
                    await this.loadScript('https://cdn.jsdelivr.net/npm/moment-hijri@2.1.2/moment-hijri.min.js');
                }
                
                console.log('Moment-hijri initialized successfully');
            } catch (error) {
                console.error('Failed to initialize moment-hijri:', error);
                // Set fallback to use Gregorian dates
                this.options.dateConfig.USE_HIJRI = false;
            }
        }
    }
    
    // Helper method to load scripts asynchronously
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            
            document.head.appendChild(script);
        });
    }

    async init() {
        // Cache DOM elements for better performance
        this.cacheDOMElements();
        this.setupEventListeners();

        // Set initial language based on browser preference
        const browserLang = navigator.language.split('-')[0];
        const initialLang = this.options.supportedLanguages.includes(browserLang) 
            ? browserLang 
            : this.options.defaultLanguage;
        this.languageManager.changeLanguage(initialLang);
        
        // Load gold price data
        await this.nisabService.loadGoldPriceData();
        
        // Check for data in URL parameters
        this.checkUrlForData();
    }
    
    // Add method to check URL for data parameter
    checkUrlForData() {
        const urlParams = new URLSearchParams(window.location.search);
        const dataParam = urlParams.get('data');
        
        if (dataParam) {
            try {
                // Try to decode and parse the data
                const decodedData = decodeURIComponent(dataParam);
                const jsonData = JSON.parse(decodedData);
                
                // Process the data
                this.processJsonData(jsonData);
            } catch (error) {
                console.error('Error loading data from URL:', error);
            }
        }
    }
    
    // Process JSON data from any source
    processJsonData(data) {
        try {
            // Validate JSON structure
            this.validateJsonData(data);

            this.calculator.setMonthlyData(data.monthlyData);
            this.nisabService.setNisabData(data.nisabData);

            if (data.goldApiKey) {
                this.nisabService.setApiKey(data.goldApiKey);
            }

            this.calculator.calculateZakat().then(zakatData => {
                this.zakatData = zakatData;
                this.updateUI();
            });
        } catch (error) {
            this.showErrorState(error);
        }
    }

    async processUploads() {
        if (!this.domElements.fileInput?.files.length) return;

        try {
            this.showLoadingState();
            const file = this.domElements.fileInput.files[0];
            let data;
            
            // Check file extension to determine processing method
            if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                // Process Excel file
                data = await this.convertExcelToJson(file);
            } else if (file.name.toLowerCase().endsWith('.csv')) {
                // Process CSV file
                data = await this.convertCsvToJson(file);
            } else {
                // Process JSON file
                data = JSON.parse(await file.text());
            }
            
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

    // Add CSV conversion method
    // Enhanced CSV conversion method with support for different separators
    async convertCsvToJson(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const csvData = e.target.result;
                    
                    // Detect the separator by analyzing the first few lines
                    const separator = this.detectCsvSeparator(csvData);
                    
                    // Use XLSX library to parse CSV with the detected separator
                    const workbook = XLSX.read(csvData, { 
                        type: 'string',
                        cellDates: false,
                        // Set the detected separator
                        FS: separator
                    });
                    
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    // Format data to match expected structure
                    const monthlyData = jsonData.map(row => {
                        return {
                            date: row.Date || row.date,
                            amount: Number(row.Amount || row.amount),
                            interest: (row.Interest !== undefined ? Number(row.Interest) : 
                                      (row.interest !== undefined ? Number(row.interest) : null))
                        };
                    });
                    
                    // Create a comprehensive nisab data object for all years in the data
                    const nisabData = {};
                    const defaultNisabValue = 5200; // Default value
                    
                    // Extract all years from the monthly data
                    monthlyData.forEach(entry => {
                        const [month, year] = entry.date.split('/');
                        if (year && !nisabData[year]) {
                            nisabData[year] = defaultNisabValue;
                        }
                    });
                    
                    // Ensure we have at least the current year if no data was found
                    if (Object.keys(nisabData).length === 0) {
                        const currentYear = new Date().getFullYear();
                        nisabData[currentYear.toString()] = defaultNisabValue;
                    }
                    
                    resolve({
                        monthlyData: monthlyData,
                        nisabData: nisabData
                    });
                } catch (error) {
                    reject(new Error(`CSV parsing error: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Error reading CSV file'));
            reader.readAsText(file);
        });
    }
    
    // Helper method to detect CSV separator
    detectCsvSeparator(csvData) {
        // Get the first few lines to analyze
        const lines = csvData.split('\n').slice(0, 5).filter(line => line.trim().length > 0);
        if (lines.length === 0) return ','; // Default to comma if no lines
        
        // Common separators to check
        const separators = [',', ';', '\t', '|'];
        const counts = {};
        
        // Initialize counts
        separators.forEach(sep => counts[sep] = 0);
        
        // Count occurrences of each separator in the first line
        // We focus on the header line which should contain the separator
        const headerLine = lines[0];
        
        separators.forEach(sep => {
            // Count how many times this separator appears in the line
            const count = (headerLine.match(new RegExp(sep === '\t' ? '\t' : `\\${sep}`, 'g')) || []).length;
            counts[sep] = count;
        });
        
        // Find the separator with the highest count
        let maxCount = 0;
        let detectedSeparator = ','; // Default to comma
        
        separators.forEach(sep => {
            if (counts[sep] > maxCount) {
                maxCount = counts[sep];
                detectedSeparator = sep;
            }
        });
        
        return detectedSeparator;
    }
    
    // Add CSV download method
    downloadExampleCsv() {
        // Create a new workbook
        const wb = XLSX.utils.book_new();
        
        // Create data with your specified format
        const exampleData = [
            { Date: "08/2022", Amount: 1458, Interest: 5 },
            { Date: "09/2022", Amount: 1500, Interest: 3 },
            { Date: "10/2022", Amount: 1550, Interest: 0 }
        ];
        
        // Create worksheet from data
        const ws = XLSX.utils.json_to_sheet(exampleData);
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Zakat Data");
        
        // Generate CSV file and trigger download
        XLSX.writeFile(wb, "zakat_example_template.csv", { bookType: 'csv' });
    }

    downloadExampleJSON() {
        // Create example data structure
        const exampleData = {
            monthlyData: [
                { date: "01/2023", amount: 5000, interest: null },
                { date: "02/2023", amount: 5200, interest: 10 },
                { date: "03/2023", amount: 5300, interest: null }
            ],
            nisabData: {
                "2023": 5200
            },
            goldApiKey: "YOUR_GOLD_API_KEY_HERE" // Optional
        };
        
        // Convert to JSON string with pretty formatting
        const jsonString = JSON.stringify(exampleData, null, 2);
        
        // Create a blob and download link
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create temporary link and trigger download
        const tempLink = document.createElement('a');
        tempLink.href = url;
        tempLink.download = 'zakat_example.json';
        document.body.appendChild(tempLink);
        tempLink.click();
        
        // Clean up
        document.body.removeChild(tempLink);
        URL.revokeObjectURL(url);
        
        // Show how to use URL parameter (add a small info message)
        const infoMessage = document.createElement('div');
        infoMessage.className = 'info-message';
        infoMessage.textContent = this.languageManager.translate('url_param_info') || 
            'Tip: You can share data via URL by adding ?data={"monthlyData":[...],"nisabData":{...}} to the URL';
        
        // Add to page and remove after 10 seconds
        document.body.appendChild(infoMessage);
        setTimeout(() => {
            if (document.body.contains(infoMessage)) {
                document.body.removeChild(infoMessage);
            }
        }, 10000);
    }

    cacheDOMElements() {
        // Cache frequently accessed DOM elements using the DOM_IDS constants
        this.domElements = {
            zakatTable: document.getElementById(DOM_IDS.ZAKAT_TABLE),
            nisabTable: document.getElementById(DOM_IDS.NISAB_TABLE),
            languageSelect: document.getElementById(DOM_IDS.LANGUAGE_SELECT),
            filterToggle: document.getElementById(DOM_IDS.FILTER_TOGGLE),
            uploadButton: document.querySelector('.file-upload button'),
            fileInput: document.getElementById(DOM_IDS.FILE_INPUT),
            apiNote: document.querySelector(DOM_IDS.API_NOTE),
            downloadLink: document.getElementById(DOM_IDS.DOWNLOAD_LINK),
            downloadExcelLink: document.getElementById(DOM_IDS.DOWNLOAD_EXCEL_LINK),
            downloadCsvLink: document.getElementById(DOM_IDS.DOWNLOAD_CSV_LINK),
            // Add references to the form elements
            addRowForm: document.getElementById(DOM_IDS.ADD_ROW_FORM),
            addRowButton: document.querySelector(DOM_IDS.ADD_ROW_BUTTON),
            saveRowButton: document.querySelector(DOM_IDS.SAVE_ROW_BUTTON),
            cancelRowButton: document.querySelector(DOM_IDS.CANCEL_ROW_BUTTON),
            newRowDate: document.getElementById(DOM_IDS.NEW_ROW_DATE),
            newRowAmount: document.getElementById(DOM_IDS.NEW_ROW_AMOUNT),
            newRowInterest: document.getElementById(DOM_IDS.NEW_ROW_INTEREST)
        };
    }

    // Method to initialize DataTable with configurable options
    initializeDataTable(tableId, enablePaging = true) {
        const table = $(`#${tableId}`);
        if (table.length) {
            // Apply table configuration with any custom options
            const tableConfig = {
                ...this.options.tableConfig,
                paging: enablePaging
            };
            
            // Add language-specific configurations
            if (this.languageManager) {
                const currentLang = this.languageManager.currentLanguage;
                tableConfig.language = {
                    ...tableConfig.language,
                    searchPlaceholder: this.languageManager.translate('search') || "Search...",
                    paginate: {
                        first: this.languageManager.translate('first') || "First",
                        last: this.languageManager.translate('last') || "Last",
                        next: this.languageManager.translate('next') || "Next",
                        previous: this.languageManager.translate('previous') || "Previous"
                    }
                };
                
                // Set RTL for Arabic
                if (currentLang === 'ar') {
                    tableConfig.direction = 'rtl';
                }
            }
            
            // Initialize the DataTable
            table.DataTable(tableConfig);
        }
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
        
        // Add download link event listeners
        this.domElements.downloadLink?.addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadExampleJSON();
        });
        
        this.domElements.downloadExcelLink?.addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadExampleExcel();
        });
        
        this.domElements.downloadCsvLink?.addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadExampleCsv();
        });
        
        // Add form-related event listeners directly to the cached elements
        this.domElements.addRowButton?.addEventListener('click', () => this.showAddRowForm());
        this.domElements.saveRowButton?.addEventListener('click', () => this.saveNewRow());
        this.domElements.cancelRowButton?.addEventListener('click', () => this.hideAddRowForm());
    }

    changeLanguage(lang) {
        this.languageManager.changeLanguage(lang);
        if (this.zakatData.length > 0) {
            this.updateUI();
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
        
        // Check if it's an Excel parsing error
        if (error.message && error.message.includes('Excel parsing error')) {
            const errorMessage = this.languageManager.translate('excel-parsing-error');
            const errorHTML = `<p class="error">${errorMessage}</p>`;
            this.domElements.zakatTable.innerHTML = errorHTML;
        } else {
            const errorMessage = this.languageManager.translate('error-loading-data');
            const errorHTML = `<p class="error">${errorMessage}: ${error.message}</p>`;
            this.domElements.zakatTable.innerHTML = errorHTML;
        }
        
        this.domElements.nisabTable.innerHTML = '';
    }

    generateZakatTable() {
        const container = this.domElements.zakatTable;
        container.innerHTML = '';
    
        const isFiltered = this.domElements.filterToggle?.checked || false;
    
        // Filter data if the toggle is checked - use more efficient filtering
        const displayData = isFiltered
            ? this.zakatData.filter(row => row.zakat || row.note.includes('due'))
            : this.zakatData;
    
        // Create table with data
        const table = this.createZakatTable(displayData);
        
        // Append table to container
        container.appendChild(table);
        
        // Initialize DataTables with configuration
        this.initializeDataTable('zakatDataTable', true);
    }

    // Create the zakat table
    createZakatTable(displayData) {
        const table = document.createElement('table');
        table.id = 'zakatDataTable';
        table.className = 'display';
        
        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        this.getTableHeaders().forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create table body with rows
        const tbody = document.createElement('tbody');
        tbody.innerHTML = this.generateTableRows(displayData);
        table.appendChild(tbody);
        
        return table;
    }

    generateTableRows(data) {
        // Use document fragment for better performance when building rows
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        // Build HTML string for better performance than DOM manipulation
        const rowsHTML = data.map(row => `
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
        
        return rowsHTML;
    }

    generateNisabTable() {
        const container = this.domElements.nisabTable;
        container.innerHTML = '';

        const nisabData = this.nisabService.getNisabData();

        // Show/hide API note based on data source
        if (this.domElements.apiNote) {
            this.domElements.apiNote.style.display = nisabData.fromApi ? '' : 'none';
        }

        // Create document fragment for better performance
        const fragment = document.createDocumentFragment();

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

        fragment.appendChild(table);
        container.appendChild(fragment);

        // Initialize DataTables with configuration
        this.initializeDataTable('nisabDataTable', false);
    }

    initializeDataTable(tableId, isPaginated) {
        $(document).ready(() => {
            $(`#${tableId}`).DataTable({
                responsive: {
                    details: {
                        display: $.fn.dataTable.Responsive.display.childRow,
                        type: 'column',
                        renderer: function(api, rowIdx, columns) {
                            const data = $.map(columns, function(col, i) {
                                return col.hidden ?
                                    `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
                                        <td>${col.title}:</td>
                                        <td>${col.data}</td>
                                    </tr>` :
                                    '';
                            }).join('');
                            
                            return data ? 
                                `<table class="responsive-details">${data}</table>` : 
                                false;
                        }
                    }
                },
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
                createdRow: function (row, data, dataIndex) {
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
            info: this.languageManager.translate('showing_entries') || 'Showing _START_ to _END_ of _TOTAL_ records',
            infoEmpty: this.languageManager.translate('showing_0_entries') || 'Showing 0 to 0 of 0 records',
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
    
    // Show/hide form methods
    showAddRowForm() {
        if (this.domElements.addRowForm) {
            this.domElements.addRowForm.classList.remove('hidden');
        }
    }
    
    hideAddRowForm() {
        if (this.domElements.addRowForm) {
            this.domElements.addRowForm.classList.add('hidden');
            // Reset form fields
            this.resetFormFields();
        }
    }
    
    resetFormFields() {
        if (this.domElements.newRowDate) this.domElements.newRowDate.value = '';
        if (this.domElements.newRowAmount) this.domElements.newRowAmount.value = '';
        if (this.domElements.newRowInterest) this.domElements.newRowInterest.value = '0';
        
        // Remove any error classes
        document.querySelectorAll('#addRowForm .form-group').forEach(group => {
            group.classList.remove('error');
        });
    }
    
    saveNewRow() {
        // Validate form inputs
        if (!this.validateForm()) {
            return;
        }
        
        // Get values from form
        const date = this.domElements.newRowDate.value;
        const amount = parseFloat(this.domElements.newRowAmount.value);
        const interest = parseFloat(this.domElements.newRowInterest.value) || 0;
        
        // Add new entry to monthly data
        const newEntry = { date, amount, interest: interest > 0 ? interest : null };
        const currentData = this.calculator.getMonthlyData();
        currentData.push(newEntry);
        
        // Sort data by date
        currentData.sort((a, b) => {
            const dateA = this.dateConverter.parseDate(a.date);
            const dateB = this.dateConverter.parseDate(b.date);
            return dateA - dateB;
        });
        
        // Update calculator with new data
        this.calculator.setMonthlyData(currentData);
        
        // Recalculate zakat and update UI
        this.calculator.calculateZakat().then(data => {
            this.zakatData = data;
            this.updateUI();
            this.hideAddRowForm();
        });
    }
    
    validateForm() {
        let isValid = true;
        
        // Validate date format (MM/YYYY)
        const dateInput = this.domElements.newRowDate;
        const dateGroup = dateInput.closest('.form-group');
        const dateRegex = /^(0[1-9]|1[0-2])\/\d{4}$/;
        
        if (!dateRegex.test(dateInput.value)) {
            dateGroup.classList.add('error');
            isValid = false;
        } else {
            dateGroup.classList.remove('error');
        }
        
        // Validate amount (must be positive number)
        const amountInput = this.domElements.newRowAmount;
        const amountGroup = amountInput.closest('.form-group');
        const amount = parseFloat(amountInput.value);
        
        if (isNaN(amount) || amount <= 0) {
            amountGroup.classList.add('error');
            isValid = false;
        } else {
            amountGroup.classList.remove('error');
        }
        
        // Validate interest (must be non-negative number)
        const interestInput = this.domElements.newRowInterest;
        const interestGroup = interestInput.closest('.form-group');
        const interest = parseFloat(interestInput.value) || 0;
        
        if (isNaN(interest) || interest < 0) {
            interestGroup.classList.add('error');
            isValid = false;
        } else {
            interestGroup.classList.remove('error');
        }
        
        return isValid;
    }

    // Excel conversion method - Fix the data structure issue
    async convertExcelToJson(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Get the first sheet
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Convert to JSON
                    const excelData = XLSX.utils.sheet_to_json(worksheet);
                    
                    // Format data to match expected structure
                    const monthlyData = excelData.map(row => {
                        return {
                            date: row.Date || row.date,
                            amount: Number(row.Amount || row.amount),
                            interest: (row.Interest !== undefined ? Number(row.Interest) : 
                                          (row.interest !== undefined ? Number(row.interest) : null))
                        };
                    });
                    
                    // Create a comprehensive nisab data object for all years in the data
                    const nisabData = {};
                    const defaultNisabValue = 5200; // Default value
                    
                    // Extract all years from the monthly data
                    monthlyData.forEach(entry => {
                        const [month, year] = entry.date.split('/');
                        if (year && !nisabData[year]) {
                            nisabData[year] = defaultNisabValue;
                        }
                    });
                    
                    // Ensure we have at least the current year if no data was found
                    if (Object.keys(nisabData).length === 0) {
                        const currentYear = new Date().getFullYear();
                        nisabData[currentYear.toString()] = defaultNisabValue;
                    }
                    
                    resolve({
                        monthlyData: monthlyData,
                        nisabData: nisabData
                    });
                } catch (error) {
                    reject(new Error(`Excel parsing error: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Error reading Excel file'));
            reader.readAsArrayBuffer(file);
        });
    }

    // Excel download method
    downloadExampleExcel() {
        // Create a new workbook
        const wb = XLSX.utils.book_new();
        
        // Create data with your specified format
        const exampleData = [
            { Date: "08/2022", Amount: 1458, Interest: 5 },
            { Date: "09/2022", Amount: 1500, Interest: 3 },
            { Date: "10/2022", Amount: 1550, Interest: 0 }
        ];
        
        // Create worksheet from data
        const ws = XLSX.utils.json_to_sheet(exampleData);
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Zakat Data");
        
        // Generate Excel file and trigger download
        XLSX.writeFile(wb, "zakat_example_template.xlsx");
    }
}
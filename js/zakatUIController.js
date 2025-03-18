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
            const data = JSON.parse(await file.text());

            // Use the common method to process the data
            this.processJsonData(data);
        } catch (error) {
            this.showErrorState(error);
        }
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
        // Cache frequently accessed DOM elements
        this.domElements = {
            zakatTable: document.getElementById('zakatTable'),
            nisabTable: document.getElementById('nisabTable'),
            languageSelect: document.getElementById('languageSelect'),
            filterToggle: document.getElementById('filterZakatToggle'),
            uploadButton: document.querySelector('.file-upload button'),
            fileInput: document.getElementById('dataUpload'),
            apiNote: document.querySelector('.api-note'),
            downloadLink: document.getElementById('downloadLink'),
            // Add references to the form elements
            addRowForm: document.getElementById('addRowForm'),
            addRowButton: document.querySelector('.add-row-button'),
            saveRowButton: document.querySelector('.save-row-button'),
            cancelRowButton: document.querySelector('.cancel-row-button'),
            newRowDate: document.getElementById('newRowDate'),
            newRowAmount: document.getElementById('newRowAmount'),
            newRowInterest: document.getElementById('newRowInterest')
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
        
        // Add download link event listener
        this.domElements.downloadLink?.addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadExampleJSON();
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
    
        // Create table with data
        const table = this.createZakatTable(displayData);
        
        // Append table to container
        container.appendChild(table);
        
        // Initialize DataTables with configuration
        this.initializeDataTable('zakatDataTable', true);
    }

    // Add the missing createZakatTable method
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
    
    // Add the missing downloadExampleJSON method
    downloadExampleJSON() {
        const downloadFile = (data, fileName) => {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
    
            const tempLink = document.createElement('a');
            tempLink.href = url;
            tempLink.download = fileName;
            document.body.appendChild(tempLink);
            tempLink.click();
    
            document.body.removeChild(tempLink);
            URL.revokeObjectURL(url);
        };
    
        // Fetch example data from GitHub repository
        fetch('https://raw.githubusercontent.com/khalilcharfi/zakat/refs/heads/main/data.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(exampleData => {
                downloadFile(exampleData, 'zakat_example.json');
                
                // Show how to use URL parameter (add a small info message)
                const infoMessage = document.createElement('div');
                infoMessage.className = 'info-message';
                infoMessage.textContent = this.languageManager.translate('url_param_info') || 
                    'Tip: You can share data via URL by adding ?data={"monthlyData":[...],"nisabData":{...}} to the URL';
                
                document.body.appendChild(infoMessage);
                setTimeout(() => {
                    if (document.body.contains(infoMessage)) {
                        document.body.removeChild(infoMessage);
                    }
                }, 10000);
            })
            .catch(error => {
                console.error('Error fetching example data:', error);
                
                // Fallback to hardcoded example if fetch fails
                const fallbackData = {
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
    
                downloadFile(fallbackData, 'zakat_example.json');
            });
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
}
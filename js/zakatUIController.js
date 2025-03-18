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
        
        // Optimize event delegation with a single listener
        document.addEventListener('click', this.handleAddRowInteractions.bind(this));
    }

    // Separate method for better organization and testability
    handleAddRowInteractions(e) {
        const target = e.target.closest('.add-row-button, .save-row-button, .cancel-row-button');
        if (!target) return;
        
        if (target.classList.contains('add-row-button')) {
            this.showAddRowForm();
        } else if (target.classList.contains('save-row-button')) {
            this.saveNewRow();
        } else if (target.classList.contains('cancel-row-button')) {
            this.hideAddRowForm();
        }
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
    
        // Create elements once and append in batches for better performance
        const addRowContainer = this.createAddRowContainer();
        const addRowForm = this.createAddRowForm();
        const table = this.createZakatTable(displayData);
        
        // Append all elements at once to minimize DOM reflows
        container.append(addRowContainer, addRowForm, table);
        
        // Initialize DataTables with configuration
        this.initializeDataTable('zakatDataTable', true);
    }
    
    // Helper methods for better organization and reusability
    createAddRowContainer() {
        const container = document.createElement('div');
        container.className = 'add-row-container';
        
        const button = document.createElement('button');
        button.className = 'add-row-button';
        
        const icon = document.createElement('i');
        icon.className = 'fa fa-plus';
        
        button.append(icon, ' ', this.languageManager.translate('add-new-entry') || 'Add New Entry');
        container.appendChild(button);
        
        return container;
    }
    
    createAddRowForm() {
        const form = document.createElement('div');
        form.className = 'add-row-form hidden';
        form.id = 'addRowForm';
        
        // Use document fragment to improve performance
        const fragment = document.createDocumentFragment();
        
        const title = document.createElement('h3');
        title.className = 'add-row-form-title';
        title.textContent = this.languageManager.translate('add-new-entry') || 'Add New Entry';
        fragment.appendChild(title);
        
        // Create form fields
        const formRow = this.createFormRow();
        fragment.appendChild(formRow);
        
        // Create action buttons
        const formActions = this.createFormActions();
        fragment.appendChild(formActions);
        
        form.appendChild(fragment);
        return form;
    }
    
    createFormRow() {
        const formRow = document.createElement('div');
        formRow.className = 'form-row';
        
        // Date field
        formRow.appendChild(this.createFormGroup(
            'newRowDate',
            this.languageManager.translate('date') || 'Date',
            'text',
            '01/2023',
            this.languageManager.translate('invalid-date') || 'Invalid date format',
            true
        ));
        
        // Amount field
        formRow.appendChild(this.createFormGroup(
            'newRowAmount',
            this.languageManager.translate('amount') || 'Amount',
            'number',
            '1000.00',
            this.languageManager.translate('invalid-amount') || 'Invalid amount',
            true,
            { step: '0.01', min: '0' }
        ));
        
        // Interest field
        formRow.appendChild(this.createFormGroup(
            'newRowInterest',
            this.languageManager.translate('interest') || 'Interest',
            'number',
            '0.00',
            this.languageManager.translate('invalid-interest') || 'Invalid interest',
            false,
            { step: '0.01', min: '0', value: '0' }
        ));
        
        return formRow;
    }
    
    createFormGroup(id, label, type, placeholder, errorMessage, required, attributes = {}) {
        const group = document.createElement('div');
        group.className = 'form-group';
        
        const labelEl = document.createElement('label');
        labelEl.setAttribute('for', id);
        labelEl.textContent = `${label} ${type === 'text' ? '(MM/YYYY)' : '(€)'}`;
        
        const input = document.createElement('input');
        input.id = id;
        input.type = type;
        input.placeholder = placeholder;
        if (required) input.required = true;
        
        // Apply additional attributes
        Object.entries(attributes).forEach(([key, value]) => {
            input.setAttribute(key, value);
        });
        
        const error = document.createElement('div');
        error.className = 'error-message';
        error.textContent = errorMessage;
        
        group.append(labelEl, input, error);
        return group;
    }
    
    createFormActions() {
        const actions = document.createElement('div');
        actions.className = 'form-actions';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-row-button';
        cancelBtn.textContent = this.languageManager.translate('cancel') || 'Cancel';
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-row-button';
        saveBtn.textContent = this.languageManager.translate('save') || 'Save';
        
        actions.append(cancelBtn, saveBtn);
        return actions;
    }
    
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
    
    // Move these methods inside the class
    showAddRowForm() {
        const form = document.getElementById('addRowForm');
        if (form) {
            form.classList.remove('hidden');
        }
    }

    hideAddRowForm() {
        const form = document.getElementById('addRowForm');
        if (form) {
            form.classList.add('hidden');
            // Reset form fields
            form.querySelectorAll('input').forEach(input => {
                input.value = '';
                input.parentElement.classList.remove('error');
            });
        }
    }

    validateNewRowData() {
        let isValid = true;
        const dateInput = document.getElementById('newRowDate');
        const amountInput = document.getElementById('newRowAmount');
        const interestInput = document.getElementById('newRowInterest');
        
        if (!dateInput || !amountInput || !interestInput) return false;
        
        // Validate date format (MM/YYYY)
        const dateRegex = /^(0[1-9]|1[0-2])\/\d{4}$/;
        if (!dateRegex.test(dateInput.value)) {
            dateInput.parentElement.classList.add('error');
            isValid = false;
        } else {
            dateInput.parentElement.classList.remove('error');
        }
        
        // Validate amount (must be a positive number)
        if (isNaN(amountInput.value) || parseFloat(amountInput.value) <= 0) {
            amountInput.parentElement.classList.add('error');
            isValid = false;
        } else {
            amountInput.parentElement.classList.remove('error');
        }
        
        // Validate interest (must be a non-negative number)
        if (isNaN(interestInput.value) || parseFloat(interestInput.value) < 0) {
            interestInput.parentElement.classList.add('error');
            isValid = false;
        } else {
            interestInput.parentElement.classList.remove('error');
        }
        
        return isValid;
    }

    async saveNewRow() {
        if (!this.validateNewRowData()) {
            return;
        }
        
        const dateInput = document.getElementById('newRowDate');
        const amountInput = document.getElementById('newRowAmount');
        const interestInput = document.getElementById('newRowInterest');
        
        // Create new entry
        const newEntry = {
            date: dateInput.value,
            amount: parseFloat(amountInput.value),
            interest: parseFloat(interestInput.value) || 0
        };
        
        try {
            // Add to monthly data
            this.calculator.monthlyData.push(newEntry);
            
            // Recalculate zakat
            this.zakatData = await this.calculator.calculateZakat();
            
            // Update UI
            this.updateUI();
            
            // Hide form
            this.hideAddRowForm();
            
            // Highlight the new row
            setTimeout(() => {
                const table = document.getElementById('zakatDataTable');
                if (table) {
                    const rows = table.querySelectorAll('tbody tr');
                    // Find the row with the matching date
                    for (const row of rows) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length > 0 && cells[0].textContent === newEntry.date) {
                            row.classList.add('new-row-highlight');
                            // Scroll to the row
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            break;
                        }
                    }
                }
            }, 100);
        } catch (error) {
            console.error('Error adding new row:', error);
            alert(this.languageManager.translate('error-adding-row') || 'Error adding new row');
        }
    }
}
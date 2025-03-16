import {DateConverter} from './dateConverter.js';
import {NisabService} from './nisabService.js';
import {LanguageManager} from './languageManager.js';
import {ZakatCalculator} from './zakatCalculator.js';

export class ZakatUIController {
    constructor() {
        this.languageManager = new LanguageManager();
        this.dateConverter = new DateConverter();
        this.nisabService = new NisabService();
        this.calculator = new ZakatCalculator( this.languageManager, this.dateConverter, this.nisabService);
        this.zakatData = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.languageManager.changeLanguage(['fr', 'ar', 'en'].includes(navigator.language.split('-')[0])
            ? navigator.language.split('-')[0]
            : 'en');
    }

    setupEventListeners() {
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                if (e && e.target && e.target.value) {
                    this.changeLanguage(e.target.value);
                }
            });
        }
        
        document.querySelector('.file-upload button').addEventListener('click',
            () => this.processUploads());

        document.getElementById('filterZakatToggle')?.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.getElementById('zakatTable')?.querySelectorAll('.row')?.forEach((row) => {
                if (!isChecked) {
                    row.classList.remove('hide');
                } else if (!row.classList.contains('zakat-due')) {
                    row.classList.add('hide');
                }
            });
        });
    }

    changeLanguage(lang) {
        this.languageManager.changeLanguage(lang);
        if (this.zakatData.length > 0) {
            this.updateUI();
        }
    }

    async processUploads() {
        const fileInput = document.getElementById('dataUpload');
        if (!fileInput.files.length) return;

        try {
            this.showLoadingState();
            const file = fileInput.files[0];
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
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid JSON format');
        }

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
        document.getElementById('zakatTable').innerHTML = loadingHTML;
        document.getElementById('nisabTable').innerHTML = loadingHTML;
    }

    showErrorState(error) {
        console.error('File processing error:', error);
        const errorMessage = this.languageManager.translate('error-loading-data');
        const errorHTML = `<p class="error">${errorMessage}</p>`;
        document.getElementById('zakatTable').innerHTML = errorHTML;
        document.getElementById('nisabTable').innerHTML = errorHTML;
    }

    generateZakatTable() {
        const container = document.getElementById('zakatTable');
        container.innerHTML = '';

        const isFiltered = document.getElementById('filterZakatToggle')?.checked || false;

        // Filter data if the toggle is checked
        const displayData = isFiltered
            ? this.zakatData.filter(row => row.zakat || row.note.includes('due'))
            : this.zakatData;

        const table = document.createElement('table');
        table.innerHTML = `
        <tr>${this.getTableHeaders().map(h => `<th>${h}</th>`).join('')}</tr>
        ${displayData.map(row => `
            <tr class="row ${row.rowClass}">
                <td>${row.date}</td>
                <td>${row.hijriDate}</td>
                <td>${this.formatCurrency(row.amount)}</td>
                <td>${this.formatCurrency(row.interest)}</td>
                <td>${this.formatCurrency(row.total)}</td>
                <td>${this.formatCurrency(row.nisab)}</td>
                <td>${row.zakat ? this.formatCurrency(row.zakat) : '-'}</td>
                <td>${this.languageManager.translate(row.note)}</td>
            </tr>
        `).join('')}
    `;

        container.appendChild(table);
    }

    getTableHeaders() {
        return ['date', 'hijri-date', 'amount', 'interest', 'total', 'nisab', 'zakat', 'notes']
            .map(key => this.languageManager.translate(key));
    }

    generateNisabTable() {
        const container = document.getElementById('nisabTable');
        container.innerHTML = '';

        const nisabData = this.nisabService.getNisabData();
        
        // Show/hide API note based on data source
        const apiNoteElement = document.querySelector('.api-note');
        if (apiNoteElement) {
            apiNoteElement.style.display = nisabData.fromApi ? '' : 'none';
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <tr>
                <th>${this.languageManager.translate('year')}</th>
                <th>${this.languageManager.translate('nisab-eur')}</th>
            </tr>
            ${Object.entries(nisabData.data).map(([year, value]) => `
                <tr>
                    <td>${year}</td>
                    <td>${this.formatCurrency(value)}</td>
                </tr>
            `).join('')}
        `;

        container.appendChild(table);
    }

    formatCurrency(value) {
        return value ? `€${Number(value).toFixed(2)}` : '-';
    }
}
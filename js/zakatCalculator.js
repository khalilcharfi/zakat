import { DateConverter } from './dateConverter.js';
import { NisabService } from './nisabService.js';
import { LanguageManager } from './languageManager.js';

export class ZakatCalculator {
    constructor() {
        this.dateConverter = new DateConverter();
        this.nisabService = new NisabService();
        this.languageManager = new LanguageManager();
        this.monthlyData = [];
        this.goldApiKey = '';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.languageManager.changeLanguage('en');
    }

    setupEventListeners() {
        document.getElementById('languageSelect').addEventListener('change', (e) =>
            this.changeLanguage(e.target.value));

        document.querySelector('.file-upload button').addEventListener('click', () =>
            this.processUploads());
    }

    changeLanguage(lang) {
        this.languageManager.changeLanguage(lang);
        if (this.monthlyData.length > 0) {
            this.calculateZakat();
            this.generateNisabTable();
        }
    }

    async processUploads() {
        const fileInput = document.getElementById('dataUpload');
        if (!fileInput.files.length) return;

        try {
            this.showLoadingState();
            const file = fileInput.files[0];
            const data = JSON.parse(await file.text());

            if (!data.monthlyData || !data.nisabData) {
                throw new Error('Invalid file structure');
            }

            this.monthlyData = data.monthlyData;
            this.nisabService.setNisabData(data.nisabData);
            if (data.goldApiKey) this.nisabService.setApiKey(data.goldApiKey);

            await this.calculateZakat();
            this.generateNisabTable();
        } catch (error) {
            this.showErrorState(error);
        }
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

    async calculateZakat() {
        const hawlState = {
            isActive: false,
            startDate: null,
            monthsCount: 0
        };

        const sortedData = [...this.monthlyData].sort(
            (a, b) => new Date(a.Date) - new Date(b.Date)
        );

        const dateYearMap = new Map();
        const uniqueDates = new Set();
        const uniqueYears = new Set();

        sortedData.forEach(entry => {
            const [month, year] = entry.Date.split('/');
            dateYearMap.set(entry.Date, new Date(year, month - 1).getFullYear());
            uniqueDates.add(entry.Date);
            uniqueYears.add(dateYearMap.get(entry.Date));
        });

        try {
            const [hijriDates, nisabValues] = await Promise.all([
                Promise.all(
                    [...uniqueDates].map(async date => ({
                        date,
                        hijri: await this.dateConverter.getHijriDate(date)
                    }))
                ),
                Promise.all(
                    [...uniqueYears].map(async year => ({
                        year,
                        value: await this.nisabService.fetchNisabValue(year)
                    }))
                )
            ]);

            const hijriDateMap = new Map(hijriDates.map(({ date, hijri }) => [date, hijri]));
            const nisabMap = new Map(nisabValues.map(({ year, value }) => [year, value]));

            const results = sortedData.map(entry => {
                const total = (entry.Amount || 0) + (entry.Interest || 0);
                const year = dateYearMap.get(entry.Date);

                const { note, zakat, rowClass } = this.calculateHawlStatus(
                    total,
                    nisabMap.get(year),
                    hawlState,
                    entry.Date
                );

                return {
                    date: entry.Date,
                    hijriDate: hijriDateMap.get(entry.Date),
                    amount: this.formatCurrency(entry.Amount),
                    interest: this.formatCurrency(entry.Interest),
                    total: this.formatCurrency(total),
                    nisab: this.formatCurrency(nisabMap.get(year)),
                    zakat: zakat ? this.formatCurrency(zakat) : '-',
                    note,
                    rowClass
                };
            });

            this.generateZakatTable(results);
        } catch (error) {
            console.error('Error calculating Zakat:', error);
            throw error;
        }
    }

    calculateHawlStatus(total, nisab, hawlState, currentDate) {
        let note = '', zakat = null, rowClass = '';

        if (total >= nisab) {
            if (!hawlState.isActive) {
                hawlState.isActive = true;
                hawlState.startDate = currentDate;
                hawlState.monthsCount = 1;
                note = this.languageManager.translate('above-nisab-hawl-begins');
                rowClass = 'hawl-start';
            } else {
                hawlState.monthsCount++;

                if (hawlState.monthsCount >= 12) {
                    zakat = total * 0.025;
                    note = `${this.languageManager.translate('hawl-complete-zakat-due')} ${hawlState.startDate}`;
                    rowClass = 'zakat-due';

                    hawlState.isActive = false;
                    hawlState.startDate = null;
                    hawlState.monthsCount = 0;
                } else {
                    note = this.languageManager.translate('hawl-continues');
                }
            }
        } else {
            hawlState.isActive = false;
            hawlState.startDate = null;
            hawlState.monthsCount = 0;
            note = this.languageManager.translate('below-nisab');
            rowClass = 'below-nisab';
        }

        return { note, zakat, rowClass };
    }

    generateZakatTable(data) {
        const container = document.getElementById('zakatTable');
        container.innerHTML = '';

        const table = document.createElement('table');
        table.innerHTML = `
            <tr>${this.getTableHeaders().map(h => `<th>${h}</th>`).join('')}</tr>
            ${data.map(row => `
                <tr class="${row.rowClass}">
                    <td>${row.date}</td>
                    <td>${row.hijriDate}</td>
                    <td>${row.amount}</td>
                    <td>${row.interest}</td>
                    <td>${row.total}</td>
                    <td>${row.nisab}</td>
                    <td>${row.zakat}</td>
                    <td>${row.note}</td>
                </tr>
            `).join('')}
        `;

        container.appendChild(table);
    }

    getTableHeaders() {
        return [
            'date', 'hijri-date', 'amount', 'interest',
            'total', 'nisab', 'zakat', 'notes'
        ].map(key => this.languageManager.translate(key));
    }

    generateNisabTable() {
        const container = document.getElementById('nisabTable');
        container.innerHTML = '';

        const nisabData = this.nisabService.getNisabData();
        const table = document.createElement('table');
        table.innerHTML = `
            <tr>
                <th>${this.languageManager.translate('year')}</th>
                <th>${this.languageManager.translate('nisab-eur')}</th>
            </tr>
            ${Object.entries(nisabData).map(([year, value]) => `
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
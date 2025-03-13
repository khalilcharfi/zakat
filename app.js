(function () {
    'use strict';

    class CacheManager {
        constructor(cacheKey, ttl, parseFunction) {
            this.cacheKey = cacheKey;
            this.ttl = ttl;
            this.parseFunction = parseFunction || (data => data);
        }

        load(defaultValue) {
            try {
                const storedData = localStorage.getItem(this.cacheKey);
                if (!storedData) return defaultValue;

                const { data, timestamp } = JSON.parse(storedData);
                return (Date.now() - timestamp < this.ttl)
                    ? this.parseFunction(data)
                    : defaultValue;
            } catch (e) {
                console.error('Cache load error:', e);
                return defaultValue;
            }
        }

        save(data) {
            try {
                localStorage.setItem(
                    this.cacheKey,
                    JSON.stringify({
                        data,
                        timestamp: Date.now()
                    })
                );
                return true;
            } catch (e) {
                console.error('Cache save error:', e);
                return false;
            }
        }
    }

    class DateConverter {
        constructor() {
            this.cacheManager = new CacheManager(
                'hijriCache',
                24 * 60 * 60 * 1000,
                (data) => new Map(data)
            );
            this.hijriDateCache = this.cacheManager.load(new Map());

            // Add rate limiting properties
            this.requestQueue = [];
            this.isProcessingQueue = false;
            this.requestDelay = 1000; // 1 second between requests
        }

        async getHijriDate(gregDate) {
            if (this.hijriDateCache.has(gregDate)) {
                return this.hijriDateCache.get(gregDate);
            }

            // Return a promise that will be resolved when the request is processed
            return new Promise((resolve) => {
                this.requestQueue.push({ gregDate, resolve });
                this.processQueue();
            });
        }

        async processQueue() {
            // If already processing requests, just return
            if (this.isProcessingQueue) return;

            this.isProcessingQueue = true;

            while (this.requestQueue.length > 0) {
                const { gregDate, resolve } = this.requestQueue.shift();

                // Check cache again in case it was populated by a previous request
                if (this.hijriDateCache.has(gregDate)) {
                    resolve(this.hijriDateCache.get(gregDate));
                    continue;
                }

                try {
                    const [month, year] = gregDate.split('/');
                    const response = await fetch(
                        `https://api.aladhan.com/v1/gToH/01-${month.padStart(2, '0')}-${year}`
                    );
                    const data = await response.json();

                    if (data.code === 200) {
                        const hijriDate = data.data.hijri.date.split('-').slice(1).reverse().join('/');
                        this.hijriDateCache.set(gregDate, hijriDate);
                        this.cacheManager.save([...this.hijriDateCache.entries()]);
                        resolve(hijriDate);
                    } else {
                        resolve('N/A');
                    }
                } catch (error) {
                    console.error("Hijri date conversion failed:", error);
                    resolve('Error');
                }

                // Wait before processing next request if queue is not empty
                if (this.requestQueue.length > 0) {
                    await new Promise(r => setTimeout(r, this.requestDelay));
                }
            }

            this.isProcessingQueue = false;
        }
    }

    class NisabService {
        constructor() {
            this.cacheManager = new CacheManager(
                'nisabCache',
                24 * 60 * 60 * 1000,
                (data) => {
                    return data;
                }
            );
            this.nisabData = this.cacheManager.load({});
            this.goldApiKey = '';
            // Track ongoing requests to prevent duplicates
            this.pendingRequests = {};
        }

        setApiKey(apiKey) {
            this.goldApiKey = apiKey;
        }

        setNisabData(data) {
            this.nisabData = data;
            this.cacheManager.save(this.nisabData);
        }

        getNisabData() {
            return this.nisabData;
        }

        async fetchNisabValue(year) {
            try {
                // Return cached value if available
                if (this.nisabData[year]) {
                    return this.nisabData[year];
                }

                // If there's already a pending request for this year, return that promise
                if (this.pendingRequests[year]) {
                    return this.pendingRequests[year];
                }
                if (!this.goldApiKey) {
                    throw new Error('No API key provided');
                }

                // Create the request and store its promise
                this.pendingRequests[year] = (async () => {
                    try {
                        const response = await fetch('https://www.goldapi.io/api/XAU/EUR', {
                            headers: {'x-access-token': this.goldApiKey}
                        });

                        // Handle specific HTTP status codes
                        if (response.status === 401) {
                            throw new Error('Authentication failed: Invalid API key');
                        } else if (response.status === 403) {
                            throw new Error('Permission denied: Insufficient access rights');
                        } else if (response.status === 404) {
                            throw new Error('API endpoint not found');
                        } else if (!response.ok) {
                            throw new Error(`Gold API failed with status: ${response.status}`);
                        }

                        const data = await response.json();

                        // Validate the received data structure
                        if (!data || typeof data.price_gram_24k !== 'number') {
                            throw new Error('Invalid data format received from API');
                        }

                        const nisabValue = data.price_gram_24k * 85;

                        // Update cache
                        this.nisabData[year] = nisabValue;
                        this.cacheManager.save(this.nisabData);
                        return nisabValue;
                    } finally {
                        // Clean up the pending request reference once done
                        delete this.pendingRequests[year];
                    }
                })();

                return this.pendingRequests[year];
            } catch (error) {
                console.error("Nisab value fetch error:", error);

                // Rethrow with more context if needed
                if (error.message.includes('API key') ||
                    error.message.includes('Authentication') ||
                    error.message.includes('Permission')) {
                    throw new Error(`API authorization error: ${error.message}`);
                }

                throw error;
            }
        }
    }

    const translations = {
        en: {
            "zakat-calculation-title": "Zakat Calculation Table",
            "nisab-reference-title": "Nisab Reference Table",
            "api-note": "* Live Nisab calculated using <a href=\"https://www.goldapi.io/\" target=\"_blank\">GoldAPI</a> (85g of gold)",
            "api-error": "⚠️ Failed to fetch live gold price",
            "date": "Date (Gregorian)",
            "hijri-date": "Date (Hijri)",
            "amount": "Amount",
            "interest": "Interest",
            "total": "Total",
            "nisab": "Nisab",
            "zakat": "Zakat",
            "notes": "Notes",
            "year": "Year",
            "nisab-eur": "Nisab (€)",
            "above-nisab-hawl-begins": "Above Nisab. Hawl begins.",
            "hawl-continues": "Hawl continues.",
            "hawl-complete-zakat-due": "Hawl complete. Zakat due since ",
            "below-nisab": "Below Nisab. Hawl reset.",
            "error-loading-data": "Error loading data files",
            "loading": "Loading data...",
            "upload-data-title": "Upload Your Data",
            "combined-data-label": "Combined Data (JSON):",
            "process-uploads": "Process Uploads",
            "upload-format-info": "Upload your data as a JSON file. See example below:",
            'select-language': 'Select Language',
            'upload-section-title': 'Upload Financial Data',
            'example-format-summary': 'Show Example Format',
            'upload-data-prompt': 'Please upload your financial data file to begin calculations.',
        },
        fr: {
            "zakat-calculation-title": "Tableau de calcul de la Zakat",
            "nisab-reference-title": "Tableau de référence du Nisab",
            "api-note": "* Nisab en direct calculé à l'aide de <a href=\"https://www.goldapi.io/\" target=\"_blank\">GoldAPI</a> (85g d'or)",
            "api-error": "⚠️ Échec de la récupération du prix de l'or en direct",
            "date": "Date (Grégorien)",
            "hijri-date": "Date (Hégirien)",
            "amount": "Montant",
            "interest": "Intérêt",
            "total": "Total",
            "nisab": "Nisab",
            "zakat": "Zakat",
            "notes": "Remarques",
            "year": "Année",
            "nisab-eur": "Nisab (€)",
            "above-nisab-hawl-begins": "Au-dessus du Nisab. Le Hawl commence.",
            "hawl-continues": "Le Hawl continue.",
            "hawl-complete-zakat-due": "Hawl complet. Zakat due depuis ",
            "below-nisab": "En dessous du Nisab. Hawl réinitialisé.",
            "error-loading-data": "Erreur lors du chargement des fichiers de données",
            "loading": "Chargement des données...",
            "upload-data-title": "Téléchargez vos données",
            "combined-data-label": "Données combinées (JSON) :",
            "process-uploads": "Traiter les téléchargements",
            "upload-format-info": "Téléchargez vos données sous forme de fichier JSON. Voir l'exemple ci-dessous :",
            'select-language': 'Sélectionner la langue',
            'upload-section-title': 'Télécharger les données financières',
            'example-format-summary': "Afficher l'exemple de format",
            'upload-data-prompt': 'Veuillez télécharger votre fichier de données financières pour commencer les calculs.',
        },
        ar: {
            "zakat-calculation-title": "جدول حساب الزكاة",
            "nisab-reference-title": "جدول مرجع النصاب",
            "api-note": "* يتم حساب النصاب الحي باستخدام <a href=\"https://www.goldapi.io/\" target=\"_blank\">GoldAPI</a> (85 جرامًا من الذهب)",
            "api-error": "⚠️ فشل جلب سعر الذهب المباشر",
            "date": "التاريخ (ميلادي)",
            "hijri-date": "التاريخ (هجري)",
            "amount": "المبلغ",
            "interest": "الفائدة",
            "total": "المجموع",
            "nisab": "النصاب",
            "zakat": "الزكاة",
            "notes": "ملاحظات",
            "year": "السنة",
            "nisab-eur": "النصاب (€)",
            "above-nisab-hawl-begins": "فوق النصاب. يبدأ الحول.",
            "hawl-continues": "يستمر الحول.",
            "hawl-complete-zakat-due": "اكتمل الحول. الزكاة مستحقة منذ ",
            "below-nisab": "أقل من النصاب. تمت إعادة تعيين الحول.",
            "error-loading-data": "خطأ في تحميل ملفات البيانات",
            "loading": "جارٍ تحميل البيانات...",
            "upload-data-title": "تحميل بياناتك",
            "combined-data-label": "البيانات المجمعة (JSON):",
            "process-uploads": "معالجة التحميلات",
            "upload-format-info": "قم بتحميل بياناتك JSON. انظر المثال أدناه:",
            'select-language': 'اختر اللغة',
            'upload-section-title': 'تحميل البيانات المالية',
            'example-format-summary': 'عرض نموذج التنسيق',
            'upload-data-prompt': 'يرجى تحميل ملف البيانات المالية لبدء الحسابات.',

        }
    };

    class LanguageManager {
        constructor() {
            this.currentLanguage = ['fr', 'ar', 'en'].includes(navigator.language.split('-')[0]) ? navigator.language.split('-')[0] : 'en';
        }

        changeLanguage(lang) {
            this.currentLanguage = lang;
            document.documentElement.lang = lang;
            document.body.lang = lang;
            this.updateTranslations();

            if (lang === 'ar' && !document.getElementById('arabicFont')) {
                this.loadArabicFont();
            }
        }

        updateTranslations() {
            document.querySelectorAll('[data-i18n]').forEach(element => {
                const key = element.getAttribute('data-i18n');
                element.innerHTML = this.translate(key);
            });
        }

        translate(key) {
            return translations[this.currentLanguage][key] || key;
        }

        loadArabicFont() {
            const link = document.createElement('link');
            link.id = 'arabicFont';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Amiri&display=swap';
            document.head.appendChild(link);
        }
    }

    class ZakatCalculator {
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
            this.languageManager.changeLanguage(['fr', 'ar', 'en'].includes(navigator.language.split('-')[0]) ? navigator.language.split('-')[0] : 'en');
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

    document.addEventListener('DOMContentLoaded', () => new ZakatCalculator());

})();

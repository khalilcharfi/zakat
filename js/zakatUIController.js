import {DateConverter} from './dateConverter.js';
import {NisabService} from './nisabService.js';
import {LanguageManager} from './languageManager.js';
import {ZakatCalculator} from './zakatCalculator.js';

Dropzone.autoDiscover = false; // Disable auto-discovery to manually initialize Dropzone

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
    DOWNLOAD_JSON_LINK: 'downloadJsonLink',
    ZAKAT_TABLE: 'zakatTable',
    NISAB_TABLE: 'nisabTable',
    LANGUAGE_SELECT: 'languageSelect',
    FILTER_TOGGLE: 'filterZakatToggle',
    UPLOAD_BUTTON: '.file-upload button',
    TOOLBAR_CONTAINER: '.toolbar-container',
    FILE_INPUT: 'dataUpload',
    API_NOTE: '.api-note',
    DOWNLOAD_LINK: 'downloadLink',
    VIEW_BUTTON: '.view-button',
    DOWNLOAD_EXCEL_LINK: 'downloadExcelLink',
    DOWNLOAD_CSV_LINK: 'downloadCsvLink',
    ADD_ROW_FORM: 'addRowForm',
    ADD_ROW_BUTTON: '.add-row-button',
    SAVE_ROW_BUTTON: '.save-row-button',
    CANCEL_ROW_BUTTON: '.cancel-row-button',
    CLOSE_FORM_BUTTON: '.close-form-button',
    NEW_ROW_DATE: 'newRowDate',
    NEW_ROW_AMOUNT: 'newRowAmount',
    NEW_ROW_INTEREST: 'newRowInterest',
    FILE_DROP_AREA: 'fileDropArea'
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

    // In the init() method's Dropzone configuration:
    async init() {
        // Cache DOM elements for better performance
        this.cacheDOMElements();
        this.setupEventListeners();
        
        // Initialize Dropzone only after DOM elements are cached
        if (this.domElements.fileDropArea) {
            const controller = this;
            
            this.dropzone = new Dropzone(this.domElements.fileDropArea, {
                url: "#",
                autoProcessQueue: false,
                maxFiles: 1,
                acceptedFiles: ".json,.csv,.xls,.xlsx",
                previewsContainer: false,
                createImageThumbnails: false,
                init: function() {
                    this.on("addedfile", function(file) {
                        console.log("File added:", file.name);
                        if (controller.domElements.fileDropArea) {
                            controller.domElements.fileDropArea.classList.add('file-added');
                            // Call the controller's method instead of this.processUploads()
                            controller.processUploads();
                        }
                        if (file.previewElement) {
                            file.previewElement.remove();
                        }
                    });
                    
                    this.on("removedfile", function() {
                        if (controller.domElements.fileDropArea) {
                            controller.domElements.fileDropArea.classList.remove('file-added');
                        }
                    });
                }
            });
        }

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
        console.log("Processing uploads...");
        // Check if Dropzone has files instead of file input
        if (!this.dropzone?.files.length) {
            return;
        }

        try {
            this.showLoadingState();
            // Get the first file from Dropzone
            const file = this.dropzone.files[0];
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
            
            // Scroll to the datatable view after processing is complete
            setTimeout(() => {
                const tableElement = document.querySelector('.table-view-controls');
                if (tableElement) {
                    tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 500); // Small delay to ensure the table is fully rendered
        } catch (error) {
            this.showErrorState(error);
        } finally {
            // Remove all files from Dropzone after processing
            if (this.dropzone) {
                this.dropzone.removeAllFiles();
            }
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
            toolbarContainer: document.querySelector(DOM_IDS.TOOLBAR_CONTAINER),
            uploadButton: document.querySelector('.file-upload button'),
            downloadJsonLink: document.getElementById(DOM_IDS.DOWNLOAD_JSON_LINK), // Added downloadJsonLink element
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
            closeFormButton: document.querySelector(DOM_IDS.CLOSE_FORM_BUTTON),
            newRowDate: document.getElementById(DOM_IDS.NEW_ROW_DATE),
            newRowAmount: document.getElementById(DOM_IDS.NEW_ROW_AMOUNT),
            newRowInterest: document.getElementById(DOM_IDS.NEW_ROW_INTEREST),
            fileDropArea: document.getElementById(DOM_IDS.FILE_DROP_AREA),
            // Add references to the form elements
            viewButtons: document.querySelectorAll('.view-button'),
        };
    }

    setupEventListeners() {
        this.setupLanguageSelectListener();
        this.setupFileInputListener();
        this.setupFilterToggleListener();
        this.setupDownloadLinksListeners();
        this.setupRowFormListeners();
        this.setupAccordionHeadersListener();
        
    }
    
// Add this method to the ZakatUIController class

setupLanguageDropdownListener() {
    const languageButton = document.querySelector('.language-button');
    const languageOptions = document.querySelector('.language-options');
    
    if (languageButton && languageOptions) {
      // Toggle language options when button is clicked
      languageButton.addEventListener('click', (e) => {
        e.preventDefault();
        languageOptions.classList.toggle('show');
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!languageButton.contains(e.target) && !languageOptions.contains(e.target)) {
          languageOptions.classList.remove('show');
        }
      });
      
      // Handle language selection
      const languageOptionButtons = languageOptions.querySelectorAll('button');
      languageOptionButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          const lang = e.target.getAttribute('data-lang');
          if (lang) {
            this.changeLanguage(lang);
            
            // Update button text to show selected language
            const langText = e.target.textContent;
            const buttonText = languageButton.querySelector('.language-text');
            if (buttonText) {
              buttonText.textContent = langText;
            }
            
            // Hide dropdown after selection
            languageOptions.classList.remove('show');
          }
        });
      });
    }
  }
    
    setupFileInputListener() {
        this.domElements.fileInput?.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.dropzone) {
                this.dropzone.hiddenFileInput.click(); 
            }
        });
    }
    
    setupFilterToggleListener() {
        if (this.domElements.filterToggle) {
            this.zakatFilterFunction = (settings, data) => {
                if (settings.nTable.id !== 'zakatDataTable') return true;
                if (!this.domElements.filterToggle.checked) return true;
    
                const zakatValue = data[6];
                const note = data[7];
    
                console.log('Zakat Value:', zakatValue);
                console.log('Note:', note);
    
                return zakatValue !== '-' || (note && note.includes('due'));
            };
    
            $.fn.dataTable.ext.search.push(this.zakatFilterFunction);
    
            this.domElements.filterToggle.addEventListener('change', () => {
                const table = $('#zakatDataTable').DataTable();
                if (table) table.draw();
            });
        }
    }
    
    setupDownloadLinksListeners() {
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
        
        // Add listener for downloading current data as JSON
        this.domElements.downloadJsonLink?.addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadExampleJSON();
        });
    }
    
    setupRowFormListeners() {
        this.domElements.addRowButton?.addEventListener('click', () => this.showAddRowForm());
        this.domElements.saveRowButton?.addEventListener('click', () => this.saveNewRow());
        this.domElements.cancelRowButton?.addEventListener('click', () => this.hideAddRowForm());
        this.domElements.closeFormButton?.addEventListener('click', () => this.hideAddRowForm());
    }
    
    setupAccordionHeadersListener() {
        document.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', function() {
                const expanded = header.getAttribute('aria-expanded') === 'true';
                const content = header.nextElementSibling;
    
                header.setAttribute('aria-expanded', !expanded);
    
                if (expanded) {
                    content.style.maxHeight = null;
                } else {
                    content.style.maxHeight = content.scrollHeight + 'px';
                }
    
                const icon = header.querySelector('i');
                icon.classList.toggle('fa-chevron-down', expanded);
                icon.classList.toggle('fa-chevron-up', !expanded);
            });
        });
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

    updateZakatChart() {
        const chartCanvas = document.getElementById('zakatChart');
        if (!chartCanvas) return;
    
        if (!this.zakatData || this.zakatData.length === 0) {
            if (this.zakatChart) {
                this.zakatChart.destroy();
                this.zakatChart = null;
            }
            return;
        }
        
        // Optimize data extraction with a single loop instead of multiple map() calls
        const labels = [];
        const amountData = [];
        const nisabData = [];
        const zakatData = [];
        const interestData = []; // Add interest data for better insights
        
        // Process data in a single loop for better performance
        this.zakatData.forEach(item => {
            labels.push(item.date);
            amountData.push(item.amount);
            nisabData.push(item.nisab);
            zakatData.push(item.zakat || 0);
            interestData.push(item.interest || 0);
        });
    
        const chartData = {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: this.languageManager.translate('amount') || 'Amount',
                    data: amountData,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    yAxisID: 'y',
                    order: 2 // Lower order appears behind
                },
                {
                    type: 'bar',
                    label: this.languageManager.translate('interest') || 'Interest',
                    data: interestData,
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1,
                    yAxisID: 'y',
                    stack: 'stack0', // Stack with amount if needed
                    order: 1
                },
                {
                    type: 'line',
                    label: this.languageManager.translate('nisab') || 'Nisab',
                    data: nisabData,
                    borderColor: 'rgba(255, 159, 64, 1)',
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y',
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    order: 0 // Higher order appears in front
                },
                {
                    type: 'line',
                    label: this.languageManager.translate('zakat') || 'Zakat',
                    data: zakatData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y1',
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    order: 0
                }
            ]
        };
    
        const chartConfig = {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                animation: {
                    duration: 1000, // Smoother animation
                    easing: 'easeOutQuart'
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: 'EUR'
                                    }).format(context.parsed.y);
                                }
                                return label;
                            },
                            // Add footer to show percentage of nisab
                            footer: function(tooltipItems) {
                                const dataIndex = tooltipItems[0].dataIndex;
                                const amount = amountData[dataIndex];
                                const nisab = nisabData[dataIndex];
                                if (amount && nisab) {
                                    const percentage = (amount / nisab * 100).toFixed(1);
                                    return `${percentage}% of Nisab threshold`;
                                }
                                return '';
                            }
                        }
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15
                        }
                    },
                    // Add annotation to highlight when amount crosses nisab threshold
                    annotation: {
                        annotations: {
                            thresholdLine: {
                                type: 'line',
                                yMin: 0,
                                yMax: 0,
                                borderColor: 'rgba(255, 0, 0, 0.5)',
                                borderWidth: 2,
                                borderDash: [6, 6],
                                label: {
                                    display: true,
                                    content: this.languageManager.translate('nisab_threshold') || 'Nisab Threshold',
                                    position: 'start'
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: this.languageManager.translate('date') || 'Date',
                            font: {
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: this.languageManager.translate('amount') || 'Amount (€)',
                            font: {
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                return new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'EUR',
                                    maximumFractionDigits: 0
                                }).format(value);
                            }
                        },
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: this.languageManager.translate('zakat') || 'Zakat (€)',
                            font: {
                                weight: 'bold'
                            }
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            callback: function(value) {
                                return new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'EUR',
                                    maximumFractionDigits: 0
                                }).format(value);
                            }
                        },
                        beginAtZero: true
                    }
                }
            }
        };
        
        // Update annotation threshold line position based on average nisab
        if (nisabData.length > 0) {
            const avgNisab = nisabData.reduce((sum, val) => sum + val, 0) / nisabData.length;
            if (chartConfig.options.plugins.annotation && 
                chartConfig.options.plugins.annotation.annotations.thresholdLine) {
                chartConfig.options.plugins.annotation.annotations.thresholdLine.yMin = avgNisab;
                chartConfig.options.plugins.annotation.annotations.thresholdLine.yMax = avgNisab;
            }
        }
    
        if (this.zakatChart) {
            this.zakatChart.data = chartData;
            this.zakatChart.options = chartConfig.options;
            this.zakatChart.update();
        } else {
            this.zakatChart = new Chart(chartCanvas, chartConfig);
        }
    
        this.updateSummaryValues();
    }

    updateSummaryValues() {
        const totalZakatValue = document.getElementById('totalZakatValue');
        const nextDueDate = document.getElementById('nextDueDate');
    
        if (this.zakatData && this.zakatData.length > 0) {
            // Calculate total zakat
            const totalZakat = this.zakatData.reduce((acc, item) => acc + (item.zakat || 0), 0);
            
            // Format the currency
            totalZakatValue.textContent = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 2
            }).format(totalZakat);
    
            // Find the next due date - look for the first future due date
            const today = new Date();
            let nextDueDateValue = null;
            
            // Sort data by due date if available
            const itemsWithDueDate = this.zakatData
                .filter(item => item.nextDueDate)
                .sort((a, b) => {
                    const dateA = this.dateConverter.parseDate(a.nextDueDate);
                    const dateB = this.dateConverter.parseDate(b.nextDueDate);
                    return dateA - dateB;
                });
            
            // Find the first future due date
            for (const item of itemsWithDueDate) {
                const dueDate = this.dateConverter.parseDate(item.nextDueDate);
                if (dueDate && dueDate >= today) {
                    nextDueDateValue = item.nextDueDate;
                    break;
                }
            }
            
            // If no future due date found, use the most recent one
            if (!nextDueDateValue && itemsWithDueDate.length > 0) {
                nextDueDateValue = itemsWithDueDate[itemsWithDueDate.length - 1].nextDueDate;
            }
            
            // Update the display
            if (nextDueDateValue) {
                nextDueDate.textContent = nextDueDateValue;
                
                // Add data attributes for styling based on due date proximity
                const dueDate = this.dateConverter.parseDate(nextDueDateValue);
                if (dueDate) {
                    const daysUntilDue = Math.floor((dueDate - today) / (24 * 60 * 60 * 1000));
                    
                    // Remove any existing status classes
                    nextDueDate.removeAttribute('data-approaching');
                    nextDueDate.removeAttribute('data-overdue');
                    nextDueDate.removeAttribute('data-upcoming');
                    
                    // Add appropriate status class
                    if (daysUntilDue < 0) {
                        nextDueDate.setAttribute('data-overdue', 'true');
                        nextDueDate.title = this.languageManager.translate('overdue') || 'Overdue';
                    } else if (daysUntilDue <= 30) {
                        nextDueDate.setAttribute('data-approaching', 'true');
                        nextDueDate.title = this.languageManager.translate('approaching') || 'Due soon';
                    } else {
                        nextDueDate.setAttribute('data-upcoming', 'true');
                        nextDueDate.title = this.languageManager.translate('upcoming') || 'Upcoming';
                    }
                }
            } else {
                nextDueDate.textContent = '--/--/----';
                nextDueDate.removeAttribute('data-approaching');
                nextDueDate.removeAttribute('data-overdue');
                nextDueDate.removeAttribute('data-upcoming');
            }
        } else {
            // Handle the case when no data is available
            totalZakatValue.textContent = '€0.00';
            nextDueDate.textContent = '--/--/----';
            nextDueDate.removeAttribute('data-approaching');
            nextDueDate.removeAttribute('data-overdue');
            nextDueDate.removeAttribute('data-upcoming');
        }
    }

    updateUI() {
        this.generateZakatTable();
        this.generateNisabTable();
        this.updateZakatChart();
    
        this.toggleToolbarVisibility(this.zakatData && this.zakatData.length > 0);
    }
    
    toggleToolbarVisibility(show) {
        return;
        if (this.domElements.toolbarContainer) {
            this.domElements.toolbarContainer.classList.toggle('hidden', !show);
            this.domElements.viewButtons.forEach(button => {
                button.classList.toggle('hidden', !show);
            });
        }
    }

        // ... existing code ...
    
        downloadJsonLink() {
            // Only proceed if we have data
            if (!this.zakatData || this.zakatData.length === 0) {
                alert(this.languageManager.translate('no-data-to-download') || 'No data available to download');
                return;
            }
            
            // Create data structure with current data
            const currentData = {
                monthlyData: this.calculator.getMonthlyData(),
                nisabData: this.nisabService.getNisabData().data,
                // Include API key if available
                goldApiKey: this.nisabService.getApiKey() || null
            };
            
            // Convert to JSON string with pretty formatting
            const jsonString = JSON.stringify(currentData, null, 2);
            
            // Create a blob and download link
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Generate filename with date
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
            const filename = `zakat_data_${dateStr}.json`;
            
            // Create temporary link and trigger download
            const tempLink = document.createElement('a');
            tempLink.href = url;
            tempLink.download = filename;
            document.body.appendChild(tempLink);
            tempLink.click();
            
            // Clean up
            document.body.removeChild(tempLink);
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 100);
        }
        
        // ... existing code ...

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
    
        // Create table with all data (filtering will be handled by DataTables)
        const table = this.createZakatTable(this.zakatData);
        
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
        const rowsHTML = data.map(row => {
            // Precompute values that are repeatedly used
            const formatCurrency = this.formatCurrency;
            const translateNote = this.languageManager.translate(row.note).replace('{date}', row.date);
        
            // Define fields and their dynamic values
            const fields = [
                { name: 'date', value: row.date },
                { name: 'hijriDate', value: row.hijriDate },
                { name: 'amount', value: formatCurrency(row.amount) },
                { name: 'interest', value: formatCurrency(row.interest) },
                { name: 'total', value: formatCurrency(row.total) },
                { name: 'nisab', value: formatCurrency(row.nisab) },
                { name: row.zakat ? 'zakat' : 'no-zakat', value: row.zakat ? formatCurrency(row.zakat) : '-' },
                { name: `note-${row.note}`, value: translateNote, attr: `data-i18n="${row.note}"` }
            ];
        
            // Create table data cells dynamically
            const cellsHTML = fields.map(({ name, value, attr = '' }) => 
                `<td data-name="${name}" ${attr}>${value}</td>`
            ).join('');
        
            return `<tr data-row-class="${row.rowClass}">${cellsHTML}</tr>`;
        }).join('');
        
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
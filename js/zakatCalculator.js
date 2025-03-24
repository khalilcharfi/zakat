export class ZakatCalculator {
    constructor(languageManager, dateConverter, nisabService, dateConfig = {}) {
        this.languageManager = languageManager;
        this.dateConverter = dateConverter;
        this.nisabService = nisabService;
        this.monthlyData = [];
        this.dateConfig = {
            useHijri: dateConfig.useHijri !== undefined ? dateConfig.useHijri : true
        };
    }

    setMonthlyData(data) {
        if (!Array.isArray(data)) {
            throw new Error('Monthly data must be an array');
        }
        this.monthlyData = [...data];
    }

    getMonthlyData() {
        return [...this.monthlyData];
    }

    setDateConfig(config = {}) {
        this.dateConfig = { ...this.dateConfig, ...config };
    }

    async calculateZakat() {
        try {
            // Filter and sort data
            const sortedData = this.prepareMonthlyData();
            if (sortedData.length === 0) return [];

            // Extract unique dates and year-month combinations
            const uniqueDates = [...new Set(sortedData.map(entry => entry.date))];
            const uniqueYearMonths = this.extractUniqueYearMonths(sortedData);

            // Fetch required data for calculations
            const [hijriDateMap, nisabMap] = await Promise.all([
                this.fetchHijriDates(uniqueDates),
                this.fetchNisabValues(uniqueYearMonths)
            ]);

            // Calculate zakat with the provided data
            return this.processEntriesWithHawl(sortedData, hijriDateMap, nisabMap);
        } catch (error) {
            console.error('Error calculating Zakat:', error);
            throw error;
        }
    }

    prepareMonthlyData() {
        return [...this.monthlyData]
            .filter(entry => {
                const netValue = (entry.amount || 0) - (entry.interest || 0);
                return netValue > 0;
            })
            .sort((a, b) => {
                const [aMonth, aYear] = a.date.split('/');
                const [bMonth, bYear] = b.date.split('/');
                return new Date(aYear, aMonth - 1) - new Date(bYear, bMonth - 1);
            });
    }

    extractUniqueYearMonths(sortedData) {
        return sortedData.map(entry => {
            const [month, year] = entry.date.split('/');
            return { year: parseInt(year), month: parseInt(month) };
        });
    }

    async fetchHijriDates(uniqueDates) {
        const hijriDates = await Promise.all(uniqueDates.map(async date => ({
            date,
            hijri: await this.dateConverter.getHijriDate(date)
        })));

        return new Map(hijriDates.map(({date, hijri}) => [date, hijri]));
    }

    async fetchNisabValues(uniqueYearMonths) {
        // Create unique keys to avoid duplicate API calls
        const nisabPromises = [];
        const processedKeys = new Set();

        for (const { year, month } of uniqueYearMonths) {
            const key = `${year}-${month}`;
            if (!processedKeys.has(key)) {
                processedKeys.add(key);
                nisabPromises.push({
                    key,
                    year,
                    month,
                    promise: this.nisabService.fetchNisabValueForYearMonth(year, month)
                        .catch(() => this.nisabService.fetchNisabValue(year))
                });
            }
        }

        // Wait for all nisab values to be fetched
        const nisabValues = await Promise.all(
            nisabPromises.map(async ({ key, promise }) => {
                try {
                    const value = await promise;
                    return { key, value };
                } catch (error) {
                    console.error(`Error fetching nisab for ${key}:`, error);
                    return { key, value: null };
                }
            })
        );

        // Create a map of nisab values by year-month
        return new Map(
            nisabValues.filter(n => n.value !== null)
                .map(({ key, value }) => [key, value])
        );
    }

    processEntriesWithHawl(sortedData, hijriDateMap, nisabMap) {
        // Initialize results array
        const results = [];
        
        // Initialize hawl tracking state
        let hawlState = {
            isActive: false,
            startIndex: -1,
            startDate: null,
            startHijriDate: null,
            startHijriMonth: 0,
            startHijriYear: 0
        };
        
        // Process each entry in chronological order
        for (let i = 0; i < sortedData.length; i++) {
            const entry = sortedData[i];
            const [month, year] = entry.date.split('/');
            const gregorianYear = parseInt(year, 10);
            const gregorianMonth = parseInt(month, 10);
            const total = (entry.amount || 0) - (entry.interest || 0);
            const nisab = this.getNisabValue(gregorianYear, gregorianMonth, nisabMap);
            const hijriDate = hijriDateMap.get(entry.date) || "";
            const [hijriMonth, hijriYear] = hijriDate.split('/').map(part => parseInt(part, 10));
            
            // Initialize result object
            const result = {
                date: entry.date,
                hijriDate,
                amount: entry.amount,
                interest: entry.interest,
                total,
                nisab,
                zakat: null,
                note: '',
                rowClass: ''
            };
            
            if (total < nisab) {
                // Below nisab threshold - reset hawl if active
                if (hawlState.isActive) {
                    hawlState = this.resetHawlState();
                }
                
                result.note = 'below-nisab';
                result.rowClass = 'below-nisab';
            } else {
                // Above nisab threshold
                if (!hawlState.isActive) {
                    // Start of new hawl
                    hawlState = {
                        isActive: true,
                        startIndex: i,
                        startDate: entry.date,
                        startHijriDate: hijriDate,
                        startHijriMonth: hijriMonth,
                        startHijriYear: hijriYear
                    };
                    
                    result.note = 'above-nisab-hawl-begins';
                    result.rowClass = 'hawl-start';
                } else {
                    // Check if a full lunar year has passed since hawl start
                    const monthsElapsed = this.calculateHijriMonthsElapsed(
                        hijriYear, hijriMonth,
                        hawlState.startHijriYear, hawlState.startHijriMonth
                    );
                    
                    if (monthsElapsed >= 12) {
                        // Full hawl period completed, zakat is due
                        result.note = 'hawl-complete-zakat-due';
                        result.rowClass = 'zakat-due';
                        result.zakat = this.roundToTwoDecimals(total * 0.025); // 2.5% of total
                        
                        // Start a new hawl period from this point
                        hawlState = {
                            isActive: true,
                            startIndex: i,
                            startDate: entry.date,
                            startHijriDate: hijriDate,
                            startHijriMonth: hijriMonth,
                            startHijriYear: hijriYear
                        };
                    } else {
                        // Hawl period still in progress
                        result.note = 'hawl-continues';
                        result.rowClass = '';
                    }
                }
            }
            
            results.push(result);
        }
        
        return results;
    }

    resetHawlState() {
        return {
            isActive: false,
            startIndex: -1,
            startDate: null,
            startHijriDate: null,
            startHijriMonth: 0,
            startHijriYear: 0
        };
    }

    calculateHijriMonthsElapsed(currentYear, currentMonth, startYear, startMonth) {
        // Ensure all inputs are valid numbers
        currentYear = parseInt(currentYear, 10) || 0;
        currentMonth = parseInt(currentMonth, 10) || 0;
        startYear = parseInt(startYear, 10) || 0;
        startMonth = parseInt(startMonth, 10) || 0;
        
        // Calculate months difference
        const yearDiff = currentYear - startYear;
        const monthDiff = currentMonth - startMonth;
        
        return (yearDiff * 12) + monthDiff;
    }

    getNisabValue(year, month, nisabMap) {
        const key = `${year}-${month}`;
        return nisabMap.get(key) ||
            nisabMap.get(`${year}-1`) || // Try January of same year
            this.nisabService.getNisabValueForYearMonth(year, month);
    }

    roundToTwoDecimals(value) {
        return Math.round(value * 100) / 100;
    }
}
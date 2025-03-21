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
            // Initialize hawl tracking state
            const hawlState = this.initializeHawlState();

            // Filter and sort data
            const sortedData = this.prepareMonthlyData();

            if (sortedData.length === 0) {
                return [];
            }

            // Extract unique dates and year-month combinations
            const uniqueDates = [...new Set(sortedData.map(entry => entry.date))];
            const uniqueYearMonths = this.extractUniqueYearMonths(sortedData);

            // Fetch required data for calculations
            const [hijriDateMap, nisabMap] = await Promise.all([
                this.fetchHijriDates(uniqueDates),
                this.fetchNisabValues(uniqueYearMonths)
            ]);

            // Process each entry and calculate zakat
            return this.processEntries(sortedData, hijriDateMap, nisabMap, hawlState);
        } catch (error) {
            console.error('Error calculating Zakat:', error);
            throw error;
        }
    }

    initializeHawlState() {
        return {
            isActive: false,
            startHijriDate: null,
            startDate: null,
            wealthAtStart: 0,
            minWealth: Infinity,
            startHijriMonth: 0,
            startHijriYear: 0
        };
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

    async processEntries(sortedData, hijriDateMap, nisabMap, hawlState) {
        const results = [];

        for (const entry of sortedData) {
            const [month, year] = entry.date.split('/');
            const gregorianYear = parseInt(year);
            const gregorianMonth = parseInt(month);
            const total = (entry.amount || 0) - (entry.interest || 0);

            // Get nisab value with fallbacks
            const nisab = this.getNisabValue(gregorianYear, gregorianMonth, nisabMap);

            // Get hijri date
            const hijriDate = hijriDateMap.get(entry.date);

            // Calculate hawl status and zakat
            const { note, zakat, rowClass } = await this.calculateHawlStatus(
                total,
                nisab,
                hawlState,
                hijriDate,
                entry.date,
                nisabMap
            );

            results.push({
                date: entry.date,
                hijriDate,
                amount: entry.amount,
                interest: entry.interest,
                total,
                nisab,
                zakat: zakat ? this.roundToTwoDecimals(zakat) : null,
                note,
                rowClass
            });
        }

        return results;
    }

    getNisabValue(year, month, nisabMap) {
        const key = `${year}-${month}`;
        return nisabMap.get(key) ||
            nisabMap.get(`${year}-1`) || // Try January of same year
            this.nisabService.getNisabValueForYearMonth(year, month);
    }

    async calculateHawlStatus(total, nisab, hawlState, hijriDate, gregorianDate, nisabMap) {
        let note = '', zakat = null, rowClass = '';

        if (total >= nisab) {
            if (!hawlState.isActive) {
                // Start new hawl period
                this.startNewHawlPeriod(hawlState, hijriDate, gregorianDate, total);
                note = 'above-nisab-hawl-begins';
                rowClass = 'hawl-start';
            } else {
                // Update minimum wealth during hawl period
                hawlState.minWealth = Math.min(hawlState.minWealth, total);

                // Calculate months elapsed in hijri calendar
                const [currentYear, currentMonth] = hijriDate.split('/').map(Number);
                const monthsElapsed = this.calculateMonthsElapsed(
                    currentYear, currentMonth,
                    hawlState.startHijriYear, hawlState.startHijriMonth
                );

                if (monthsElapsed >= 12) {
                    // Hawl period complete - check if zakat is due
                    const result = this.processCompletedHawl(
                        hawlState, hijriDate, gregorianDate,
                        total, nisabMap, currentYear, currentMonth
                    );
                    note = result.note;
                    zakat = result.zakat;
                    rowClass = result.rowClass;
                } else {
                    note = 'hawl-continues';
                }
            }
        } else {
            // Below nisab - reset hawl
            this.resetHawlState(hawlState);
            note = hawlState.isActive ? 'hawl-broken-below-nisab' : 'below-nisab';
            rowClass = hawlState.isActive ? 'hawl-broken' : 'below-nisab';
            hawlState.isActive = false;
        }

        return { note, zakat, rowClass, hawlState };
    }

    startNewHawlPeriod(hawlState, hijriDate, gregorianDate, total) {
        hawlState.isActive = true;
        hawlState.startHijriDate = hijriDate;
        hawlState.startDate = gregorianDate;
        hawlState.wealthAtStart = total;
        hawlState.minWealth = total;

        const [startYear, startMonth] = hijriDate.split('/').map(Number);
        hawlState.startHijriYear = startYear;
        hawlState.startHijriMonth = startMonth;
    }

    calculateMonthsElapsed(currentYear, currentMonth, startYear, startMonth) {
        const yearDiff = currentYear - startYear;
        const monthDiff = currentMonth - startMonth;
        return (yearDiff * 12) + monthDiff;
    }

    processCompletedHawl(hawlState, hijriDate, gregorianDate, total, nisabMap, currentYear, currentMonth) {
        const [currentGregMonth, currentGregYear] = gregorianDate.split('/');
        const zakatYear = new Date(currentGregYear, currentGregMonth - 1).getFullYear();
        const currentNisab = nisabMap.get(zakatYear) || 0;

        let note, zakat = null, rowClass;

        if (hawlState.minWealth >= currentNisab) {
            zakat = hawlState.minWealth * 0.025;
            note = 'hawl-complete-zakat-due';
            rowClass = 'zakat-due';
        } else {
            note = 'hawl-complete-but-below-nisab';
            rowClass = 'hawl-broken';
            hawlState.isActive = false;
        }

        // Reset hawl state for next period
        this.startNewHawlPeriod(hawlState, hijriDate, gregorianDate, total);

        return { note, zakat, rowClass };
    }

    resetHawlState(hawlState) {
        hawlState.isActive = false;
        hawlState.startHijriDate = null;
        hawlState.startDate = null;
        hawlState.wealthAtStart = 0;
        hawlState.minWealth = Infinity;
        hawlState.startHijriMonth = 0;
        hawlState.startHijriYear = 0;
    }

    roundToTwoDecimals(value) {
        return Math.round(value * 100) / 100;
    }
}
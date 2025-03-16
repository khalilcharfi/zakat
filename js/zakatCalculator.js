export class ZakatCalculator {
    constructor(languageManager, dateConverter, nisabService) {
        this.languageManager = languageManager;
        this.dateConverter = dateConverter;
        this.nisabService = nisabService;
        this.monthlyData = [];
    }

    setMonthlyData(data) {
        this.monthlyData = data;
    }

    async calculateZakat() {
        const hawlState = {
            isActive: false,
            startHijriDate: null,
            startDate: null,
            wealthAtStart: 0,
            minWealth: Infinity,
            startHijriMonth: 0,
            startHijriYear: 0
        };

        const sortedData = [...this.monthlyData]
            .filter(entry => {
                const netValue = (entry.amount || 0) - (entry.interest || 0);
                return netValue > 0;
            })
            .sort((a, b) => {
                const [aMonth, aYear] = a.date.split('/');
                const [bMonth, bYear] = b.date.split('/');
                return new Date(aYear, aMonth - 1) - new Date(bYear, bMonth - 1);
            });

        const uniqueDates = [...new Set(sortedData.map(entry => entry.date))];
        
        // Get all unique year-month combinations instead of just years
        const uniqueYearMonths = sortedData.map(entry => {
            const [month, year] = entry.date.split('/');
            return { year: parseInt(year), month: parseInt(month) };
        });

        try {
            // Fetch hijri dates for all entries
            const hijriDates = await Promise.all(uniqueDates.map(async date => ({
                date,
                hijri: await this.dateConverter.getHijriDate(date)
            })));
            
            // Create a map of hijri dates
            const hijriDateMap = new Map(hijriDates.map(({date, hijri}) => [date, hijri]));
            
            // Fetch nisab values for each year-month combination
            const nisabPromises = [];
            for (const { year, month } of uniqueYearMonths) {
                // Only add unique combinations to avoid duplicate API calls
                const key = `${year}-${month}`;
                if (!nisabPromises.some(p => p.key === key)) {
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
                nisabPromises.map(async ({ key, year, month, promise }) => {
                    try {
                        const value = await promise;
                        return { key, year, month, value };
                    } catch (error) {
                        console.error(`Error fetching nisab for ${key}:`, error);
                        return { key, year, month, value: null };
                    }
                })
            );
            
            // Create a map of nisab values by year-month
            const nisabMap = new Map(
                nisabValues.filter(n => n.value !== null)
                    .map(({ key, value }) => [key, value])
            );

            const results = [];
            for (const entry of sortedData) {
                const [month, year] = entry.date.split('/');
                const gregorianYear = parseInt(year);
                const gregorianMonth = parseInt(month);
                const total = (entry.amount || 0) - (entry.interest || 0);
                
                // Get nisab value for specific year-month, fall back to year if not available
                const nisabKey = `${gregorianYear}-${gregorianMonth}`;
                const nisab = nisabMap.get(nisabKey) || 
                              nisabMap.get(`${gregorianYear}-1`) || // Try January of same year
                              this.nisabService.getNisabValueForYearMonth(gregorianYear, gregorianMonth);
                
                const hijriDate = hijriDateMap.get(entry.date);

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
        } catch (error) {
            console.error('Error calculating Zakat:', error);
            throw error;
        }
    }

    async calculateHawlStatus(total, nisab, hawlState, hijriDate, gregorianDate, nisabMap) {
        let note = '', zakat = null, rowClass = '';

        if (total >= nisab) {
            if (!hawlState.isActive) {
                hawlState.isActive = true;
                hawlState.startHijriDate = hijriDate;
                hawlState.startDate = gregorianDate;
                hawlState.wealthAtStart = total;
                hawlState.minWealth = total;

                const [startYear, startMonth] = hijriDate.split('/').map(Number);
                hawlState.startHijriYear = startYear;
                hawlState.startHijriMonth = startMonth;

                note = 'above-nisab-hawl-begins';
                rowClass = 'hawl-start';
            } else {
                hawlState.minWealth = Math.min(hawlState.minWealth, total);

                const [currentYear, currentMonth] = hijriDate.split('/').map(Number);
                const yearDiff = currentYear - hawlState.startHijriYear;
                const monthDiff = currentMonth - hawlState.startHijriMonth;
                const totalMonthsElapsed = (yearDiff * 12) + monthDiff;

                if (totalMonthsElapsed >= 12) {
                    const [currentGregMonth, currentGregYear] = gregorianDate.split('/');
                    const zakatYear = new Date(currentGregYear, currentGregMonth - 1).getFullYear();
                    const currentNisab = nisabMap.get(zakatYear) || 0;

                    if (hawlState.minWealth >= currentNisab) {
                        zakat = hawlState.minWealth * 0.025;
                        note = `${this.languageManager.translate('hawl-complete-zakat-due')} ${hawlState.startDate}`;
                        rowClass = 'zakat-due';
                    } else {
                        note = 'hawl-complete-but-below-nisab';
                        rowClass = 'hawl-broken';
                        hawlState.isActive = false;
                    }

                    hawlState.startHijriDate = hijriDate;
                    hawlState.startDate = gregorianDate;
                    hawlState.startHijriYear = currentYear;
                    hawlState.startHijriMonth = currentMonth;
                    hawlState.wealthAtStart = total;
                    hawlState.minWealth = total;
                } else {
                    note = 'hawl-continues';
                }
            }
        } else {
            if (hawlState.isActive) {
                note = 'hawl-broken-below-nisab';
                rowClass = 'hawl-broken';
            } else {
                note = 'below-nisab';
                rowClass = 'below-nisab';
            }

            hawlState.isActive = false;
            hawlState.startHijriDate = null;
            hawlState.startDate = null;
            hawlState.wealthAtStart = 0;
            hawlState.minWealth = Infinity;
            hawlState.startHijriMonth = 0;
            hawlState.startHijriYear = 0;
        }

        return { note, zakat, rowClass };
    }

    roundToTwoDecimals(value) {
        return Math.round(value * 100) / 100;
    }
}
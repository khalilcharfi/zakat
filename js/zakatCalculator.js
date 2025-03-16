export class ZakatCalculator {
    constructor(dateConverter, nisabService) {
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
        const uniqueYears = [...new Set(sortedData.map(entry => {
            const [month, year] = entry.date.split('/');
            return new Date(year, month - 1).getFullYear();
        }))];

        try {
            const [hijriDates, nisabValues] = await Promise.all([
                Promise.all(uniqueDates.map(async date => ({
                    date,
                    hijri: await this.dateConverter.getHijriDate(date)
                }))),
                Promise.all(uniqueYears.map(async year => ({
                    year,
                    value: await this.nisabService.fetchNisabValue(year)
                })))
            ]);

            const hijriDateMap = new Map(hijriDates.map(({date, hijri}) => [date, hijri]));
            const nisabMap = new Map(nisabValues.map(({year, value}) => [year, value]));

            return sortedData.map(entry => {
                const [month, year] = entry.date.split('/');
                const gregorianYear = new Date(year, month - 1).getFullYear();
                const total = (entry.amount || 0) - (entry.interest || 0);
                const nisab = nisabMap.get(gregorianYear) || 0;
                const hijriDate = hijriDateMap.get(entry.date);
                
                const { note, zakat, rowClass } = this.calculateHawlStatus(
                    total, 
                    nisab, 
                    hawlState, 
                    hijriDate,
                    entry.date
                );

                return {
                    date: entry.date,
                    hijriDate,
                    amount: entry.amount,
                    interest: entry.interest,
                    total,
                    nisab,
                    zakat: zakat ? this.roundToTwoDecimals(zakat) : null,
                    note,
                    rowClass
                };
            });
        } catch (error) {
            console.error('Error calculating Zakat:', error);
            throw error;
        }
    }

    calculateHawlStatus(total, nisab, hawlState, hijriDate, gregorianDate) {
        let note = '', zakat = null, rowClass = '';
        
   
        if (total >= nisab) {
            if (!hawlState.isActive) {
                // Start tracking Hawl
                hawlState.isActive = true;
                hawlState.startHijriDate = hijriDate;
                hawlState.startDate = gregorianDate;
                hawlState.wealthAtStart = total;
                hawlState.minWealth = total;
                
                // Fixed: Parse Hijri date components correctly as YEAR/MONTH
                const [startYear, startMonth] = hijriDate.split('/').map(Number);
                hawlState.startHijriYear = startYear;
                hawlState.startHijriMonth = startMonth;
                
                note = 'above-nisab-hawl-begins';
                rowClass = 'hawl-start';
            } else {
                // Track minimum wealth during Hawl period
                hawlState.minWealth = Math.min(hawlState.minWealth, total);
                
                // Fixed: Parse current Hijri date components correctly as YEAR/MONTH
                const [currentYear, currentMonth] = hijriDate.split('/').map(Number);
                
                // Calculate full lunar year (12 months)
                const yearDiff = currentYear - hawlState.startHijriYear;
                const monthDiff = currentMonth - hawlState.startHijriMonth;
                const totalMonthsElapsed = (yearDiff * 12) + monthDiff;
                
                if (totalMonthsElapsed >= 12) {
                    // Calculate Zakat based on minimum wealth during Hawl
                    zakat = hawlState.minWealth * 0.025;
                    note = `hawl-complete-zakat-due ${hawlState.startDate}`;
                    rowClass = 'zakat-due';
                    
                    // Reset Hawl state with current values
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
            // Below Nisab
            if (hawlState.isActive) {
                note = 'hawl-broken-below-nisab';
                rowClass = 'hawl-broken';
            } else {
                note = 'below-nisab';
                rowClass = 'below-nisab';
            }
            
            // Reset Hawl state
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
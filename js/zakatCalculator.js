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

            const results = [];
            for (const entry of sortedData) {
                const [month, year] = entry.date.split('/');
                const gregorianYear = new Date(year, month - 1).getFullYear();
                const total = (entry.amount || 0) - (entry.interest || 0);
                const nisab = nisabMap.get(gregorianYear) || 0;
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
                        note = `hawl-complete-zakat-due ${hawlState.startDate}`;
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
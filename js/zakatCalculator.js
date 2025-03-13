// Core calculation class - ZakatCalculator.js
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
            startDate: null,
            monthsCount: 0
        };

        const sortedData = [...this.monthlyData].filter(entry => {
            return ((entry.amount || 0) - (entry.interest || 0)) > 0;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        const dateYearMap = new Map();
        const uniqueDates = new Set();
        const uniqueYears = new Set();

        sortedData.forEach(entry => {
            const [month, year] = entry.date.split('/');
            dateYearMap.set(entry.date, new Date(year, month - 1).getFullYear());
            uniqueDates.add(entry.date);
            uniqueYears.add(dateYearMap.get(entry.date));
        });

        try {
            const [hijriDates, nisabValues] = await Promise.all([
                Promise.all([...uniqueDates].map(async date => ({
                    date,
                    hijri: await this.dateConverter.getHijriDate(date)
                }))),
                Promise.all([...uniqueYears].map(async year => ({
                    year,
                    value: await this.nisabService.fetchNisabValue(year)
                })))
            ]);

            const hijriDateMap = new Map(hijriDates.map(({date, hijri}) => [date, hijri]));
            const nisabMap = new Map(nisabValues.map(({year, value}) => [year, value]));

            return sortedData.map(entry => {
                const total = (entry.amount || 0) - (entry.interest || 0);
                const year = dateYearMap.get(entry.date);

                const {
                    note,
                    zakat,
                    rowClass
                } = this.calculateHawlStatus(total, nisabMap.get(year), hawlState, entry.date);

                return {
                    date: entry.date,
                    hijriDate: hijriDateMap.get(entry.date),
                    amount: entry.amount,
                    interest: entry.interest,
                    total: total,
                    nisab: nisabMap.get(year),
                    zakat: zakat,
                    note,
                    rowClass
                };
            });
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
                note = 'above-nisab-hawl-begins';
                rowClass = 'hawl-start';
            } else {
                hawlState.monthsCount++;

                if (hawlState.monthsCount >= 12) {
                    zakat = total * 0.025;
                    note = `hawl-complete-zakat-due ${hawlState.startDate}`;
                    rowClass = 'zakat-due';

                    hawlState.isActive = false;
                    hawlState.startDate = null;
                    hawlState.monthsCount = 0;
                } else {
                    note = 'hawl-continues';
                }
            }
        } else {
            hawlState.isActive = false;
            hawlState.startDate = null;
            hawlState.monthsCount = 0;
            note = 'below-nisab';
            rowClass = 'below-nisab';
        }

        return {note, zakat, rowClass};
    }
}
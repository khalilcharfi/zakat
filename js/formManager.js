/**
 * FormManager class for handling form interactions and data validation.
 */
export class FormManager {
    /**
     * Initialize the form manager
     * @param {Object} languageManager - The language manager instance for translations
     */
    constructor(languageManager) {
        this.languageManager = languageManager;
        this.monthlyData = [];
        this.onCalculate = null;
        
        // Get form element
        this.form = document.getElementById('entryForm');
        
        // Setup form submission
        if (this.form) {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.setupForm();
        }
    }
    
    /**
     * Set up form elements and validation
     */
    setupForm() {
        // Setup date input validation
        const dateInputs = this.form.querySelectorAll('input[type="text"][data-format="MM/YYYY"]');
        dateInputs.forEach(input => {
            input.addEventListener('blur', () => this.validateDateFormat(input));
        });
    }
    
    /**
     * Validate date format (MM/YYYY)
     * @param {HTMLElement} input - The date input field
     * @returns {boolean} - Whether the date is valid
     */
    validateDateFormat(input) {
        const value = input.value;
        const datePattern = /^(0?[1-9]|1[0-2])\/\d{4}$/;
        
        if (!datePattern.test(value)) {
            input.setCustomValidity(this.languageManager.translate('validation.date_format'));
            input.reportValidity();
            return false;
        }
        
        // Check that month is 1-12
        const month = parseInt(value.split('/')[0], 10);
        if (month < 1 || month > 12) {
            input.setCustomValidity(this.languageManager.translate('validation.month_range'));
            input.reportValidity();
            return false;
        }
        
        // Valid date
        input.setCustomValidity('');
        input.reportValidity();
        return true;
    }
    
    /**
     * Handle form submission
     * @param {Event} event - The form submission event
     */
    handleFormSubmit(event) {
        // Always prevent default form submission
        if (event) {
            event.preventDefault();
        }
        
        // For testing, mock form if needed
        if (!this.form) {
            return;
        }
        
        // Get form fields
        const dateField = this.form.querySelector('[name="date"]');
        const amountField = this.form.querySelector('[name="amount"]');
        const interestField = this.form.querySelector('[name="interest"]');
        
        // Check if fields exist
        if (!dateField || !amountField) {
            console.warn('Required form fields not found');
            return;
        }
        
        // Get field values
        const date = dateField.value;
        const amount = parseFloat(amountField.value);
        const interest = interestField ? parseFloat(interestField.value || 0) : 0;
        
        // Add entry
        this.addEntry({
            date,
            amount,
            interest
        });
        
        // Reset form
        this.resetForm();
        
        // Trigger calculation
        this.triggerCalculation();
    }
    
    /**
     * Add or update an entry in the monthly data
     * @param {Object} entry - The entry data (date, amount, interest)
     */
    addEntry(entry) {
        // Find existing entry with same date
        const existingIndex = this.monthlyData.findIndex(item => item.date === entry.date);
        
        if (existingIndex >= 0) {
            // Update existing entry
            this.monthlyData[existingIndex] = entry;
        } else {
            // Add new entry
            this.monthlyData.push(entry);
        }
    }
    
    /**
     * Reset the form fields
     */
    resetForm() {
        if (this.form) {
            this.form.reset();
        }
    }
    
    /**
     * Trigger the calculation callback with the monthly data
     */
    triggerCalculation() {
        if (typeof this.onCalculate === 'function') {
            this.onCalculate(this.monthlyData);
        }
    }
    
    /**
     * Set the calculation callback
     * @param {Function} callback - The callback function
     */
    setCalculationCallback(callback) {
        this.onCalculate = callback;
    }
} 
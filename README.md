# Zakat Calculator Web Application

A modern, multilingual web application for calculating Zakat based on financial data. This tool helps users determine their Zakat obligations by analyzing uploaded financial data and comparing it against the Nisab threshold.

## Features

- **Multilingual Support**: Available in English, Arabic, and French.
- **File Upload**: Users can upload JSON files containing financial data.
- **Zakat Calculation**: Automatically calculates Zakat based on the uploaded data.
- **Nisab Reference**: Displays Nisab values for different years.
- **Hijri Date Conversion**: Converts Gregorian dates to Hijri dates.
- **Responsive Design**: Works seamlessly on desktop and mobile devices.
- **Accessibility**: Built with ARIA roles and semantic HTML for screen reader compatibility.

## Installation

### Prerequisites
- Node.js (v16 or higher)
- A modern web browser (Chrome, Firefox, Edge, or Safari)

### Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/zakat-calculator.git
   cd zakat-calculator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

1. **Select Language**: Choose your preferred language from the dropdown menu.
2. **Upload Data**: Click the "Upload" button and select a JSON file containing your financial data.
3. **View Results**:
   - The Zakat table will display your Zakat calculations.
   - The Nisab table will show the Nisab values for the relevant years.
4. **Switch Languages**: Change the language at any time to see the interface in your preferred language.

## File Format

The application accepts JSON files with the following structure:

```json
{
  "nisabData": {
    "2022": 4810,
    "2023": 5423.76
  },
  "monthlyData": [
    {
      "Date": "08/2022",
      "Amount": 1458.05,
      "Interest": null
    },
    {
      "Date": "09/2022",
      "Amount": 1600.00,
      "Interest": 10.50
    }
  ],
  "goldApiKey": "your_gold_api_key_here"
}

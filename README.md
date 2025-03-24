# Zakat Calculator Web Application

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A modern web application for calculating Zakat obligations based on Islamic financial principles.

## Features

- 📊 **Zakat Calculation** - Automatically calculates payable Zakat
- 🌍 **Multilingual Support** - Available in English, Arabic, and French
- 📁 **Data Import** - Upload financial data via JSON files
- 📅 **Hawl Period Tracking** - Monitors 12-month lunar cycles
- 💰 **Nisab Reference** - Displays current gold-based Nisab values
- 📱 **Responsive Design** - Works on all device sizes

## Getting Started

### Prerequisites
- Node.js v16+
- npm v8+

### Installation
```bash
# Clone repository
git clone https://github.com/your-username/zakat-calculator.git
cd zakat-calculator

# Install dependencies
npm install

# Build application
npm run build

# Start development server
npm run start
```

## Usage

1. **Upload Data**  
   Prepare a JSON file following this format:
   ```json
   {
     "nisabData": {
       "2023": 5423.76
     },
     "monthlyData": [
       {
         "Date": "08/2023",
         "Amount": 1500.00,
         "Interest": 0
       }
     ]
   }
   ```

2. **Calculate Zakat**
    - Click "Process Uploads" after selecting your file
    - View results in the interactive tables
    - Switch languages using the top-right dropdown

## Development Setup

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run start

# Build for production
npm run build
```

## File Structure
```
zakat-calculator/
├── dist/           # Production build
├── js/             # Source scripts
├── index.html      # Main application
├── style.css       # Stylesheet
└── package.json    # Dependency management
```

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## Acknowledgments

- Gold price data from [GoldAPI.io](https://www.goldapi.io)
- Hijri date conversion by [Aladhan API](https://aladhan.com)

## Testing

The application includes comprehensive unit tests using Jest:

```
npm test
```

To run tests in watch mode during development:

```
npm run test:watch
```

To generate a test coverage report:

```
npm run test:coverage
```
# Bank Reconciliation System

Automated monthly reconciliation system for matching bank transactions with internal accounting records across 33+ accounts.

## Features

- **Two-Tier Matching System**
  - Tier 1: Date + Amount matching (±30 days)
  - Tier 2: Check Number + Amount matching (any date)
- **Sign-Aware Amount Parsing** - Handles currency symbols, commas, negative signs
- **Drag & Drop Interface** - Easy file upload for bank CSV and internal Excel/CSV files
- **Excel Report Generation** - 7 sheets per account with detailed reconciliation data
- **Check Number Tracking** - Special handling for delayed check clearing
- **Automated Archiving** - Organized file storage with timestamps

## Output Structure

Each account generates an Excel workbook with 7 sheets:
1. **Bank Transactions** - All bank data
2. **Our Transactions** - All internal data
3. **Matched** - Transactions matched within 30 days or by check number
4. **Close Matches** - Similar amounts requiring review
5. **Check Matches** - Check number + amount matches (highlighted blue)
6. **Bank Only** - Unmatched bank transactions
7. **Our Records Only** - Unmatched internal transactions

## Configuration

### Matching Parameters
```javascript
const MATCHING_CONFIG = {
  EXACT_MATCH_DAYS: 10,     // ±10 days for exact matches
  CLOSE_MATCH_DAYS: 30,     // ±30 days for close matches  
  AMOUNT_TOLERANCE: 0.01,   // $0.01 tolerance for rounding
};
```

### Field Mapping
- **Bank Check Numbers**: `Additional Reference` field
- **Internal Check Numbers**: `Check Number` field
- **Account Numbers**: 
  - Bank: `Account Number`
  - Internal: `transactiontable_accountings_ProbateMain::ACBT_AccountNumber`

## Deployment

### Prerequisites
1. Node.js installed
2. Google Apps Script CLI (clasp) installed: `npm install -g @google/clasp`
3. Google Apps Script API enabled

### Setup
1. Clone this repository
2. Run `clasp login` to authenticate
3. Run `clasp push` to deploy to Google Apps Script
4. Run `setupFolderStructure()` function in Apps Script editor
5. Update CONFIG with folder IDs
6. Deploy as web app: `clasp deploy`

### Web App Access
The system generates a web interface for file upload and processing. Access via the deployment URL.

## Usage

1. **Upload Files**
   - Bank transactions (CSV format)
   - Internal records (Excel/CSV format)

2. **Configure**
   - Set month/year (defaults to previous month)

3. **Process**
   - Click "Start Reconciliation Process"
   - Monitor real-time progress
   - Access results via generated folder link

## Architecture

### Two-Tier Matching Logic
1. **Date + Amount Matching**: Matches transactions within ±30 days with exact amounts
2. **Check Number Matching**: Matches by check number + amount regardless of date (handles delayed check clearing)

### Smart Amount Parsing
- Handles currency symbols: `$1,234.56` → `1234.56`
- Processes negative signs: `-$500.00` → `-500.00`
- Supports accounting format: `(500.00)` → `-500.00`
- Matches opposite signs: Bank `-$340.97` matches Internal `$340.97`

### Check Number Extraction
- Bank transactions: Extracts from `Additional Reference` field
- Internal transactions: Extracts from `Check Number` field
- Handles mixed formats and extracts numeric portions

## File Structure

```
bank-reconciliation-system/
├── Code.js              # Main Google Apps Script code
├── index.html           # Web interface
├── appsscript.json      # Apps Script configuration
├── package.json         # Node.js dependencies
└── README.md           # This file
```

## Google Drive Integration

The system automatically creates organized folder structures:
- **Archive Folder**: Stores uploaded files with timestamps
- **Reports Folder**: Contains generated Excel reconciliation reports

## Error Handling

- Validates file formats and content
- Handles missing or malformed data gracefully
- Provides detailed error messages and logging
- Prevents false matches on empty check numbers

## Version History

- **v1.0**: Initial implementation with basic matching
- **v2.0**: Added two-tier matching system and check number support
- **v3.0**: Enhanced amount parsing and sign handling
- **v4.0**: Improved date tolerance and matching logic

## Support

For issues or questions, refer to the implementation guide or check the Google Apps Script execution logs for detailed error information.
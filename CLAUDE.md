# CLAUDE.md - Bank Reconciliation System

## Project Overview
Automated monthly reconciliation system for matching bank transactions with internal accounting records across 33+ accounts. Built with Google Apps Script and deployed as a web application.

## Key Technologies
- **Google Apps Script** - Server-side logic and Google Drive integration
- **HTML/CSS/JavaScript** - Web interface with drag & drop file upload
- **Google Sheets/Excel** - Report generation and data storage
- **Google Drive API** - File management and archiving

## Current Architecture

### Core Matching Logic (Code.js)
- **Two-tier matching system**:
  - Tier 1: Date + Amount (±30 days = MATCH)
  - Tier 2: Check Number + Amount (any date = MATCH)
- **Sign-aware amount parsing** handles currency formats
- **Smart check number extraction** from multiple field formats

### File Structure
```
Code.js           # Main Google Apps Script server code
index.html        # Web interface with custom styling
appsscript.json   # Apps Script configuration with Drive API
package.json      # Node.js metadata
.clasp.json       # Google Apps Script project config (gitignored)
```

### Field Mappings
- **Bank Check Numbers**: `Additional Reference` field
- **Internal Check Numbers**: `Check Number` field  
- **Account Numbers**: `Account Number` (bank) / `transactiontable_accountings_ProbateMain::ACBT_AccountNumber` (internal)

## Configuration
Located in `Code.js`:
```javascript
const CONFIG = {
  ARCHIVE_FOLDER_ID: '1FOrhhFNOu0k6ubJZWlKMDTA7GUBu3UfR',
  RECONCILIATION_FOLDER_ID: '16BjjdECxTTGCkQp6YXndyoZSq1P9_rXA'
};

const MATCHING_CONFIG = {
  EXACT_MATCH_DAYS: 10,     // Not currently used
  CLOSE_MATCH_DAYS: 30,     // ±30 days for matching
  AMOUNT_TOLERANCE: 0.01,   // $0.01 tolerance for rounding
};
```

## Deployment Commands
```bash
# Deploy changes
clasp push

# Create new deployment  
clasp create-deployment --description "Description here"

# Open Apps Script editor
clasp open-script

# Open deployed web app
clasp open-web-app DEPLOYMENT_ID
```

## Known Issues & Solutions

### Original Problem: Transaction Matching Failures
- **Issue**: `-$340.97` (bank) not matching `$340.97` (internal)
- **Root Cause**: Amount parsing failed on currency symbols
- **Solution**: Enhanced `parseAmount()` function with sign-aware parsing

### Check Timing Issue
- **Issue**: Checks written in July clearing in August appear unmatched
- **Root Cause**: Date-only matching logic
- **Solution**: Two-tier system with check number matching

### Matching Categories Fixed
- **Old Logic**: Same day = exact, ±7 days = close, >7 days = unmatched
- **New Logic**: ±30 days + exact amount = MATCH, check# + amount = MATCH

## Testing Data Examples
```
Bank Transaction:
TRC: 71902399, Account: 5204203, Date: 07/10/2025, Amount: -$340.97, Additional Reference: 1004, Type: CHECK PAID

Internal Transaction:  
UID: 33880, Account: 5204203, Date: 07/02/2025, Amount: 340.97, Check Number: 1004, Type: Disbursement

Expected Result: MATCH (8 days ≤ 30 days OR check numbers match)
```

## Output Structure
Each account generates 7-sheet Excel workbook:
1. **Bank Transactions** - Raw bank data
2. **Our Transactions** - Raw internal data
3. **Matched** - Successful matches with days difference
4. **Close Matches** - Similar amounts requiring review
5. **Check Matches** - Check number matches (blue highlight)
6. **Bank Only** - Unmatched bank transactions  
7. **Our Records Only** - Unmatched internal transactions

## Future Architecture: Cumulative System

### Planned Enhancement
Current system processes monthly snapshots. Need cumulative system where:
- **Master sheets per account** accumulate all historical data
- **Cross-month matching** handles delayed check clearing
- **Monthly processing** appends new data and re-runs matching on full dataset

### Implementation Steps (Pending)
1. Create persistent Google Sheets per account
2. Modify workflow to append vs. replace data
3. Implement historical matching across all accumulated transactions
4. Add aging reports for outstanding items

## Common Commands for Future Development

### Testing & Debugging
```bash
# View logs
clasp logs

# Push and test cycle
clasp push && clasp open-web-app DEPLOYMENT_ID
```

### Git Management
```bash
# Commit changes
git add . && git commit -m "Description" && git push origin main
```

### Key Functions to Know
- `setupFolderStructure()` - Run once to create Google Drive folders
- `processReconciliation()` - Main reconciliation logic
- `matchTransactions()` - Core matching algorithm
- `parseAmount()` - Handles currency parsing with signs

## Interface Customization
Custom color scheme applied:
- Background: `#384959` (dark blue-gray)
- Header: `#6A89A7` (medium blue-gray)  
- Buttons: `#BDDDFC` (light blue)
- Accent: `#88BDF2` (medium blue)

No icons, clean professional appearance, defaults to previous month for processing.

## Performance Notes
- Handles 33+ accounts efficiently
- File size limits: ~10MB recommended for uploads
- Processing time: 30-60 seconds for typical monthly data
- Uses Google Drive for storage (no database required)

## Security Considerations
- `.clasp.json` contains project IDs (gitignored)
- Folder IDs in CONFIG are references only (safe to version control)
- Web app access: "ANYONE" (can be restricted if needed)
- Files archived with timestamps for audit trail
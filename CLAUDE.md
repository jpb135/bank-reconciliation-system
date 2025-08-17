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

## Critical Context for Future Development

### Business Requirements Understanding
- **33+ trust accounts** need monthly reconciliation
- **Check timing is crucial** - checks written one month often clear the next
- **Exact amount matching** is required (not fuzzy matching)
- **Opposite signs are normal** - bank shows negative, internal shows positive for disbursements
- **Manual review burden** must be minimized - current system requires too much manual work

### Data Format Specifics
- **Bank CSV format**: Headers include `TRC Number`, `Account Number`, `Post Date`, `Amount`, `Additional Reference`, `Description`, `Type`
- **Internal format**: Complex field names like `transactiontable_accountings_ProbateMain::ACBT_AccountNumber`
- **Currency handling**: Bank amounts include `$` and `,` symbols, sometimes parentheses for negatives
- **Check numbers**: Bank uses `Additional Reference`, Internal uses `Check Number` field
- **Account matching**: Must group by account number for individual reconciliation reports

### User Workflow Context
- **Monthly process** typically run for previous month (e.g., run August reconciliation in September)
- **Two file upload** - one bank CSV, one internal Excel/CSV
- **Review workflow** - user examines "Close Matches" and unmatched items for manual decisions
- **Excel output preferred** - user needs downloadable files, not just web interface
- **Audit trail important** - files must be archived with timestamps

### Performance & Scale Reality
- **Large datasets** - 33+ accounts with monthly transactions
- **Processing time** - current 30-60 seconds is acceptable
- **File size limits** - 10MB uploads work fine with Google Apps Script
- **User patience** - visual progress bar is essential during processing

### Major Pain Points Solved
1. **Amount parsing failure** - `parseFloat("$4,416.00")` returned `NaN`
2. **Sign mismatch** - bank `-$340.97` not matching internal `$340.97`
3. **Date tolerance too strict** - 7 days insufficient for check clearing
4. **Check timing issue** - checks written July 10, cleared August 14 appeared unmatched
5. **False matches on empty checks** - prevented with proper null checking

### Critical Technical Decisions Made
- **Two-tier matching** prioritizes date+amount over check number matching
- **30-day tolerance** balances accuracy with check clearing reality
- **Absolute value comparison** for amounts handles sign differences
- **Sequential processing** prevents double-matching of transactions
- **Excel conversion** via Google Sheets for compatibility

### Next Phase Architecture (Cumulative System)
**Why needed**: Current monthly snapshots miss cross-month transactions
**Approach**: Persistent Google Sheets per account that accumulate all historical data
**Challenge**: Re-running matching on large datasets efficiently
**Benefit**: July check clearing in August will auto-match retroactively

### Testing Strategy
- **Use real data** provided by user (Linda S. Lischer account examples)
- **Verify specific cases**: `-$10.28` check #1005 should be MATCH not close match
- **Check edge cases**: empty check numbers, large date differences, currency formatting
- **Performance test**: Full 33-account monthly run

### Deployment Management
- **Multiple deployment versions** exist - always create new deployment for testing
- **Current production URL**: Keep track of which deployment users are actively using
- **Rollback strategy**: Previous deployments remain accessible if issues arise

### User Interface Philosophy
- **Minimal color palette** - user specifically requested muted blues/grays
- **No icons** - clean professional appearance
- **Bold important text** - "Start Reconciliation Process" button
- **Previous month default** - users typically reconcile completed months

### Error Patterns to Watch
- **Field name mismatches** - bank vs internal field names change
- **Date parsing failures** - various date formats in source data
- **Amount tolerance edge cases** - rounding differences
- **Google Drive quota limits** - large file processing
- **Apps Script timeout limits** - very large datasets

### Success Metrics
- **Increased match rate** - fewer items in "Bank Only" and "Our Records Only"
- **Reduced manual review** - fewer questionable matches in "Close Matches"
- **User satisfaction** - less time spent on monthly reconciliation
- **Audit compliance** - complete trail of all transactions processed

### Future Feature Requests (Likely)
- **Batch processing** - multiple months at once
- **Exception reporting** - aged unmatched items
- **Email notifications** - automated alerts for large discrepancies
- **API access** - integrate with accounting software
- **Advanced matching rules** - custom logic per account type
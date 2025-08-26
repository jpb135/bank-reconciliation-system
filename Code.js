// ========================================
// BANK RECONCILIATION SYSTEM - SERVER CODE
// ========================================

// CONFIGURATION - UPDATE AFTER RUNNING setupFolderStructure()
const CONFIG = {
  ARCHIVE_FOLDER_ID: '1FOrhhFNOu0k6ubJZWlKMDTA7GUBu3UfR',
  RECONCILIATION_FOLDER_ID: '16BjjdECxTTGCkQp6YXndyoZSq1P9_rXA'
};

// Matching configuration
const MATCHING_CONFIG = {
  EXACT_MATCH_DAYS: 10,     // ±10 days for exact matches
  CLOSE_MATCH_DAYS: 30,     // ±30 days for close matches  
  AMOUNT_TOLERANCE: 0.01,   // $0.01 tolerance for rounding
};

/**
 * Serves the HTML web app
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('Bank Reconciliation System');
}

/**
 * Process uploaded file and store in archive
 */
function uploadFile(fileData, fileName, fileType) {
  try {
    console.log(`Uploading ${fileType} file: ${fileName}`);
    
    // Decode base64 data
    const blob = Utilities.newBlob(
      Utilities.base64Decode(fileData), 
      'application/octet-stream', 
      fileName
    );
    
    // Get archive folder
    const archiveFolder = DriveApp.getFolderById(CONFIG.ARCHIVE_FOLDER_ID);
    const yearMonth = getYearMonth();
    
    // Create monthly folder if needed
    let monthlyFolder;
    const monthlyFolders = archiveFolder.getFoldersByName(yearMonth);
    if (monthlyFolders.hasNext()) {
      monthlyFolder = monthlyFolders.next();
    } else {
      monthlyFolder = archiveFolder.createFolder(yearMonth);
    }
    
    // Create subfolder
    const subfolderName = fileType === 'bank' ? 'Bank Files' : 'Internal Files';
    let subfolder;
    const subfolders = monthlyFolder.getFoldersByName(subfolderName);
    if (subfolders.hasNext()) {
      subfolder = subfolders.next();
    } else {
      subfolder = monthlyFolder.createFolder(subfolderName);
    }
    
    // Save with timestamp
    const timestamp = Utilities.formatDate(
      new Date(), 
      Session.getScriptTimeZone(), 
      'yyyyMMdd_HHmmss'
    );
    const file = subfolder.createFile(blob);
    file.setName(`${timestamp}_${fileName}`);
    
    return {
      success: true,
      fileId: file.getId(),
      fileName: fileName,
      fileType: fileType
    };
    
  } catch (error) {
    console.error('Upload error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Main reconciliation function
 */
function processReconciliation(bankFileId, myFileId, monthYear) {
  try {
    console.log(`Starting reconciliation for ${monthYear}`);
    
    // Load files
    const bankData = loadBankTransactions(bankFileId);
    const myData = loadMyTransactions(myFileId);
    
    if (!bankData.success || !myData.success) {
      throw new Error('File loading failed');
    }
    
    // Group by account
    const bankByAccount = groupTransactionsByAccount(bankData.transactions, 'bank');
    const myByAccount = groupTransactionsByAccount(myData.transactions, 'my');
    
    // Get account names
    const accountNames = createAccountNameMap(myData.transactions);
    
    // Get all accounts
    const allAccounts = new Set([
      ...Object.keys(bankByAccount),
      ...Object.keys(myByAccount)
    ]);
    
    // Create output folder
    const outputFolder = DriveApp.getFolderById(CONFIG.RECONCILIATION_FOLDER_ID);
    const folderDate = Utilities.formatDate(
      new Date(), 
      Session.getScriptTimeZone(), 
      'yyyyMMdd'
    );
    const monthlyFolderName = `Reconciliation_${monthYear}_${folderDate}`;
    const monthlyFolder = outputFolder.createFolder(monthlyFolderName);
    
    // Process accounts
    const results = [];
    const masterSummary = {
      totalAccounts: allAccounts.size,
      processedDate: new Date(),
      monthYear: monthYear,
      accounts: []
    };
    
    for (const accountNumber of allAccounts) {
      const fullName = accountNames[accountNumber] || 'Unknown';
      console.log(`Processing: ${accountNumber} - ${fullName}`);
      
      const bankTrans = bankByAccount[accountNumber] || [];
      const myTrans = myByAccount[accountNumber] || [];
      
      // Match transactions
      const matchResult = matchTransactions(bankTrans, myTrans);
      
      // Create Excel workbook
      const workbookId = createAccountWorkbook(
        monthlyFolder,
        accountNumber,
        fullName,
        bankTrans,
        myTrans,
        matchResult,
        monthYear,
        bankData.headers,
        myData.headers
      );
      
      // Add to results
      const accountSummary = {
        accountNumber: accountNumber,
        accountName: fullName,
        bankTransactionCount: bankTrans.length,
        myTransactionCount: myTrans.length,
        matchedCount: matchResult.matched.length,
        closeMatchCount: matchResult.closeMatches.length,
        bankOnlyCount: matchResult.bankOnly.length,
        myOnlyCount: matchResult.myOnly.length,
        workbookId: workbookId
      };
      
      results.push(accountSummary);
      masterSummary.accounts.push(accountSummary);
    }
    
    // Create master summary
    createMasterSummaryReport(monthlyFolder, masterSummary);
    
    return {
      success: true,
      monthlyFolderName: monthlyFolderName,
      monthlyFolderId: monthlyFolder.getId(),
      monthlyFolderUrl: monthlyFolder.getUrl(),
      accountsProcessed: allAccounts.size,
      results: results
    };
    
  } catch (error) {
    console.error('Processing error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Setup function - RUN THIS FIRST
 */
function setupFolderStructure() {
  console.log('Setting up folder structure...');
  
  // Create folders
  const archiveFolder = DriveApp.createFolder('Reconciliation - Archive');
  const reconciliationFolder = DriveApp.createFolder('Reconciliation - Reports');
  
  // Create archive subfolders
  const yearMonth = getYearMonth();
  const monthlyArchive = archiveFolder.createFolder(yearMonth);
  monthlyArchive.createFolder('Bank Files');
  monthlyArchive.createFolder('Internal Files');
  
  // Log IDs for configuration
  console.log('=== COPY THESE IDs TO CONFIG ===');
  console.log('ARCHIVE_FOLDER_ID: "' + archiveFolder.getId() + '"');
  console.log('RECONCILIATION_FOLDER_ID: "' + reconciliationFolder.getId() + '"');
  
  return {
    success: true,
    archiveFolderId: archiveFolder.getId(),
    reconciliationFolderId: reconciliationFolder.getId()
  };
}

// ===== HELPER FUNCTIONS =====

function getYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}_${month}`;
}

function createAccountNameMap(transactions) {
  const accountNames = {};
  transactions.forEach(trans => {
    const accountNumber = String(
      trans['transactiontable_accountings_ProbateMain::ACBT_AccountNumber'] || ''
    ).trim();
    const fullName = String(
      trans['transactiontable_accountings_ProbateMain::DI FullName'] || ''
    ).trim();
    
    if (accountNumber && accountNumber !== '' && fullName) {
      accountNames[accountNumber] = fullName;
    }
  });
  accountNames['UNASSIGNED'] = 'Unassigned Transactions';
  return accountNames;
}

function loadBankTransactions(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const content = file.getBlob().getDataAsString();
    const lines = content.split('\n').filter(line => line.trim() !== '');
    
    const headers = parseCSVLine(lines[0]);
    const transactions = [];
    
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.length > 0) {
        const transaction = {};
        headers.forEach((header, index) => {
          transaction[header] = row[index];
        });
        // Standardize dates
        if (transaction['Date']) {
          transaction['Date'] = standardizeDate(transaction['Date']);
        }
        transactions.push(transaction);
      }
    }
    
    return { success: true, headers: headers, transactions: transactions };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function loadMyTransactions(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();
    const fileName = file.getName().toLowerCase();
    
    if (mimeType === MimeType.CSV || fileName.endsWith('.csv')) {
      // Handle as CSV
      const content = file.getBlob().getDataAsString();
      const lines = content.split('\n').filter(line => line.trim() !== '');
      const headers = parseCSVLine(lines[0]);
      const transactions = [];
      
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length > 0 && row.some(cell => cell !== '')) {
          const transaction = {};
          headers.forEach((header, index) => {
            transaction[header] = row[index];
          });
          if (transaction['Date']) {
            transaction['Date'] = standardizeDate(transaction['Date']);
          }
          transactions.push(transaction);
        }
      }
      return { success: true, headers: headers, transactions: transactions };
      
    } else {
      // Handle as Excel
      const tempSheet = Drive.Files.copy(
        { title: 'temp_conversion' },
        fileId,
        { convert: true }
      );
      
      const ss = SpreadsheetApp.openById(tempSheet.id);
      const sheet = ss.getSheets()[0];
      const data = sheet.getDataRange().getValues();
      Drive.Files.remove(tempSheet.id);
      
      const headers = data[0];
      const transactions = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row.some(cell => cell !== '')) {
          const transaction = {};
          headers.forEach((header, index) => {
            transaction[header] = row[index];
          });
          if (transaction['Date']) {
            transaction['Date'] = standardizeDate(transaction['Date']);
          }
          transactions.push(transaction);
        }
      }
      return { success: true, headers: headers, transactions: transactions };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function standardizeDate(dateValue) {
  if (!dateValue) return '';
  
  let date;
  if (dateValue instanceof Date) {
    date = dateValue;
  } else if (typeof dateValue === 'string') {
    date = new Date(dateValue);
    if (isNaN(date)) {
      const parts = dateValue.split(/[\/\-]/);
      if (parts.length === 3) {
        const month = parseInt(parts[0]);
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        date = new Date(year < 100 ? 2000 + year : year, month - 1, day);
      }
    }
  } else if (typeof dateValue === 'number') {
    date = new Date((dateValue - 25569) * 86400 * 1000);
  }
  
  if (date && !isNaN(date)) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }
  
  return String(dateValue);
}

function groupTransactionsByAccount(transactions, source) {
  const groups = {};
  
  transactions.forEach(trans => {
    let accountNumber;
    if (source === 'bank') {
      accountNumber = String(trans['Account Number'] || '').trim();
    } else {
      accountNumber = String(
        trans['transactiontable_accountings_ProbateMain::ACBT_AccountNumber'] || ''
      ).trim();
    }
    
    if (!accountNumber || accountNumber === '' || accountNumber === 'null') {
      accountNumber = 'UNASSIGNED';
    }
    
    if (!groups[accountNumber]) {
      groups[accountNumber] = [];
    }
    groups[accountNumber].push(trans);
  });
  
  return groups;
}

function matchTransactions(bankTransactions, myTransactions) {
  const matched = [];
  const closeMatches = [];
  const checkMatches = [];
  const matchedBankIndices = new Set();
  const matchedMyIndices = new Set();
  
  // TIER 1: Date + amount matches (within 30 days = MATCH)
  bankTransactions.forEach((bankTrans, bankIdx) => {
    if (matchedBankIndices.has(bankIdx)) return;
    
    const bankDate = parseDate(bankTrans['Date']);
    const bankAmount = parseAmount(bankTrans['Amount']);
    
    myTransactions.forEach((myTrans, myIdx) => {
      if (matchedMyIndices.has(myIdx)) return;
      
      const myDate = parseDate(myTrans['Date']);
      const myAmount = parseAmount(myTrans['Amount']);
      
      if (amountsMatch(bankAmount, myAmount)) {
        const daysDiff = getDaysDifference(bankDate, myDate);
        
        // Any date within 30 days + exact amount = MATCH (not close match)
        if (Math.abs(daysDiff) <= MATCHING_CONFIG.CLOSE_MATCH_DAYS) {
          matched.push({
            bank: bankTrans,
            my: myTrans,
            daysDifference: daysDiff,
            matchType: daysDiff === 0 ? 'exact' : 'date-match'
          });
          matchedBankIndices.add(bankIdx);
          matchedMyIndices.add(myIdx);
        }
      }
    });
  });
  
  // TIER 2: Check number + amount matches (any date)
  // DISABLED - Bank data doesn't contain check numbers or transaction types
  /*
  bankTransactions.forEach((bankTrans, bankIdx) => {
    if (matchedBankIndices.has(bankIdx)) return;
    
    const bankAmount = parseAmount(bankTrans['Amount']);
    const bankCheckNum = extractCheckNumber(bankTrans);
    
    // Only process if this appears to be a check transaction
    if (!bankCheckNum || !isCheckTransaction(bankTrans)) return;
    
    myTransactions.forEach((myTrans, myIdx) => {
      if (matchedMyIndices.has(myIdx)) return;
      
      const myAmount = parseAmount(myTrans['Amount']);
      const myCheckNum = extractCheckNumber(myTrans);
      
      // Check number and amount must match
      if (bankCheckNum && myCheckNum && 
          bankCheckNum === myCheckNum && 
          amountsMatch(bankAmount, myAmount)) {
        
        const bankDate = parseDate(bankTrans['Date']);
        const myDate = parseDate(myTrans['Date']);
        const daysDiff = getDaysDifference(bankDate, myDate);
        
        checkMatches.push({
          bank: bankTrans,
          my: myTrans,
          checkNumber: bankCheckNum,
          daysDifference: daysDiff,
          matchType: 'check'
        });
        matchedBankIndices.add(bankIdx);
        matchedMyIndices.add(myIdx);
      }
    });
  });
  */
  
  const bankOnly = bankTransactions.filter((_, idx) => !matchedBankIndices.has(idx));
  const myOnly = myTransactions.filter((_, idx) => !matchedMyIndices.has(idx));
  
  return {
    matched: matched,
    closeMatches: closeMatches,
    checkMatches: checkMatches,
    bankOnly: bankOnly,
    myOnly: myOnly
  };
}

function createAccountWorkbook(folder, accountNumber, fullName, bankTrans, 
                              myTrans, matchResult, monthYear, 
                              bankHeaders, myHeaders) {
  try {
    const fileName = `${fullName}_${accountNumber}_Reconciliation_${monthYear}`;
    const ss = SpreadsheetApp.create(fileName);
    
    // Sheet 1: Bank Transactions
    const bankSheet = ss.getSheets()[0];
    bankSheet.setName('Bank Transactions');
    if (bankTrans.length > 0) {
      const bankData = [bankHeaders];
      bankTrans.forEach(trans => {
        const row = bankHeaders.map(header => trans[header] || '');
        bankData.push(row);
      });
      bankSheet.getRange(1, 1, bankData.length, bankData[0].length).setValues(bankData);
    } else {
      bankSheet.getRange(1, 1).setValue('No bank transactions for this account');
    }
    
    // Sheet 2: Our Transactions
    const mySheet = ss.insertSheet('Our Transactions');
    if (myTrans.length > 0) {
      const myData = [myHeaders];
      myTrans.forEach(trans => {
        const row = myHeaders.map(header => trans[header] || '');
        myData.push(row);
      });
      mySheet.getRange(1, 1, myData.length, myData[0].length).setValues(myData);
    } else {
      mySheet.getRange(1, 1).setValue('No internal transactions for this account');
    }
    
    // Sheet 3: Matched
    const matchedSheet = ss.insertSheet('Matched');
    const matchedHeaders = ['Bank Date', 'Bank Amount', '', 'Our Date', 
                           'Our Amount', 'Our Check #', 'Description', 'Type', 'Days Diff'];
    const matchedData = [matchedHeaders];
    matchResult.matched.forEach(match => {
      matchedData.push([
        match.bank['Date'],
        match.bank['Amount'],
        '', // No check numbers in bank data
        '',
        match.my['Date'],
        match.my['Amount'],
        match.my['Check Number'] || '',
        match.my['Description1'] || '',
        match.my['Transaction Type'] || '',
        match.daysDifference || 0
      ]);
    });
    if (matchedData.length > 1) {
      matchedSheet.getRange(1, 1, matchedData.length, matchedData[0].length)
                  .setValues(matchedData);
    } else {
      matchedSheet.getRange(1, 1).setValue('No matched transactions');
    }
    
    // Sheet 4: Close Matches
    const closeSheet = ss.insertSheet('Close Matches');
    const closeHeaders = ['Bank Date', 'Bank Amount', '', 'Our Date', 
                         'Our Amount', 'Our Check #', 'Description', 'Type', 'Days Diff'];
    const closeData = [closeHeaders];
    matchResult.closeMatches.forEach(match => {
      closeData.push([
        match.bank['Date'],
        match.bank['Amount'],
        '', // No check numbers in bank data
        '',
        match.my['Date'],
        match.my['Amount'],
        match.my['Check Number'] || '',
        match.my['Description1'] || '',
        match.my['Transaction Type'] || '',
        match.daysDifference
      ]);
    });
    if (closeData.length > 1) {
      closeSheet.getRange(1, 1, closeData.length, closeData[0].length)
                .setValues(closeData);
      closeSheet.getRange(2, 1, closeData.length - 1, closeData[0].length)
                .setBackground('#fff3cd')
                .setBorder(true, true, true, true, true, true);
    } else {
      closeSheet.getRange(1, 1).setValue('No close matches requiring review');
    }
    
    // Sheet 5: Check Matches
    const checkMatchSheet = ss.insertSheet('Check Matches');
    const checkHeaders = ['Bank Date', 'Bank Amount', '', 'Our Date', 
                         'Our Amount', 'Our Check #', 'Description', 'Type', 'Matched Check #', 'Days Diff'];
    const checkData = [checkHeaders];
    matchResult.checkMatches.forEach(match => {
      checkData.push([
        match.bank['Date'],
        match.bank['Amount'],
        '', // No check numbers in bank data
        '',
        match.my['Date'],
        match.my['Amount'],
        match.my['Check Number'] || '',
        match.my['Description1'] || '',
        match.my['Transaction Type'] || '',
        match.checkNumber,
        match.daysDifference
      ]);
    });
    if (checkData.length > 1) {
      checkMatchSheet.getRange(1, 1, checkData.length, checkData[0].length)
                    .setValues(checkData);
      checkMatchSheet.getRange(2, 1, checkData.length - 1, checkData[0].length)
                    .setBackground('#e6f3ff')
                    .setBorder(true, true, true, true, true, true);
    } else {
      checkMatchSheet.getRange(1, 1).setValue('No check matches found');
    }
    
    // Sheet 6: Bank Only
    const bankOnlySheet = ss.insertSheet('Bank Only');
    if (matchResult.bankOnly.length > 0) {
      const bankOnlyData = [bankHeaders];
      matchResult.bankOnly.forEach(trans => {
        const row = bankHeaders.map(header => trans[header] || '');
        bankOnlyData.push(row);
      });
      bankOnlySheet.getRange(1, 1, bankOnlyData.length, bankOnlyData[0].length)
                   .setValues(bankOnlyData);
    } else {
      bankOnlySheet.getRange(1, 1).setValue('No unmatched bank transactions');
    }
    
    // Sheet 7: Our Records Only
    const myOnlySheet = ss.insertSheet('Our Records Only');
    if (matchResult.myOnly.length > 0) {
      const myOnlyData = [myHeaders];
      matchResult.myOnly.forEach(trans => {
        const row = myHeaders.map(header => trans[header] || '');
        myOnlyData.push(row);
      });
      myOnlySheet.getRange(1, 1, myOnlyData.length, myOnlyData[0].length)
                 .setValues(myOnlyData);
    } else {
      myOnlySheet.getRange(1, 1).setValue('No unmatched internal transactions');
    }
    
    // Format sheets
    formatSheets(ss);
    
    // Convert to Excel
    const spreadsheetId = ss.getId();
    const blob = getExcelBlob(spreadsheetId, fileName);
    const excelFile = folder.createFile(blob);
    
    // Delete temp Google Sheet
    DriveApp.getFileById(spreadsheetId).setTrashed(true);
    
    return excelFile.getId();
    
  } catch (error) {
    console.error(`Error creating workbook for ${accountNumber}:`, error);
    throw error;
  }
}

function createMasterSummaryReport(folder, summary) {
  try {
    const fileName = `Master_Summary_${summary.monthYear}`;
    const ss = SpreadsheetApp.create(fileName);
    const sheet = ss.getSheets()[0];
    sheet.setName('Summary');
    
    const headers = [
      ['Reconciliation Summary Report'],
      ['Month/Year:', summary.monthYear],
      ['Processed:', summary.processedDate],
      ['Total Accounts:', summary.totalAccounts],
      [''],
      ['Account Number', 'Account Name', 'Bank Trans', 'Our Trans', 
       'Matched', 'Close Matches', 'Bank Only', 'Our Only', 'Match Rate %']
    ];
    
    const data = [...headers];
    let totalBank = 0, totalMy = 0, totalMatched = 0, totalClose = 0;
    
    summary.accounts.sort((a, b) => {
      if (a.accountName && b.accountName) {
        return a.accountName.localeCompare(b.accountName);
      }
      return 0;
    });
    
    summary.accounts.forEach(account => {
      const matchRate = account.myTransactionCount > 0 
        ? ((account.matchedCount / account.myTransactionCount) * 100).toFixed(1)
        : 0;
        
      data.push([
        account.accountNumber,
        account.accountName || 'Unknown',
        account.bankTransactionCount,
        account.myTransactionCount,
        account.matchedCount,
        account.closeMatchCount,
        account.bankOnlyCount,
        account.myOnlyCount,
        matchRate
      ]);
      
      totalBank += account.bankTransactionCount;
      totalMy += account.myTransactionCount;
      totalMatched += account.matchedCount;
      totalClose += account.closeMatchCount;
    });
    
    data.push(['']);
    data.push([
      'TOTALS', '',
      totalBank, totalMy, totalMatched, totalClose,
      totalBank - totalMatched - totalClose,
      totalMy - totalMatched - totalClose,
      totalMy > 0 ? ((totalMatched / totalMy) * 100).toFixed(1) : 0
    ]);
    
    sheet.getRange(1, 1, data.length, data[5].length).setValues(data);
    
    // Format
    sheet.getRange(1, 1, 1, 9).merge().setFontSize(16).setFontWeight('bold');
    sheet.getRange(6, 1, 1, 9).setFontWeight('bold')
         .setBackground('#4285f4').setFontColor('white');
    sheet.getRange(data.length, 1, 1, 9).setFontWeight('bold')
         .setBackground('#f0f0f0');
    
    for (let i = 1; i <= 9; i++) {
      sheet.autoResizeColumn(i);
    }
    
    // Convert to Excel
    const spreadsheetId = ss.getId();
    const blob = getExcelBlob(spreadsheetId, fileName);
    folder.createFile(blob);
    
    DriveApp.getFileById(spreadsheetId).setTrashed(true);
    
  } catch (error) {
    console.error('Error creating master summary:', error);
  }
}

function getExcelBlob(spreadsheetId, fileName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return response.getBlob().setName(`${fileName}.xlsx`);
}

function formatSheets(spreadsheet) {
  spreadsheet.getSheets().forEach(sheet => {
    const dataRange = sheet.getDataRange();
    if (dataRange.getNumRows() > 0) {
      sheet.getRange(1, 1, 1, dataRange.getNumColumns())
           .setFontWeight('bold').setBackground('#f0f0f0');
      dataRange.setBorder(true, true, true, true, true, true);
      for (let i = 1; i <= dataRange.getNumColumns(); i++) {
        sheet.autoResizeColumn(i);
      }
    }
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(field => field.trim());
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  if (typeof dateStr === 'string' && dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const parts = dateStr.split('/');
    return new Date(parts[2], parts[0] - 1, parts[1]);
  }
  
  const date = new Date(dateStr);
  if (!isNaN(date)) return date;
  
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    return new Date(parts[2], parts[0] - 1, parts[1]);
  }
  
  return null;
}

function datesEqual(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function getDaysDifference(date1, date2) {
  if (!date1 || !date2) return 999;
  const diff = date1.getTime() - date2.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function parseAmount(amountStr) {
  if (!amountStr) return 0;
  
  // Convert to string and handle parentheses as negative
  let cleanAmount = String(amountStr).trim();
  let isNegative = false;
  
  // Check for parentheses (accounting format for negative)
  if (cleanAmount.startsWith('(') && cleanAmount.endsWith(')')) {
    isNegative = true;
    cleanAmount = cleanAmount.slice(1, -1);
  }
  
  // Check for negative sign
  if (cleanAmount.startsWith('-')) {
    isNegative = true;
    cleanAmount = cleanAmount.substring(1);
  }
  
  // Remove currency symbols, commas, and spaces
  cleanAmount = cleanAmount
    .replace(/[$,\s]/g, '')
    .trim();
  
  const parsed = parseFloat(cleanAmount);
  if (isNaN(parsed)) return 0;
  
  return isNegative ? -Math.abs(parsed) : Math.abs(parsed);
}

function amountsMatch(amount1, amount2, tolerance = MATCHING_CONFIG.AMOUNT_TOLERANCE) {
  // For reconciliation, we often need to match opposite signs
  // Example: Bank shows -$340.97 (check paid), Internal shows $340.97 (disbursement)
  const abs1 = Math.abs(amount1);
  const abs2 = Math.abs(amount2);
  
  // Check if absolute values match within tolerance
  return Math.abs(abs1 - abs2) < tolerance;
}

function extractCheckNumber(transaction) {
  // For bank transactions, check 'Additional Reference' field
  if (transaction['Additional Reference']) {
    const bankRef = String(transaction['Additional Reference']).trim();
    if (bankRef && bankRef !== '' && bankRef !== 'null' && bankRef !== '0') {
      // Extract numeric part if mixed format
      const numMatch = bankRef.match(/\d+/);
      if (numMatch) {
        return numMatch[0];
      }
      return bankRef; // Return as-is if no numeric match
    }
  }
  
  // For our transactions, check 'Check Number' field
  if (transaction['Check Number']) {
    const ourCheckNum = String(transaction['Check Number']).trim();
    if (ourCheckNum && ourCheckNum !== '' && ourCheckNum !== 'null' && ourCheckNum !== '0') {
      // Extract numeric part if mixed format
      const numMatch = ourCheckNum.match(/\d+/);
      if (numMatch) {
        return numMatch[0];
      }
      return ourCheckNum; // Return as-is if no numeric match
    }
  }
  
  // Fallback: Check description for check numbers (e.g., "CHECK #1004")
  const description = String(transaction['Description'] || transaction['Description1'] || '');
  const checkInDesc = description.match(/(?:CHECK|CHK|#)\s*#?\s*(\d+)/i);
  if (checkInDesc) {
    return checkInDesc[1];
  }
  
  return null;
}

function isCheckTransaction(transaction) {
  // Check transaction type/description indicators
  const type = String(transaction['Type'] || transaction['Transaction Type'] || '').toLowerCase();
  const description = String(transaction['Description'] || transaction['Description1'] || '').toLowerCase();
  
  const checkIndicators = ['check', 'chk', 'check paid', 'disbursement'];
  
  return checkIndicators.some(indicator => 
    type.includes(indicator) || description.includes(indicator)
  );
}
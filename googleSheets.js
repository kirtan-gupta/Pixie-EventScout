const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

class GoogleSheetsService {
    constructor() {
        this.doc = null;
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            console.log('🔐 Initializing Google Sheets...');
            
            const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
            const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
            const sheetId = process.env.GOOGLE_SHEET_ID;
            
            if (!serviceAccountEmail || !privateKey || !sheetId) {
                throw new Error('Missing Google Sheets credentials in .env');
            }
            
            const serviceAccountAuth = new JWT({
                email: serviceAccountEmail,
                key: privateKey,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            
            this.doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
            await this.doc.loadInfo();
            console.log(`✅ Connected to: "${this.doc.title}"`);
            
            this.initialized = true;
        }
        return this.doc;
    }

    async getOrCreateSheet(city) {
        const doc = await this.initialize();
        let sheet = doc.sheetsByTitle[city];
        
        if (!sheet) {
            console.log(`📝 Creating new sheet: "${city}"`);
            sheet = await doc.addSheet({
                title: city,
                headerValues: [
                    'Event Name', 'Date', 'Venue', 'City', 
                    'Category', 'URL', 'Status', 'Scraped At', 'Unique ID'
                ]
            });
        }
        
        return sheet;
    }

    // NEW: Validate and clean event data before saving
    validateEventData(event) {
        const cleanedEvent = { ...event };
        
        // Clean each field
        cleanedEvent.name = this.cleanCellValue(event.name, 150);
        cleanedEvent.date = this.cleanCellValue(event.date, 50);
        cleanedEvent.venue = this.cleanCellValue(event.venue, 200);
        cleanedEvent.city = this.cleanCellValue(event.city, 50);
        cleanedEvent.category = this.cleanCellValue(event.category, 50);
        cleanedEvent.url = this.cleanCellValue(event.url, 500);
        cleanedEvent.status = this.cleanCellValue(event.status || 'Upcoming', 20);
        cleanedEvent.scrapedAt = this.cleanCellValue(event.scrapedAt, 50);
        
        return cleanedEvent;
    }

    cleanCellValue(value, maxLength = 50000) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        
        // Convert to string
        let strValue = String(value);
        
        // Remove problematic characters for Google Sheets
        strValue = strValue
            .replace(/[\n\t\r]/g, ' ')  // Remove newlines and tabs
            .replace(/\u0000/g, '')     // Remove null characters
            .replace(/[{}]/g, '')       // Remove curly braces
            .replace(/\s+/g, ' ')       // Collapse multiple spaces
            .trim();
        
        // Check if it's a JSON string that got through
        if (strValue.includes('string_value') || strValue.includes('list_value')) {
            // Try to extract actual string values
            try {
                // Remove JSON artifacts
                strValue = strValue
                    .replace(/"string_value":/g, '')
                    .replace(/list_value/g, '')
                    .replace(/values/g, '')
                    .replace(/[{}:\[\]]/g, '')
                    .replace(/,+/g, ',')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                // Remove duplicate parts
                const parts = strValue.split(',').map(p => p.trim()).filter(p => p);
                const uniqueParts = [...new Set(parts)];
                strValue = uniqueParts.join(', ');
            } catch (e) {
                console.log('Error cleaning JSON string:', e.message);
                strValue = 'Invalid Data';
            }
        }
        
        // Truncate if too long
        if (strValue.length > maxLength) {
            strValue = strValue.substring(0, maxLength - 3) + '...';
        }
        
        return strValue;
    }

    async saveToGoogleSheets(events, city) {
        try {
            const sheet = await this.getOrCreateSheet(city);
            await sheet.loadHeaderRow();
            
            const rows = await sheet.getRows();
            console.log(`📊 Found ${rows.length} existing events in ${city}`);
            
            const existingEvents = new Map();
            for (const row of rows) {
                const uniqueId = row.get('Unique ID') || this.generateUniqueIdFromRow(row);
                existingEvents.set(uniqueId, row);
            }
            
            let addedCount = 0;
            let updatedCount = 0;
            
            for (const event of events) {
                try {
                    // Validate and clean the event data
                    const cleanedEvent = this.validateEventData(event);
                    const uniqueId = this.generateUniqueId(cleanedEvent);
                    
                    if (existingEvents.has(uniqueId)) {
                        // Update existing
                        const row = existingEvents.get(uniqueId);
                        await this.updateEventRow(row, cleanedEvent);
                        updatedCount++;
                    } else {
                        // Add new - with error handling for each row
                        await this.addNewEventRow(sheet, cleanedEvent, uniqueId);
                        addedCount++;
                    }
                } catch (rowError) {
                    console.error(`Error processing event "${event.name}":`, rowError.message);
                    // Continue with next event
                    continue;
                }
            }
            
            const expiredCount = await this.markExpiredEvents(sheet);
            
            console.log(`✅ ${city}: ${addedCount} added, ${updatedCount} updated, ${expiredCount} expired`);
            
            return { added: addedCount, updated: updatedCount, expired: expiredCount };
            
        } catch (error) {
            console.error('❌ Error saving to Google Sheets:', error.message);
            
            // More detailed error logging
            if (error.errors) {
                error.errors.forEach((err, index) => {
                    console.error(`Error ${index + 1}:`, err.message);
                });
            }
            
            return { added: 0, updated: 0, expired: 0 };
        }
    }

    async addNewEventRow(sheet, event, uniqueId) {
        try {
            // Prepare row data
            const rowData = {
                'Event Name': event.name,
                'Date': event.date,
                'Venue': event.venue,
                'City': event.city,
                'Category': event.category,
                'URL': event.url,
                'Status': this.determineStatus(event.date),
                'Scraped At': event.scrapedAt,
                'Unique ID': uniqueId
            };
            
            // Add the row
            await sheet.addRow(rowData);
            
        } catch (error) {
            console.error('Error adding new row:', error.message);
            console.error('Problematic data:', JSON.stringify(event, null, 2));
            throw error;
        }
    }

    generateUniqueId(event) {
        return `${event.name}-${event.date}-${event.venue}`
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9\-]/g, '')
            .toLowerCase()
            .substring(0, 100);
    }

    generateUniqueIdFromRow(row) {
        return `${row.get('Event Name')}-${row.get('Date')}-${row.get('Venue')}`
            .replace(/\s+/g, '-')
            .toLowerCase();
    }

    determineStatus(dateString) {
        try {
            const eventDate = new Date(dateString);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            eventDate.setHours(0, 0, 0, 0);
            
            if (eventDate < today) return 'expired';
            if (eventDate.getTime() === today.getTime()) return 'today';
            return 'upcoming';
        } catch {
            return 'unknown';
        }
    }

    async updateEventRow(row, event) {
        try {
            row.set('Event Name', event.name);
            row.set('Date', event.date);
            row.set('Venue', event.venue);
            row.set('Category', event.category);
            row.set('URL', event.url);
            row.set('Status', this.determineStatus(event.date));
            row.set('Scraped At', event.scrapedAt);
            await row.save();
            return true;
        } catch (error) {
            console.error('Error updating row:', error.message);
            return false;
        }
    }

    async markExpiredEvents(sheet) {
        try {
            const rows = await sheet.getRows();
            const today = new Date().toISOString().split('T')[0];
            let expiredCount = 0;
            
            for (const row of rows) {
                const eventDate = row.get('Date');
                if (eventDate && eventDate < today && row.get('Status') !== 'expired') {
                    row.set('Status', 'expired');
                    await row.save();
                    expiredCount++;
                }
            }
            
            return expiredCount;
        } catch (error) {
            console.error('Error marking expired events:', error.message);
            return 0;
        }
    }

    async getEventsFromSheet(city) {
        try {
            await this.initialize();
            const doc = this.doc;
            let sheet = doc.sheetsByTitle[city];
            
            if (!sheet) {
                return [];
            }
            
            await sheet.loadHeaderRow();
            const rows = await sheet.getRows();
            
            return rows.map(row => ({
                name: row.get('Event Name') || 'Unknown',
                date: row.get('Date') || 'Unknown',
                venue: row.get('Venue') || 'Unknown',
                city: row.get('City') || city,
                category: row.get('Category') || 'General',
                url: row.get('URL') || '',
                status: row.get('Status') || 'unknown',
                scrapedAt: row.get('Scraped At') || ''
            }));
            
        } catch (error) {
            console.error('Error getting events:', error.message);
            return [];
        }
    }
}

module.exports = new GoogleSheetsService();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const scraper = require('./scraper.js');
const googleSheets = require('./googleSheets.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        cities: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune'] 
    });
});

app.post('/scrape', async (req, res) => {
    try {
        const { city, category } = req.body;
        console.log(`🔍 Scraping ${city} for ${category || 'all'} events...`);
        
        const events = await scraper.fetchEventsFromAPI(city, category || 'all');
        console.log(`📊 Found ${events.length} events for ${city}`);
        
        if (events.length > 0) {
            const result = await googleSheets.saveToGoogleSheets(events, city);
            
            if (result.added > 0 || result.updated > 0) {
                res.render('events', { 
                    events, 
                    city,
                    category: category || 'all',
                    message: `Successfully saved ${result.added} new events and updated ${result.updated} existing events for ${city}`
                });
            } else {
                res.render('events', { 
                    events, 
                    city,
                    category: category || 'all',
                    message: 'No new events to save (all events already exist)'
                });
            }
        } else {
            res.render('events', { 
                events: [], 
                city,
                category: category || 'all',
                message: `No events found for ${city}`
            });
        }
        
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).render('error', { 
            message: 'Error: ' + error.message 
        });
    }
});

app.get('/events/:city', async (req, res) => {
    try {
        const city = req.params.city;
        const category = req.query.category || 'all';
        
        console.log(`📋 Loading events for ${city}...`);
        let events = await googleSheets.getEventsFromSheet(city);
        
        if (events.length === 0) {
            console.log(`No events in sheet for ${city}, scraping fresh...`);
            events = await scraper.fetchEventsFromAPI(city, category);
            
            if (events.length > 0) {
                await googleSheets.saveToGoogleSheets(events, city);
            }
        }
        
        // Filter by category if specified
        if (category !== 'all') {
            events = events.filter(event => 
                event.category.toLowerCase().includes(category.toLowerCase())
            );
        }
        
        res.render('events', { 
            events, 
            city,
            category,
            message: events.length > 0 
                ? `Showing ${events.length} events in ${city}` 
                : `No events found for ${city}`
        });
        
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).render('error', { 
            message: 'Error: ' + error.message 
        });
    }
});

// API endpoint for AJAX requests
app.get('/api/events', async (req, res) => {
    try {
        const { city, category } = req.query;
        
        if (!city) {
            return res.status(400).json({ 
                success: false,
                error: 'City parameter is required' 
            });
        }
        
        const events = await scraper.fetchEventsFromAPI(city, category || 'all');
        
        res.json({
            success: true,
            city,
            category: category || 'all',
            count: events.length,
            events: events
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Schedule daily scraping at 2 AM
cron.schedule('0 2 * * *', async () => {
    console.log('🚀 Running scheduled scraping at', new Date().toLocaleString());
    const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad'];
    
    for (const city of cities) {
        try {
            console.log(`📊 Scraping events for ${city}...`);
            const events = await scraper.fetchEventsFromAPI(city, 'all');
            
            if (events.length > 0) {
                const result = await googleSheets.saveToGoogleSheets(events, city);
                if (result.added > 0 || result.updated > 0) {
                    console.log(`✅ Updated ${city}: ${result.added} added, ${result.updated} updated`);
                } else {
                    console.log(`ℹ️ No changes for ${city}`);
                }
            } else {
                console.log(`⚠️ No events found for ${city}`);
            }
            
            // Add delay between cities to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error(`❌ Error scraping ${city}:`, error.message);
        }
    }
    
    console.log('✅ Scheduled scraping completed');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'EventScout Scraper'
    });
});

// Dashboard route

// In server.js, update the dashboard route:
app.get('/dashboard', async (req, res) => {
    try {
        const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad'];
        const stats = [];
        
        for (const city of cities) {
            try {
                const events = await googleSheets.getEventsFromSheet(city);
                const upcoming = events.filter(e => 
                    e.status === 'upcoming' || e.status === 'today'
                );
                const expired = events.filter(e => e.status === 'expired');
                
                stats.push({
                    city,
                    totalEvents: events.length,
                    upcomingEvents: upcoming.length,
                    expiredEvents: expired.length,
                    lastUpdated: events.length > 0 && events[0].scrapedAt 
                        ? new Date(events[0].scrapedAt).toLocaleDateString() 
                        : 'Never'
                });
            } catch (cityError) {
                console.error(`Error loading stats for ${city}:`, cityError.message);
                stats.push({
                    city,
                    totalEvents: 0,
                    upcomingEvents: 0,
                    expiredEvents: 0,
                    lastUpdated: 'Error'
                });
            }
        }
        
        // Calculate totals
        const totals = {
            totalEvents: stats.reduce((sum, stat) => sum + stat.totalEvents, 0),
            totalUpcoming: stats.reduce((sum, stat) => sum + stat.upcomingEvents, 0),
            totalExpired: stats.reduce((sum, stat) => sum + stat.expiredEvents, 0)
        };
        
        res.render('dashboard', { 
            stats: stats,
            totals: totals,
            lastChecked: new Date().toLocaleString()
        });
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render('error', { 
            message: 'Error loading dashboard: ' + error.message 
        });
    }
});
// app.get('/dashboard', async (req, res) => {
//     try {
//         const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad'];
//         const stats = [];
        
//         for (const city of cities) {
//             const events = await googleSheets.getEventsFromSheet(city);
//             const upcoming = events.filter(e => e.status === 'upcoming' || e.status === 'today');
            
//             stats.push({
//                 city,
//                 totalEvents: events.length,
//                 upcomingEvents: upcoming.length,
//                 lastUpdated: events.length > 0 
//                     ? new Date(events[0].scrapedAt).toLocaleDateString() 
//                     : 'Never'
//             });
//         }
        
//         res.render('dashboard', { 
//             stats,
//             lastChecked: new Date().toLocaleString()
//         });
        
//     } catch (error) {
//         console.error('Error loading dashboard:', error);
//         res.status(500).render('error', { 
//             message: 'Error loading dashboard: ' + error.message 
//         });
//     }
// });

// Test route for debugging
app.get('/test/:city', async (req, res) => {
    try {
        const city = req.params.city;
        const events = await scraper.fetchEventsFromAPI(city, 'all');
        
        res.json({
            city,
            count: events.length,
            sampleVenues: events.slice(0, 5).map(e => ({
                name: e.name,
                venue: e.venue,
                venueLength: e.venue.length
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).render('error', { 
        message: err.message || 'Internal Server Error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        message: 'Page not found' 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`🏙️ Available cities: Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Kolkata, Pune`);
    console.log(`🔍 Test endpoint: http://localhost:${PORT}/test/Mumbai`);
});
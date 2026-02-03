// scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

class EventScraper {
    constructor() {
        this.events = [];
        this.SERP_API_KEY = process.env.SERP_API_KEY || 'ca4af42f91ff907f59cef084f055a42c77703b2611f54c2007a17d36e32c2554';
        this.SERP_API_URL = 'https://serpapi.com/search';
    }

    async fetchEventsFromAPI(city = 'Bangalore', category = 'all') {
        try {
            console.log(`Fetching events for ${city}, category: ${category}`);
            
            // Use SERP API to search for events
            const events = await this.searchEventsWithSerpApi(city, category);
            
            if (events.length === 0) {
                console.log('No events found via SERP API, trying alternative methods...');
                return await this.scrapeEventsFromWebsites(city, category);
            }
            
            console.log(`Found ${events.length} events via SERP API`);
            return events;
            
        } catch (error) {
            console.error('Error fetching events from API:', error.message);
            // Fallback to web scraping if API fails
            return await this.scrapeEventsFromWebsites(city, category);
        }
    }

    async searchEventsWithSerpApi(city, category) {
        try {
            const query = category === 'all' 
                ? `events in ${city}`
                : `${category} events in ${city}`;
            
            const params = {
                engine: 'google_events',
                q: query,
                hl: 'en',
                api_key: this.SERP_API_KEY
            };
            
            console.log(`Searching SERP API for: ${query}`);
            
            const response = await axios.get(this.SERP_API_URL, { params });
            
            if (!response.data || !response.data.events_results) {
                console.log('No events found in SERP API response');
                return [];
            }
            
            // Process SERP API events
            const serpEvents = response.data.events_results;
            const processedEvents = [];
            
            for (const event of serpEvents) {
                try {
                    // FIX: Properly handle venue data
                    const venue = this.extractVenueFromSerpData(event);
                    
                    const processedEvent = {
                        name: this.cleanString(event.title || 'Unknown Event', 150),
                        date: this.formatEventDate(event),
                        venue: venue,  // Use the cleaned venue
                        city: city,
                        category: category || this.extractCategory(event),
                        url: event.link || event.ticket_info?.link || '#',
                        status: 'Upcoming',
                        scrapedAt: new Date().toISOString(),
                        description: this.cleanString(event.description || '', 200),
                        price: event.ticket_info?.price || 'Free',
                        image: event.image || ''
                    };
                    
                    processedEvents.push(processedEvent);
                } catch (e) {
                    console.log(`Error processing event: ${e.message}`);
                    continue;
                }
            }
            
            return processedEvents;
            
        } catch (error) {
            console.error('SERP API Error:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
            }
            return [];
        }
    }

    // NEW METHOD: Extract and clean venue from SERP data
    extractVenueFromSerpData(event) {
        try {
            let venue = 'Unknown Venue';
            
            // Case 1: Event has address as string
            if (typeof event.address === 'string') {
                venue = event.address;
            }
            // Case 2: Event has address as array
            else if (Array.isArray(event.address)) {
                // Filter out duplicates and join
                const uniqueParts = [...new Set(event.address.filter(part => 
                    part && typeof part === 'string' && part.trim()
                ))];
                venue = uniqueParts.join(', ');
            }
            // Case 3: Event has venue object
            else if (event.venue && typeof event.venue === 'object') {
                if (typeof event.venue.name === 'string') {
                    venue = event.venue.name;
                } else if (typeof event.venue.address === 'string') {
                    venue = event.venue.address;
                }
            }
            // Case 4: Event has address as object with values array (your error case)
            else if (event.address && typeof event.address === 'object' && event.address.values) {
                if (Array.isArray(event.address.values)) {
                    const venueParts = event.address.values
                        .filter(value => value && value.string_value)
                        .map(value => value.string_value)
                        .filter(value => value && typeof value === 'string' && value.trim());
                    
                    // Remove duplicates and join
                    const uniqueParts = [...new Set(venueParts)];
                    venue = uniqueParts.join(', ');
                }
            }
            
            // Clean up the venue string
            return this.cleanVenueString(venue);
            
        } catch (error) {
            console.log('Error extracting venue:', error.message);
            return 'Unknown Venue';
        }
    }

    // NEW METHOD: Clean venue string
    cleanVenueString(str) {
        if (!str || str === 'Unknown Venue') return 'Unknown Venue';
        
        // Ensure it's a string
        str = String(str);
        
        // Remove JSON artifacts
        str = str.replace(/"string_value":/g, '')
                .replace(/[{}]/g, '')
                .replace(/values\s*:/g, '')
                .replace(/list_value/g, '');
        
        // Remove duplicate lines
        const lines = str.split(/\n/).filter(line => line.trim());
        const uniqueLines = [...new Set(lines)];
        str = uniqueLines.join(', ');
        
        // Remove extra commas and spaces
        str = str.replace(/,+/g, ',')
                .replace(/\s+/g, ' ')
                .trim();
        
        // Remove trailing comma
        if (str.endsWith(',')) {
            str = str.slice(0, -1);
        }
        
        // Split by commas and take only first 2 parts if too long
        const parts = str.split(',');
        if (parts.length > 3) {
            str = parts.slice(0, 3).join(', ');
        }
        
        // Truncate if still too long
        if (str.length > 200) {
            str = str.substring(0, 197) + '...';
        }
        
        return str || 'Unknown Venue';
    }

    // NEW METHOD: Clean any string
    cleanString(str, maxLength = 500) {
        if (!str) return '';
        
        str = String(str)
            .replace(/[\n\t\r]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (str.length > maxLength) {
            str = str.substring(0, maxLength - 3) + '...';
        }
        
        return str;
    }

    formatEventDate(event) {
        try {
            if (event.date && event.date.start_date) {
                return event.date.start_date;
            }
            
            if (event.date && event.date.when) {
                return event.date.when;
            }
            
            return new Date().toISOString().split('T')[0];
            
        } catch (e) {
            return new Date().toISOString().split('T')[0];
        }
    }

    extractCategory(event) {
        if (event.category) return this.cleanString(event.category, 50);
        
        const title = (event.title || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        
        const categories = {
            'Technology': ['tech', 'technology', 'programming', 'coding', 'software', 'ai', 'machine learning', 'data science'],
            'Music': ['music', 'concert', 'festival', 'band', 'dj', 'live music', 'performance'],
            'Art': ['art', 'exhibition', 'gallery', 'painting', 'sculpture', 'photography'],
            'Sports': ['sports', 'game', 'match', 'tournament', 'fitness', 'yoga', 'gym', 'marathon'],
            'Food': ['food', 'restaurant', 'cooking', 'wine', 'beer', 'tasting', 'culinary'],
            'Business': ['business', 'networking', 'conference', 'workshop', 'seminar', 'startup', 'entrepreneur'],
            'Education': ['education', 'workshop', 'course', 'training', 'lecture', 'webinar']
        };
        
        for (const [category, keywords] of Object.entries(categories)) {
            for (const keyword of keywords) {
                if (title.includes(keyword) || description.includes(keyword)) {
                    return category;
                }
            }
        }
        
        return 'General';
    }

    async scrapeEventsFromWebsites(city, category) {
        try {
            const allEvents = [];
            
            // Scrape from Eventbrite
            const eventbriteEvents = await this.scrapeEventbrite(city, category);
            allEvents.push(...eventbriteEvents);
            
            // Scrape from Meetup
            const meetupEvents = await this.scrapeMeetup(city, category);
            allEvents.push(...meetupEvents);
            
            console.log(`Scraped ${allEvents.length} events from websites`);
            return allEvents;
            
        } catch (error) {
            console.error('Error scraping from websites:', error.message);
            return [];
        }
    }

    async scrapeEventbrite(city, category) {
        try {
            const url = `https://www.eventbrite.com/d/india--${city.toLowerCase()}/${category}/`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            const events = [];
            
            $('.search-event-card-wrapper').each((i, element) => {
                try {
                    const event = {
                        name: this.cleanString($(element).find('.eds-event-card__formatted-name--is-clamped').text().trim() || 
                               $(element).find('h2').text().trim(), 150),
                        date: this.cleanString($(element).find('.eds-event-card-content__sub-title').text().trim(), 50),
                        venue: this.cleanString($(element).find('.card-text--truncated__one').text().trim(), 200),
                        city: city,
                        category: category || 'General',
                        url: $(element).find('a').attr('href') || '#',
                        status: 'Upcoming',
                        scrapedAt: new Date().toISOString()
                    };
                    
                    if (event.name && event.name !== '') {
                        events.push(event);
                    }
                } catch (e) {
                    console.log(`Error parsing Eventbrite event: ${e.message}`);
                }
            });
            
            return events;
            
        } catch (error) {
            console.error(`Error scraping Eventbrite:`, error.message);
            return [];
        }
    }

    async scrapeMeetup(city, category) {
        try {
            const url = `https://www.meetup.com/find/?location=in--${city}&keywords=${category}`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            const events = [];
            
            $('[data-event-label]').each((i, element) => {
                try {
                    const event = {
                        name: this.cleanString($(element).find('h3').text().trim(), 150),
                        date: this.cleanString($(element).find('time').attr('datetime') || 
                              $(element).find('time').text().trim(), 50),
                        venue: this.cleanString($(element).find('.text-gray-7').text().trim(), 200),
                        city: city,
                        category: category || 'General',
                        url: $(element).find('a').attr('href') || '#',
                        status: 'Upcoming',
                        scrapedAt: new Date().toISOString()
                    };
                    
                    if (event.name && event.name !== '') {
                        events.push(event);
                    }
                } catch (e) {
                    console.log(`Error parsing Meetup event: ${e.message}`);
                }
            });
            
            return events;
            
        } catch (error) {
            console.error(`Error scraping Meetup:`, error.message);
            return [];
        }
    }
}

// Create an instance and export it
const scraper = new EventScraper();
module.exports = scraper;

# 🦊 Pixie-EventScout

**An intelligent event discovery platform that scrapes real-time event data using the SERP API (Google Events), stores it in Google Sheets, and displays it on an interactive web dashboard.**

---

## ✨ Features

- **SERP API Integration**: Fetches real-time event data from Google Events via SERP API  
- **Google Sheets Database**: Automatically logs discovered events to Google Sheets  
- **Interactive Dashboard**: Clean web interface to view and analyze scraped events  
- **Future-Proof Architecture**: Designed for easy expansion (planned: city search input)  
- **Event Discovery**: Extracts name, date, venue, city, and event URL  

---

## 📁 Project Structure

```

Pixie-EventScout/
├── .env                         # Environment variables (ignored by git)
├── .gitignore
├── package.json
├── server.js                    # Express application entry point
├── scraper/
│   └── serpScraper.js           # SERP API (Google Events) integration
├── services/
│   └── googleSheets.js          # Google Sheets operations
├── public/
│   └── style.css                # Front-end styles
├── views/
│   ├── index.ejs                # Landing page
│   ├── dashboard.ejs            # Events dashboard
│   ├── events.ejs               # Events listing page
│   └── error.ejs                # Error handling page
└── README.md

````

---

## 🚀 Quick Setup Guide

### **Step 1: Clone Repository**
```bash
git clone <your-repository-url>
cd Pixie-EventScout
````

---

### **Step 2: Install Dependencies**

```bash
npm install
```

---

### **Step 3: Configure Environment Variables**

Create a `.env` file in the root directory:

```env
PORT=3000
SERP_API_KEY=your_serp_api_key
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY="your_private_key"
```

> ⚠️ **Never commit `.env` or credentials.json to GitHub**

---

### **Step 4: Set Up Google Sheets Access**

1. Create a Google Sheet
2. Add header row:

```
Event Name | Date | Venue | City | URL | Scraped At
```

3. Share the sheet with your **Google Service Account Email** (Editor access)

---

### **Step 5: Run Application**

```bash
# Development
npm run dev

# Production
npm start
```

---

### **Step 6: Access Dashboard**

```
http://localhost:3000/dashboard
```

---

## 🔧 API Integration Details

### **SERP API – Google Events Scraping**

The application uses **SERP API** to fetch event data from **Google Events**.

`scraper/serpScraper.js` handles:

* SERP API request with location parameters
* Parsing Google Events results
* Extracting structured event data

```js
const SERP_API_KEY = process.env.SERP_API_KEY;
const API_ENDPOINT = 'https://serpapi.com/search';
```

---

## 📊 How It Works

1. User initiates event search
2. Server sends request to SERP API
3. Event data is parsed and cleaned
4. Events are appended to Google Sheets
5. Dashboard displays updated events

---

## 🛣️ Development Roadmap

### **Planned Features**

* City free-text search input
* Date & category filtering
* Email notifications for new events
* Multiple event data sources
* Scheduled scraping using cron jobs

```js
// Planned enhancement
app.post('/search-events', async (req, res) => {
  const { city, date, category } = req.body;
  // Fetch events dynamically based on input
});
```

---

## ⚠️ Security & Privacy

* `.env` and credentials are ignored via `.gitignore`
* API keys are stored using environment variables
* Google Sheet permissions limited to editor access
* Keys should be rotated regularly

---

## 🐛 Troubleshooting

| Issue                          | Solution                             |
| ------------------------------ | ------------------------------------ |
| Google Sheets permission error | Verify service account access        |
| SERP API rate limit            | Check API quota                      |
| Port already in use            | Change PORT or stop existing process |
| Private key format error       | Ensure `\n` newlines are preserved   |

---

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push branch
5. Open Pull Request

---

## 📄 License

MIT License

---

**Built with ❤️ as part of the Pixie Full Stack Developer Intern Assignment**

```

---
```



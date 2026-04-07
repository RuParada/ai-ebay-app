# AntikHalleKI (AI eBay App)

A Node.js application that accepts photos of items and automatically generates structured eBay listings (descriptions, titles, conditions) using the **OpenAI API**, and publishes them directly to eBay as scheduled drafts/auctions via the **eBay Inventory API**.

## Features

- **AI-Powered Generation**: Generates full German-language descriptions, titles, and condition assessments based on product photos.
- **eBay Integration**: Automates the creation of eBay listings as scheduled auctions.
- **Secure Access**: Passcode-protected interface.
- **Modern UI**: Clean, mobile-responsive web interface to easily upload multiple photos.

## Requirements

- Node.js 18+
- OpenAI API Key
- eBay Developer Account Credentials (Client ID, Client Secret, RuName)
- Railway (or similar) for deployment (optional)

## Installation

1. Clone the repository and install dependencies for the backend:

```bash
cd backend
npm install
```

2. Inside the `/backend` directory, create a `.env` file and specify the required environment variables:

```
# OpenAI
OPENAI_API_KEY=sk-...

# eBay API
EBAY_APP_ID=your_client_id
EBAY_CERT_ID=your_client_secret
EBAY_RU_NAME=your_ru_name
EBAY_ENVIRONMENT=PRODUCTION  # or SANDBOX

# App Security
APP_PASSCODE=your_secret_passcode
```

## Usage

### Running Locally

```bash
cd backend
node server.js
```

Or if you have a dev script configured:
```bash
npm run dev
```

The server will start on port 3000 (or the port defined in your environment). Access the web interface by navigating to `http://localhost:3000` in your browser.

## Project Structure

| Directory/File               | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `backend/server.js`          | Main Express.js application and API routes   |
| `backend/openaiService.js`   | OpenAI API integration for image processing  |
| `backend/ebayService.js`     | eBay API requests and inventory management   |
| `backend/public/`            | Frontend static assets (HTML/CSS/JS)         |
| `backend/package.json`       | Node.js dependencies and scripts             |

## Cost Estimate (Reference)

Using `gpt-4o`, a typical request costs approximately **~$0.003** to **~$0.01** per photo, depending on image resolution and response length.

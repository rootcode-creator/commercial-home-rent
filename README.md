## Install methods

# commercial-home-rent — README

![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)
![status](https://img.shields.io/badge/status-development-yellow?style=flat-square)

Modern, compact README tailored to the Express + EJS property-listing code in this repository. Items marked [VERIFY] come from the source and should be confirmed before production use.


## Table of contents

- [Project intro](#project-intro)
- [Project structure](#project-structure)
- [Differentiators](#differentiators)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Install methods](#install-methods)
    - [From source (recommended)](#from-source-recommended)
    - [npm / Node](#npm--node)
    
- [Quick start](#quick-start)
- [Format selection & upload syntax](#format-selection--upload-syntax)

- [JSON metadata example](#json-metadata-example)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)



## 🚀 Project intro

`commercial-home-rent` is a compact Express application that implements listings, reviews, and user authentication. It is intended as a learning or MVP foundation for property listing and renting functionality. The application uses server-side templates (EJS) and stores data in MongoDB.



## 📁 Project Structure

```
wanderlust-ecommerce-app/
├── models/            # Mongoose models
├── routes/            # Express route handlers
├── views/             # EJS templates
├── public/            # Static assets (CSS, JS, images)
├── controllers/       # Controller logic
├── app.js             # Main application entry point
├── .env               # Environment variables
├── README.md
└── ...
```

Key routes (based on `app.js`):

- `/` — user routes (signup/login) handled by `routes/user.js`
- `/listings` — listing routes handled by `routes/listing.js`
- `/listings/:id/reviews` — reviews handled by `routes/review.js`


## Differentiators

- Clear MVC-like separation (models/controllers/routes) in a small codebase.
- `passport-local-mongoose` simplifies user model and authentication.
- Joi validation in `schema.js` provides central request validation.
- Cloudinary integration for image storage (optional).


## 🔧 Features

- Local user registration/login (Passport Local)
- CRUD operations for listings
- Create/delete reviews tied to listings
- Session storage in MongoDB via `connect-mongo`
- Flash messages and centralized error handling


## 🧰 Tech stack

- Node.js (see `package.json`. `engines` field contains Node 23.5.0 — prefer an LTS version in production) [VERIFY]
- Express
- EJS + ejs-mate
- MongoDB + Mongoose
- Passport.js + passport-local-mongoose
- Joi for validation
- Cloudinary + multer-storage-cloudinary for image uploads






## ⚙️ Install methods

This is a Node.js application. Pip/pipx are not applicable.

### ▶ From source (recommended)

```powershell
git clone <repo-url> commercial-home-rent
cd commercial-home-rent
npm install
node app.js
# for development with auto-reload
npx nodemon app.js
```

### 📦 npm / Node

Install via `npm install` and start with `node app.js`. Note: `package.json` contains other scripts (Vite) but the server runs from `app.js`.

### 🐳 Docker

Example Dockerfile:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "app.js"]
```

Build and run:

```powershell
docker build -t commercial-home-rent:latest .
docker run -p 8080:8080 -e ATLASDB_URL="..." -e SECRET="..." commercial-home-rent:latest
```





Create a `.env` at the project root with these variables (example):

```properties
ATLASDB_URL=mongodb+srv://<user>:<pass>@cluster.example.mongodb.net/dbname
SECRET=some-session-secret
CLOUD_NAME=...
CLOUD_API_KEY=...
CLOUD_API_SECRET=...
MAP_TOKEN=... # optional
```

Install and run:

```powershell
npm install
node app.js
# open http://localhost:8080
```

Note: `app.js` loads `.env` automatically when NODE_ENV != "production".


## 🗂 Format selection & upload syntax

- `schema.js` defines the expected request payload shapes for listings and reviews. Use it for JSON imports or form design.
- `cloudConfig.js` contains Cloudinary params; the source includes a probable typo `allowerdFormats` — correct to `allowedFormats` if you depend on that option. [VERIFY]

Listing Joi validation fields (from `schema.js`):

- `listing.title` (string, required)
- `listing.description` (string, required)
- `listing.location` (string, required)
- `listing.country` (string, required)
- `listing.price` (number >= 0, required)
- `listing.image` (string | null)

Review fields:

- `review.rating` (number 1..5)
- `review.comment` (string)



Mermaid flow (rendered on platforms that support Mermaid):

```mermaid
flowchart TD
        A[Client Browser] --> B[POST /listings]
        B --> C[Middleware (body parser, methodOverride)]
        C --> D[Joi validation (schema.js)]
        D --> E{Auth required?}
        E -->|yes| F[isLoggedIn middleware]
        F --> G[Controller: listing.create]
        E -->|no| G
        G --> H[Multer -> Cloudinary (optional)]
        H --> I[Mongoose save]
        I --> J[MongoDB Atlas]
        J --> K[EJS render / redirect]
```


## 🧾 JSON metadata example

```json
{
        "listing": {
                "title": "Downtown Retail Space",
                "description": "1300 sqft, street-facing, high foot traffic",
                "location": "123 Main St, Anytown",
                "country": "USA",
                "price": 3500,
                "image": "https://res.cloudinary.com/yourcloud/image/upload/v12345/your-image.jpg"
        }
}
```


## 🤝 Contributing

- Fork the repo, create a branch, open a PR.
- Keep PRs small and include verification steps.
- Never commit secrets; use `.env` for local configuration.



## 📜 License

MIT — add a `LICENSE` file to make this explicit.





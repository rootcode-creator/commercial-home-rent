# 🛒 Wanderlust Ecommerce App

An e-commerce web application for listing and renting properties, developed and maintained by [rootcode-creator](https://github.com/rootcode-creator). Inspired by Airbnb, built with Express and modern web technologies.

---

## 🌟 Overview

Wanderlust enables users to list, browse, and rent commercial or residential properties online. The platform features property management, secure authentication, and a seamless booking process—all through an intuitive web interface.

---

## 🛠️ Tech Stack

- **Languages:** JavaScript, HTML5, CSS3
- **Backend:** Express.js (Node.js)
- **Frontend:** Bootstrap, EJS (Embedded JavaScript)
- **Database:** MongoDB

---

## 🧩 Features

- **Property Listings:** Add, view, and manage property entries
- **User Authentication:** Secure sign-up, login, and role-based access
- **Booking System:** Rent properties and manage booking status
- **Admin Dashboard:** Oversee users, properties, and transactions
- **Responsive Design:** Mobile-friendly UI with Bootstrap
- **Search & Filter:** Find properties by location, type, and availability

---

## 🚀 Getting Started

1. **Clone the repository:**
    ```bash
    git clone https://github.com/rootcode-creator/wanderlust-ecommerce-app.git
    cd wanderlust-ecommerce-app
    ```
2. **Install dependencies:**
    ```bash
    npm install
    ```
3. **Set up the database:**
    - Ensure MongoDB is running locally or provide a remote URI.
    - Update database credentials in the environment/config file.

4. **Configure environment variables:**
    - Create a `.env` file for sensitive credentials (DB URI, session secret, etc.).

5. **Run the application:**
    ```bash
    npm start
    ```
    - Access the web interface from your browser at [localhost:3000](http://localhost:3000).

---

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

---

## 🤝 Contributing

Pull requests, issues, and suggestions are welcome!

1. Fork the repo
2. Create your feature branch
3. Commit your changes
4. Open a PR

---

## 📄 License

MIT License

---

**Maintainer:** [rootcode-creator](https://github.com/rootcode-creator)

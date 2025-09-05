# Billing App

This is a comprehensive billing application built with Next.js, Radix UI, and Tailwind CSS. It provides a complete solution for managing bills, products, stores, and users. The application is designed to be a cross-platform desktop application using Tauri.

## Features

- **Dashboard:** A comprehensive overview of the application's data, including analytics, billing, products, stores, and users.
- **Billing:** A dedicated section for managing bills, including creating, viewing, and updating bills.
- **Product Management:** A complete solution for managing products, including adding, editing, and deleting products.
- **Store Management:** A feature for managing stores, including adding, editing, and deleting stores.
- **User Management:** A system for managing users, including adding, editing, and deleting users.
- **Authentication:** A secure authentication system with login and password hashing.
- **API:** A complete API for managing the application's data, including endpoints for bills, products, stores, and users.
- **Database:** A MySQL database for storing the application's data, with a comprehensive schema for managing the data.
- **Cross-Platform:** A cross-platform desktop application built with Tauri, which allows it to run on Windows, macOS, and Linux.

## Technologies Used

- **Next.js:** A React framework for building server-side rendered and statically generated web applications.
- **Radix UI:** A set of low-level UI components for building accessible and customizable design systems.
- **Tailwind CSS:** A utility-first CSS framework for rapidly building custom user interfaces.
- **Tauri:** A framework for building cross-platform desktop applications with web technologies.
- **MySQL:** A relational database management system for storing the application's data.
- **TypeScript:** A typed superset of JavaScript that compiles to plain JavaScript.
- **ESLint:** A pluggable and configurable linter tool for identifying and reporting on patterns in JavaScript.
- **Zod:** A TypeScript-first schema declaration and validation library.

## Getting Started

To get started with the application, you'll need to have Node.js, npm, and MySQL installed on your system.

1. **Clone the repository:**

```bash
git clone https://github.com/your-username/billing-app.git
```

2. **Install the dependencies:**

```bash
npm install
```

3. **Set up the database:**

- Create a MySQL database for the application.
- Update the database connection details in the `.env` file.

4. **Run the application:**

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## API Endpoints

The application provides a complete API for managing the application's data. The following are the available endpoints:

- `GET /api/bills`: Get all bills.
- `POST /api/bills`: Create a new bill.
- `GET /api/products`: Get all products.
- `POST /api/products`: Create a new product.
- `GET /api/products/:id`: Get a product by ID.
- `PUT /api/products/:id`: Update a product by ID.
- `DELETE /api/products/:id`: Delete a product by ID.
- `GET /api/stores`: Get all stores.
- `POST /api/stores`: Create a new store.
- `GET /api/stores/:id`: Get a store by ID.
- `PUT /api/stores/:id`: Update a store by ID.
- `DELETE /api/stores/:id`: Delete a store by ID.
- `GET /api/users`: Get all users.
- `POST /api/users`: Create a new user.
- `GET /api/users/:id`: Get a user by ID.
- `PUT /api/users/:id`: Update a user by ID.
- `DELETE /api/users/:id`: Delete a user by ID.
- `POST /api/auth/login`: Log in a user.

## Database Schema

The application uses a MySQL database with the following schema:

- **bills:**
  - `id`: INT (Primary Key)
  - `amount`: DECIMAL
  - `date`: DATETIME
  - `store_id`: INT (Foreign Key)
  - `user_id`: INT (Foreign Key)
- **products:**
  - `id`: INT (Primary Key)
  - `name`: VARCHAR
  - `price`: DECIMAL
- **stores:**
  - `id`: INT (Primary Key)
  - `name`: VARCHAR
- **users:**
  - `id`: INT (Primary Key)
  - `name`: VARCHAR
  - `email`: VARCHAR
  - `password`: VARCHAR

This `README.md` provides a comprehensive overview of the application, its features, and how to get started. It also includes details on the API endpoints and the database schema, which will be useful for developers working on the application.

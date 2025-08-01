# Billing App

This is a comprehensive billing application built with Next.js, TypeScript, and Tailwind CSS for the frontend, and Rust with Tauri for the backend. It provides a complete solution for managing billing, products, users, and stores, with a feature-rich dashboard for analytics and administration.

## Features

- **Dashboard:** An intuitive dashboard to get an overview of the billing, sales, and user activity.
- **Billing Management:** Create, view, and manage bills with ease.
- **Product Management:** Add, edit, and remove products from your inventory.
- **User Management:** Manage user accounts and permissions.
- **Store Management:** Handle multiple stores from a single interface.
- **Authentication:** Secure user authentication and session management.
- **Database Support:** Uses MySQL for robust data storage.

## Technologies Used

- **Frontend:**
  - [Next.js](https://nextjs.org/) - React framework for production
  - [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript for robust applications
  - [Tailwind CSS](https://tailwindcss.com/) - A utility-first CSS framework
  - [Shadcn/ui](https://ui.shadcn.com/) - Re-usable components built using Radix UI and Tailwind CSS.

- **Backend:**
  - [Tauri](https://tauri.app/) - Build smaller, faster, and more secure desktop applications with a web frontend
  - [Rust](https://www.rust-lang.org/) - A language empowering everyone to build reliable and efficient software.

- **Database:**
  - [MySQL](https://www.mysql.com/) - A popular open-source relational database.

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- Node.js (v18 or later)
- pnpm
- Rust
- MySQL

### Installation

1. **Clone the repo**
   ```sh
   git clone https://github.com/mahiprime2001/billing-app.git
   ```
2. **Install NPM packages**
   ```sh
   pnpm install
   ```
3. **Set up environment variables**
   - Create a `.env` file in the root directory.
   - Add the necessary environment variables for the database connection and other settings. You can use `.env.example` as a reference.

4. **Run the development server**
   ```sh
   pnpm dev
   ```

## Project Structure

The project is organized as follows:

- `app/`: Contains the Next.js application pages and API routes.
- `components/`: Shared React components used throughout the application.
- `hooks/`: Custom React hooks.
- `lib/`: Utility functions and libraries.
- `public/`: Static assets like images and fonts.
- `scripts/`: Node.js scripts for various tasks like database migrations.
- `src-tauri/`: The Rust backend source code for the Tauri application.
- `styles/`: Global CSS styles.

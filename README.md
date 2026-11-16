# Texting App Server

A Node.js backend for a mobile-first messaging platform with real-time communication, user management, contact syncing, media uploads, and group-based workflows.

This project powers the server-side APIs behind a texting application, handling authentication, chat messaging, notifications, media storage, and assignment-related collaboration features.

## Features

- Phone-based registration and login flow
- OTP verification with JWT authentication
- User lookup, profile management, and username validation
- Contact management and searchable user directory
- One-to-one chat and message retrieval
- Group chat creation and member management
- Assignment creation and submission flows for group contexts
- Push-like notifications and reminder scheduling
- Media upload support with Cloudinary
- Real-time updates through Socket.IO
- Oracle database integration for persistent storage

## Tech Stack

- Node.js
- JavaScript (ES Modules)
- Oracle DB
- Socket.IO
- JWT + bcrypt
- Cloudinary
- Firebase Admin
- Custom HTTP server architecture (no Express dependency)

## Project Structure

```text
texting-app-server/
├── src/
│   ├── app.js
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── socket/
│   └── utils/
├── schema.sql
├── package.json
├── package-lock.json
├── test-socket.js
├── .gitignore
└── README.md
```

## API Overview

The server exposes endpoints under the `/api` namespace, including:

- `/api/auth/*` for registration, login, OTP, and validation
- `/api/user*` and `/api/users*` for user-related operations
- `/api/contacts*` for managing contacts
- `/api/chats*` for chat conversations
- `/api/messages*` for sending and retrieving messages
- `/api/groups*` and `/api/assignments*` for group and assignment workflows
- `/api/notifications*` for notifications
- `/api/media*` for uploads and media handling
- `/api/search*` for search and lookups

## Environment Variables

Set the following environment variables before running the server:

```bash
PORT=5000
NODE_ENV=development
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_CONNECT_STRING=your_oracle_connect_string
JWT_SECRET=your_jwt_secret
BULKSMSBD_API_KEY=your_sms_api_key
BULKSMSBD_SENDER_ID=your_sms_sender_id
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure the required environment variables.

3. Start the development server:

```bash
npm run dev
```

4. Production mode:

```bash
npm start
```

## Scripts

- `npm run dev` — runs the server with nodemon for live reloads
- `npm start` — starts the server in normal mode

## Notes

This repository is structured as a backend service for a messaging application and is designed to work with a client/mobile app that consumes the REST and Socket.IO APIs.

The server includes both database-driven business logic and real-time communication channels, making it suitable for production-ready messaging workflows with authentication, media, and collaboration features.

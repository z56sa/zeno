# Use an official Node runtime as the base image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and lock files first to leverage Docker's caching layer
COPY package*.json ./

# Install build dependencies for native modules (better-sqlite3, etc.)
RUN apk add --no-cache python3 make g++ gcc libc6-compat

# Install all necessary dependencies for production
RUN npm install --omit=dev

# Copy the rest of the application source code
COPY . .

# Expose the port the bot will run on (standard practice, even if not used by node.js directly)
EXPOSE 3000

# Define the command to run when the container starts up
CMD [ "node", "src/index.js" ]
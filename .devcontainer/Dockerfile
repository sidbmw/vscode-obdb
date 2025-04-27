FROM mcr.microsoft.com/devcontainers/javascript-node:18

# Install additional global npm packages if needed
RUN npm install -g typescript@latest @vscode/vsce yo generator-code

# [Optional] Uncomment if you want to install more global packages
# RUN npm install -g <your-package-list>

# Set up permissions for node user
USER node
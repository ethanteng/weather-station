#!/bin/bash
set -e

echo "=== Weather Station Ubuntu Setup Script ==="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "Please do not run as root. Run as your regular user."
   exit 1
fi

# Update package list
echo "1. Updating package list..."
sudo apt update

# Install git if not installed
if ! command -v git &> /dev/null; then
    echo "2. Installing git..."
    sudo apt install -y git
else
    echo "2. Git already installed: $(git --version)"
fi

# Install Node.js (using NodeSource repository for latest LTS)
if ! command -v node &> /dev/null; then
    echo "3. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "3. Node.js already installed: $(node --version)"
fi

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo "4. Installing Docker..."
    sudo apt install -y ca-certificates curl gnupg lsb-release
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add user to docker group (requires logout/login)
    sudo usermod -aG docker $USER
    echo "   Note: You may need to log out and back in for docker group to take effect"
else
    echo "4. Docker already installed: $(docker --version)"
fi

# Install docker-compose (standalone) if docker-compose plugin not available
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "5. Installing docker-compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    echo "5. Docker Compose already available"
fi

echo ""
echo "=== Installation Summary ==="
echo "Git: $(git --version 2>/dev/null || echo 'Not installed')"
echo "Node.js: $(node --version 2>/dev/null || echo 'Not installed')"
echo "npm: $(npm --version 2>/dev/null || echo 'Not installed')"
echo "Docker: $(docker --version 2>/dev/null || echo 'Not installed')"
echo "Docker Compose: $(docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || echo 'Not installed')"
echo ""
echo "=== Next Steps ==="
echo "1. Clone the repository:"
echo "   git clone https://github.com/ethanteng/weather-station.git"
echo "   cd weather-station"
echo ""
echo "2. Create .env file with your API keys"
echo ""
echo "3. Start Postgres: docker compose up -d"
echo ""
echo "4. Run migrations: npm run db:migrate --workspace=apps/api"
echo ""
echo "5. Start the API: npm run dev --workspace=apps/api"
echo ""
echo "Note: If docker commands fail, you may need to log out and back in"
echo "      for the docker group membership to take effect."


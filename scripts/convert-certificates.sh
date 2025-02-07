#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print with color
print_color() {
    color=$1
    message=$2
    printf "${color}${message}${NC}\n"
}

# Error handler
handle_error() {
    print_color $RED "Error: $1"
    exit 1
}

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    print_color $RED "OpenSSL is not installed. Please install it first."
    print_color $YELLOW "On Mac: brew install openssl"
    print_color $YELLOW "On Linux: sudo apt-get install openssl"
    exit 1
fi

# Create certificates directory if it doesn't exist
mkdir -p certificates || handle_error "Failed to create certificates directory"
cd certificates || handle_error "Failed to change to certificates directory"

# Handle WWDR certificate
print_color $GREEN "Processing WWDR certificate..."
WWDR_SOURCE="../Apple Worldwide Developer Relations Certification Authority.cer"

if [ ! -f "$WWDR_SOURCE" ]; then
    handle_error "WWDR certificate not found in parent directory"
fi

# Check if source is already in PEM format
if grep -q "BEGIN CERTIFICATE" "$WWDR_SOURCE"; then
    print_color $GREEN "WWDR certificate is already in PEM format, copying directly..."
    cp "$WWDR_SOURCE" ./wwdr.pem || handle_error "Failed to copy WWDR certificate"
else
    print_color $GREEN "Converting WWDR certificate to PEM format..."
    openssl x509 -inform der -in "$WWDR_SOURCE" -out wwdr.pem || handle_error "Failed to convert WWDR certificate"
fi

# Verify WWDR certificate
if [ ! -s wwdr.pem ]; then
    handle_error "WWDR PEM file is empty after processing"
fi

if ! grep -q "BEGIN CERTIFICATE" wwdr.pem; then
    handle_error "Invalid PEM file: missing BEGIN CERTIFICATE marker"
fi

print_color $GREEN "WWDR certificate processed successfully!"

# Convert P12 to PEM files
print_color $GREEN "Converting P12 certificate to PEM files..."
print_color $YELLOW "Please enter the password for your P12 file when prompted:"

# Check if P12 file exists
if [ ! -f "../new.p12" ]; then
    handle_error "P12 certificate not found in parent directory"
fi

# Extract private key with modern cipher options
print_color $GREEN "Extracting private key..."
openssl pkcs12 -in ../new.p12 -nocerts -out signerKey.pem -legacy || handle_error "Failed to extract private key"

# Extract certificate
print_color $GREEN "Extracting certificate..."
openssl pkcs12 -in ../new.p12 -clcerts -nokeys -out signerCert.pem -legacy || handle_error "Failed to extract certificate"

# Remove password from private key
print_color $YELLOW "Removing password from private key..."
print_color $YELLOW "Please enter the password again:"
openssl rsa -in signerKey.pem -out signerKey.pem || handle_error "Failed to remove password from private key"

# Create pass.json template
print_color $GREEN "Creating pass.json template..."
cat > pass.json << EOL
{
    "formatVersion": 1,
    "passTypeIdentifier": "pass.com.yourcompany.pass",
    "teamIdentifier": "YOUR_TEAM_ID",
    "organizationName": "Your Company Name",
    "description": "Description of the pass",
    "foregroundColor": "rgb(255, 255, 255)",
    "backgroundColor": "rgb(60, 65, 76)",
    "labelColor": "rgb(255, 255, 255)",
    "logoText": "Your Company",
    "generic": {
        "primaryFields": [],
        "secondaryFields": [],
        "auxiliaryFields": []
    }
}
EOL

# Verify all generated files
print_color $GREEN "Verifying generated files..."
for file in wwdr.pem signerKey.pem signerCert.pem pass.json; do
    if [ ! -f "$file" ]; then
        handle_error "Missing file: $file"
    fi
    if [ ! -s "$file" ]; then
        handle_error "Empty file: $file"
    fi
done

print_color $GREEN "✅ Certificate conversion complete!"
print_color $GREEN "Generated files:"
ls -la

print_color $GREEN "All files generated successfully! 🎉"
print_color $YELLOW "
Next steps:
1. Update pass.json with your actual pass type identifier and team ID
2. Make sure all certificate files are secure (chmod 600 *.pem)
3. Add certificate files to .gitignore
4. Keep backup of original .p12 file
5. Set environment variables:
   - APPLE_PASS_TYPE_IDENTIFIER
   - APPLE_TEAM_IDENTIFIER"

# Secure the PEM files
chmod 600 *.pem || print_color $YELLOW "Warning: Failed to set secure permissions on PEM files"

# Final verification
print_color $GREEN "
Verification of generated files:
- WWDR certificate: $(file wwdr.pem)
- Signer certificate: $(file signerCert.pem)
- Signer key: $(file signerKey.pem)
- Pass template: $(file pass.json)" 
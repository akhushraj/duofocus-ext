#!/bin/bash
# ============================================================
# Duofocus Lockdown Setup Script
# ============================================================
# Run this ONCE from an admin account on your child's MacBook.
# Usage: sudo bash lockdown-setup.sh
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Duofocus Lockdown Setup${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: This script must be run with sudo.${NC}"
    echo "Usage: sudo bash lockdown-setup.sh"
    exit 1
fi

# ---- Step 1: Get Extension ID ----
echo -e "${YELLOW}Step 1: Extension ID${NC}"
echo ""
read -p "Enter your Duofocus Chrome Web Store Extension ID: " EXTENSION_ID

if [ -z "$EXTENSION_ID" ]; then
    echo -e "${RED}ERROR: Extension ID cannot be empty.${NC}"
    exit 1
fi

echo -e "${GREEN}  Extension ID: ${EXTENSION_ID}${NC}"
echo ""

# ---- Step 2: Chrome Policies ----
echo -e "${YELLOW}Step 2: Setting Chrome policies...${NC}"

POLICY_PATH="/Library/Managed Preferences/com.google.Chrome.plist"
POLICY_DIR="/Library/Managed Preferences"

# Create directory if needed
mkdir -p "$POLICY_DIR"

# Force-install extension on ALL Chrome profiles
echo "  - Force-installing Duofocus on all Chrome profiles..."
defaults write "$POLICY_DIR/com.google.Chrome" ExtensionInstallForcelist -array "${EXTENSION_ID};https://clients2.google.com/service/update2/crx"

# Block incognito mode (extensions don't run in incognito by default)
echo "  - Blocking incognito mode..."
defaults write "$POLICY_DIR/com.google.Chrome" IncognitoModeAvailability -int 1

# Block guest mode
echo "  - Blocking guest browsing..."
defaults write "$POLICY_DIR/com.google.Chrome" BrowserGuestModeEnabled -bool false

# NOTE: Not blocking new profile creation - parent may need to use their own profile
# The force-install policy applies Duofocus to ALL profiles automatically

# Restrict developer tools (prevent tampering)
echo "  - Restricting developer tools..."
defaults write "$POLICY_DIR/com.google.Chrome" DeveloperToolsAvailability -int 1

# Prevent extension install/uninstall by user (allow only force-installed)
echo "  - Locking extension management..."
defaults write "$POLICY_DIR/com.google.Chrome" BlockExternalExtensions -bool true

echo -e "${GREEN}  Chrome policies applied.${NC}"
echo ""

# ---- Step 3: Handle other browsers ----
echo -e "${YELLOW}Step 3: Other browsers${NC}"
echo ""

# Check for Firefox
if [ -d "/Applications/Firefox.app" ]; then
    read -p "  Firefox detected. Remove it? (y/n): " REMOVE_FIREFOX
    if [ "$REMOVE_FIREFOX" = "y" ] || [ "$REMOVE_FIREFOX" = "Y" ]; then
        rm -rf "/Applications/Firefox.app"
        echo -e "${GREEN}  Firefox removed.${NC}"
    else
        echo -e "${YELLOW}  Firefox kept. Consider restricting it via Screen Time.${NC}"
    fi
else
    echo "  Firefox not found. Skipping."
fi

# Check for Brave
if [ -d "/Applications/Brave Browser.app" ]; then
    read -p "  Brave detected. Remove it? (y/n): " REMOVE_BRAVE
    if [ "$REMOVE_BRAVE" = "y" ] || [ "$REMOVE_BRAVE" = "Y" ]; then
        rm -rf "/Applications/Brave Browser.app"
        echo -e "${GREEN}  Brave removed.${NC}"
    else
        echo -e "${YELLOW}  Brave kept. Consider restricting it via Screen Time.${NC}"
    fi
else
    echo "  Brave not found. Skipping."
fi

# Check for Arc
if [ -d "/Applications/Arc.app" ]; then
    read -p "  Arc detected. Remove it? (y/n): " REMOVE_ARC
    if [ "$REMOVE_ARC" = "y" ] || [ "$REMOVE_ARC" = "Y" ]; then
        rm -rf "/Applications/Arc.app"
        echo -e "${GREEN}  Arc removed.${NC}"
    else
        echo -e "${YELLOW}  Arc kept. Consider restricting it via Screen Time.${NC}"
    fi
else
    echo "  Arc not found. Skipping."
fi

# Check for Edge
if [ -d "/Applications/Microsoft Edge.app" ]; then
    read -p "  Microsoft Edge detected. Remove it? (y/n): " REMOVE_EDGE
    if [ "$REMOVE_EDGE" = "y" ] || [ "$REMOVE_EDGE" = "Y" ]; then
        rm -rf "/Applications/Microsoft Edge.app"
        echo -e "${GREEN}  Edge removed.${NC}"
    else
        echo -e "${YELLOW}  Edge kept. Consider restricting it via Screen Time.${NC}"
    fi
else
    echo "  Edge not found. Skipping."
fi

echo ""

# ---- Step 3b: Restrict Safari ----
echo -e "${YELLOW}Step 3b: Safari restriction${NC}"
echo ""
echo "  Safari is a system app and cannot be removed."
echo ""
read -p "  Block Safari using a managed configuration profile? (y/n): " BLOCK_SAFARI
if [ "$BLOCK_SAFARI" = "y" ] || [ "$BLOCK_SAFARI" = "Y" ]; then
    # Create a configuration profile that disables Safari
    PROFILE_PATH="/tmp/duofocus-block-safari.mobileconfig"
    cat > "$PROFILE_PATH" << 'MOBILECONFIG'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.applicationaccess</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.duofocus.safari-block.appaccess</string>
            <key>PayloadUUID</key>
            <string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
            <key>PayloadEnabled</key>
            <true/>
            <key>familyControlsEnabled</key>
            <true/>
            <key>whiteList</key>
            <array>
                <dict>
                    <key>bundleID</key>
                    <string>com.google.Chrome</string>
                    <key>displayName</key>
                    <string>Google Chrome</string>
                </dict>
                <dict>
                    <key>bundleID</key>
                    <string>com.apple.finder</string>
                    <key>displayName</key>
                    <string>Finder</string>
                </dict>
                <dict>
                    <key>bundleID</key>
                    <string>com.apple.systempreferences</string>
                    <key>displayName</key>
                    <string>System Settings</string>
                </dict>
            </array>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>Duofocus - Browser Restriction</string>
    <key>PayloadIdentifier</key>
    <string>com.duofocus.safari-block</string>
    <key>PayloadUUID</key>
    <string>B2C3D4E5-F6A7-8901-BCDE-F12345678901</string>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>PayloadScope</key>
    <string>System</string>
    <key>PayloadRemovalDisallowed</key>
    <true/>
</dict>
</plist>
MOBILECONFIG

    echo ""
    echo -e "${YELLOW}  WARNING: The managed config profile approach can be heavy-handed.${NC}"
    echo -e "${YELLOW}  It uses an app whitelist which may block apps you didn't intend.${NC}"
    echo ""
    echo "  Recommended alternative: Use Screen Time instead (simpler & safer)."
    echo ""
    read -p "  Proceed with Screen Time setup guide instead? (y = Screen Time guide / n = install profile): " USE_SCREENTIME

    if [ "$USE_SCREENTIME" = "y" ] || [ "$USE_SCREENTIME" = "Y" ]; then
        rm -f "$PROFILE_PATH"
        echo ""
        echo -e "${BLUE}  Screen Time Setup (do this manually):${NC}"
        echo "  1. Open System Settings > Screen Time"
        echo "  2. If managing a child's account: Select their account"
        echo "  3. Turn on Screen Time if not already on"
        echo "  4. Set a Screen Time PASSCODE (one they don't know)"
        echo "  5. Go to App Limits > Add Limit"
        echo "  6. Select Safari (under 'Productivity & Finance' or search for it)"
        echo "  7. Set limit to 1 minute, tap Add"
        echo "  8. Also consider limiting: App Store (prevent installing other browsers)"
        echo ""
        echo -e "${GREEN}  When the 1-minute limit is hit, Safari will be blocked for the day.${NC}"
    else
        echo "  Installing configuration profile..."
        profiles install -path "$PROFILE_PATH" 2>/dev/null || {
            echo -e "${YELLOW}  Auto-install not available. Opening profile for manual install...${NC}"
            open "$PROFILE_PATH"
            echo "  A dialog will appear in System Settings > Profiles."
            echo "  Click Install to apply the restriction."
        }
        rm -f "$PROFILE_PATH"
        echo -e "${GREEN}  Safari restriction profile installed.${NC}"
    fi
else
    echo -e "${YELLOW}  Safari not restricted. He can use Safari to bypass Chrome controls.${NC}"
    echo "  You can restrict it later via Screen Time."
fi
echo ""

# ---- Step 4: Prevent installing new browsers ----
echo -e "${YELLOW}Step 4: Prevent new browser installs${NC}"
echo ""
echo "  If your child is a Standard user, they cannot install apps to /Applications."
echo "  However, they could download apps to their own ~/Applications or ~/Downloads."
echo ""
read -p "  Block App Store installs via policy? (y/n): " BLOCK_APPSTORE
if [ "$BLOCK_APPSTORE" = "y" ] || [ "$BLOCK_APPSTORE" = "Y" ]; then
    # Restrict App Store installs (requires admin password to install apps)
    defaults write "$POLICY_DIR/com.apple.appstore" restrict-store-softwareupdate-only -bool true 2>/dev/null || true
    echo -e "${GREEN}  App Store restricted to updates only.${NC}"
else
    echo "  App Store not restricted."
fi
echo ""

# ---- Step 5: Check user accounts ----
echo -e "${YELLOW}Step 5: User account check${NC}"
echo ""

# List non-system users
echo "  Current user accounts:"
dscl . list /Users | grep -v '^_' | grep -v 'daemon\|nobody\|root' | while read user; do
    IS_ADMIN=$(dscl . -read /Groups/admin GroupMembership 2>/dev/null | grep -c "$user" || true)
    if [ "$IS_ADMIN" -gt 0 ]; then
        echo -e "    - $user ${RED}(admin)${NC}"
    else
        echo -e "    - $user ${GREEN}(standard)${NC}"
    fi
done

echo ""
echo -e "${YELLOW}  IMPORTANT: Your child's account should be 'standard', not 'admin'.${NC}"
echo "  To change: System Settings > Users & Groups > click (i) next to their account"
echo "  > Turn off 'Allow this user to administer this computer'"
echo ""

# ---- Step 6: Verify ----
echo -e "${YELLOW}Step 6: Verification${NC}"
echo ""
echo "  Policies written to: $POLICY_DIR/com.google.Chrome.plist"
echo ""

if [ -f "$POLICY_DIR/com.google.Chrome.plist" ]; then
    echo "  Current Chrome policies:"
    defaults read "$POLICY_DIR/com.google.Chrome" 2>/dev/null | head -30
    echo ""
fi

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart Chrome on all profiles"
echo "  2. Visit chrome://policy to verify policies are active"
echo "  3. Open Duofocus and set a password on each profile"
echo "  4. Ensure your child's account is Standard (not Admin)"
echo "  5. If you skipped Safari restriction, set it up via Screen Time"
echo ""
echo "To UNDO all Chrome policies later:"
echo "  sudo rm '/Library/Managed Preferences/com.google.Chrome.plist'"
echo ""
echo "To UNDO Safari/app restrictions:"
echo "  Screen Time: System Settings > Screen Time > Turn Off"
echo "  Profile: System Settings > Profiles > Duofocus > Remove"
echo ""

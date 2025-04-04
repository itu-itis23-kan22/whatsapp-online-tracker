# WhatsApp Online Tracker

A Chrome extension that tracks and monitors your WhatsApp contacts' online status, allowing you to see when they come online, go offline, or are typing, even when you're not actively using WhatsApp.

![WhatsApp Online Tracker](images/screenshot.png)

## Features

- **Online Status Tracking**: Monitor when your contacts come online or go offline
- **Typing Status Detection**: See when contacts are typing messages
- **History Recording**: Keep a log of online/offline/typing events
- **Notifications**: Receive browser notifications when status changes occur
- **Auto-Open Chats**: Automatically cycle through your tracked contacts to check their status
- **Multi-language Support**: Available in English and Turkish
- **Customizable Settings**: Configure notification preferences, scan intervals, and more

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation
1. Download the latest release ZIP file from the [Releases](https://github.com/yourusername/whatsapp-online-tracker/releases) page
2. Extract the ZIP file to a folder on your computer
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" using the toggle in the top-right corner
5. Click "Load unpacked" and select the extracted folder
6. The extension will be installed and ready to use

## Usage

1. **First-time Setup**:
   - Open WhatsApp Web in Chrome
   - The extension icon will appear in your browser toolbar
   - Click on the extension icon to open the control panel

2. **Adding Contacts to Track**:
   - Open a chat with the contact you want to track in WhatsApp Web
   - Click "Add Current Chat" in the extension popup
   - Alternatively, you can manually enter a contact name

3. **Monitoring Contacts**:
   - The extension will automatically monitor the online status of all tracked contacts
   - Online contacts will be shown in the "Online Status" section
   - History of status changes is recorded in the "History" tab

4. **Viewing History**:
   - Click on the "History" tab to view records of when contacts were online, offline, or typing
   - Filter history by status type using the tabs (All, Online, Offline, Typing)
   - Export history to CSV for further analysis

## Settings

- **Notifications**: Enable/disable browser notifications when contacts change status
- **Save History**: Toggle history recording
- **Check Interval**: Set how frequently (in seconds) the extension checks for status updates
- **Debug Mode**: Enable detailed logging for troubleshooting
- **Language**: Choose between English and Turkish
- **Auto-Open Chats**: Enable/disable automatic cycling through chats to check status
- **Auto-Open Interval**: Set the interval between automatic chat checks (in seconds)

## How It Works

The extension monitors the WhatsApp Web interface for specific DOM elements that indicate a contact's status. It works by:

1. Observing changes in the WhatsApp Web UI
2. Detecting status indicators in the active chat and chat list
3. Recording status changes and sending notifications
4. Optionally opening chats automatically to check statuses

## Privacy & Security

- The extension only works with WhatsApp Web in Chrome
- All data is stored locally in your browser
- No data is sent to external servers
- The extension requires permissions to access WhatsApp Web and send notifications

## Development

### Project Structure
```
whatsapp-tracking/
├── css/
│   ├── content.css
│   └── popup.css
├── js/
│   ├── background.js
│   ├── content.js
│   ├── i18n.js
│   └── popup.js
├── images/
├── popup.html
└── manifest.json
```

### Key Components
- **content.js**: Core functionality for detecting status changes
- **popup.js**: User interface logic
- **background.js**: Background processes and notification management
- **i18n.js**: Multi-language support

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This extension is for educational purposes only. It is not affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp or any of its affiliates or subsidiaries. Use at your own risk.

WhatsApp's terms of service may change, potentially affecting this extension's functionality. The developers are not responsible for any account restrictions or bans that may result from using this extension. 
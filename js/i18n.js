// i18n.js - WhatsApp Online Tracker için çoklu dil desteği
// Sürüm 2.0.0

const i18n = (function() {
  // Varsayılan dil
  let currentLanguage = 'tr';
  
  // Çeviriler
  const translations = {
    // Türkçe çeviriler
    'tr': {
      // Menü başlıkları
      'trackedContacts': 'İzlenen Kişiler',
      'onlineStatus': 'Çevrimiçi Durumu',
      'history': 'Geçmiş',
      'settings': 'Ayarlar',
      
      // Tab başlıkları
      'allHistory': 'Tümü',
      'onlineHistory': 'Çevrimiçi',
      'offlineHistory': 'Çevrimdışı',
      'typingHistory': 'Yazıyor',
      
      // İşlem butonları
      'addContact': 'Kişi Ekle',
      'addCurrentContact': 'Aktif Sohbeti Ekle',
      'exportHistory': 'Geçmişi Dışa Aktar',
      'clearHistory': 'Geçmişi Temizle',
      'cancel': 'İptal',
      'add': 'Ekle',
      'save': 'Kaydet',
      'remove': 'Kaldır',
      'close': 'Kapat',
      'yes': 'Evet',
      'no': 'Hayır',
      
      // Ayarlar
      'notificationsEnabled': 'Bildirimler açık',
      'saveHistoryEnabled': 'Geçmiş kaydetme açık',
      'checkInterval': 'Kontrol aralığı (saniye)',
      'debugModeEnabled': 'Hata ayıklama modu',
      'language': 'Dil',
      'languageTr': 'Türkçe',
      'languageEn': 'İngilizce',
      
      // Form ve girişler
      'contactName': 'Kişi adı',
      'enterContactNamePrompt': 'İzlemek istediğiniz kişinin adını girin:',
      'contactAddInfo': 'Not: Tam olarak WhatsApp\'taki görünen ismi yazın',
      
      // CSV sütun başlıkları
      'date': 'Tarih',
      'contact': 'Kişi',
      'status': 'Durum',
      
      // Durum mesajları
      'online': 'çevrimiçi',
      'offline': 'çevrimdışı',
      'typing': 'yazıyor',
      'contactAdded': '"{name}" kişisi başarıyla eklendi.',
      'contactAlreadyTracked': '"{name}" zaten izleniyor.',
      'contactRemoved': '"{name}" kişisi izleme listesinden kaldırıldı.',
      'allContactsOffline': 'Tüm kişiler çevrimdışı',
      'noContactsTracked': 'İzlenen kişi bulunmuyor',
      'noHistoryRecords': 'Geçmiş kaydı bulunmuyor',
      'settingsSaved': 'Ayarlar kaydedildi',
      'whatsappNotOpen': 'WhatsApp Web açık değil. Lütfen WhatsApp Web\'i açın ve tekrar deneyin.',
      'contactVerificationFailed': 'Kişi WhatsApp\'ta bulunamadı',
      'confirmAddAnyway': '{message}. Yine de eklemek istiyor musunuz?',
      'manualAddWarning': '"{name}" kişisi manuel olarak eklendi, ancak WhatsApp\'ta bulunmadığı için bazı durumlar tespit edilemeyebilir.',
      'communicationError': 'WhatsApp Web ile iletişim kurulamadı. Sayfanın açık olduğundan emin olun ve tekrar deneyin.',
      'confirmClearHistory': 'Tüm geçmiş kayıtları silinecek. Devam etmek istiyor musunuz?',
      'historyCleared': 'Geçmiş temizlendi.',
      'historyExported': 'Geçmiş dışa aktarıldı.',
      'enterValidName': 'Lütfen geçerli bir kişi adı girin.',
      'confirmRemoveContact': '{name} kişisini takipten çıkarmak istediğinizden emin misiniz?',
      
      // Bildirim metinleri
      'notificationTitle': 'WhatsApp Durum Değişikliği',
      'notificationOnline': '{name} şu anda çevrimiçi!',
      'notificationOffline': '{name} çevrimdışı oldu.',
      'notificationTyping': '{name} yazıyor...',
      
      // Otomatik sohbet açma
      'autoOpenChatsTitle': 'Otomatik Sohbet Açma',
      'autoOpenChatsDescription': 'Bu özellik, çevrimiçi durumlarını görmek için takip edilen kişilerin sohbetlerini otomatik olarak açıp kapatır.',
      'autoOpenChatsEnabled': 'Otomatik sohbet açma etkin',
      'autoOpenInterval': 'Tarama aralığı (saniye)',
      'autoOpenChatsWarning': 'Not: Bu özellik, WhatsApp Web sayfanızda görünür şekilde sohbetleri açıp kapatacaktır.',
    },
    
    // İngilizce çeviriler
    'en': {
      // Menu headers
      'trackedContacts': 'Tracked Contacts',
      'onlineStatus': 'Online Status',
      'history': 'History',
      'settings': 'Settings',
      
      // Tab titles
      'allHistory': 'All',
      'onlineHistory': 'Online',
      'offlineHistory': 'Offline',
      'typingHistory': 'Typing',
      
      // Action buttons
      'addContact': 'Add Contact',
      'addCurrentContact': 'Add Current Chat',
      'exportHistory': 'Export History',
      'clearHistory': 'Clear History',
      'cancel': 'Cancel',
      'add': 'Add',
      'save': 'Save',
      'remove': 'Remove',
      'close': 'Close',
      'yes': 'Yes',
      'no': 'No',
      
      // Settings
      'notificationsEnabled': 'Notifications enabled',
      'saveHistoryEnabled': 'Save history enabled',
      'checkInterval': 'Check interval (seconds)',
      'debugModeEnabled': 'Debug mode',
      'language': 'Language',
      'languageTr': 'Turkish',
      'languageEn': 'English',
      
      // Forms and inputs
      'contactName': 'Contact name',
      'enterContactNamePrompt': 'Enter the name of the contact you want to track:',
      'contactAddInfo': 'Note: Enter the exact name as it appears in WhatsApp',
      
      // CSV column headers
      'date': 'Date',
      'contact': 'Contact',
      'status': 'Status',
      
      // Status messages
      'online': 'online',
      'offline': 'offline',
      'typing': 'typing',
      'contactAdded': '"{name}" has been successfully added.',
      'contactAlreadyTracked': '"{name}" is already being tracked.',
      'contactRemoved': '"{name}" has been removed from the tracking list.',
      'allContactsOffline': 'All contacts are offline',
      'noContactsTracked': 'No contacts are being tracked',
      'noHistoryRecords': 'No history records found',
      'settingsSaved': 'Settings saved',
      'whatsappNotOpen': 'WhatsApp Web is not open. Please open WhatsApp Web and try again.',
      'contactVerificationFailed': 'Contact not found on WhatsApp',
      'confirmAddAnyway': '{message}. Do you still want to add it?',
      'manualAddWarning': '"{name}" has been added manually, but some statuses may not be detected because the contact was not found on WhatsApp.',
      'communicationError': 'Could not communicate with WhatsApp Web. Make sure the page is open and try again.',
      'confirmClearHistory': 'All history records will be deleted. Do you want to continue?',
      'historyCleared': 'History cleared.',
      'historyExported': 'History exported.',
      'enterValidName': 'Please enter a valid contact name.',
      'confirmRemoveContact': 'Are you sure you want to remove {name} from tracking?',
      
      // Notification texts
      'notificationTitle': 'WhatsApp Status Change',
      'notificationOnline': '{name} is now online!',
      'notificationOffline': '{name} went offline.',
      'notificationTyping': '{name} is typing...',
      
      // Otomatik sohbet açma
      'autoOpenChatsTitle': 'Auto-Open Chats',
      'autoOpenChatsDescription': 'This feature automatically opens and closes chats with tracked contacts to check their online status.',
      'autoOpenChatsEnabled': 'Auto-open chats enabled',
      'autoOpenInterval': 'Scan interval (seconds)',
      'autoOpenChatsWarning': 'Note: This feature will visibly open and close chats on your WhatsApp Web page.',
    }
  };
  
  // Çeviri fonksiyonu
  function translateText(key, replacements = {}) {
    const lang = translations[currentLanguage] || translations['en'];
    let text = lang[key] || translations['en'][key] || key;
    
    // Değişken değiştirme
    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(new RegExp(`{${placeholder}}`, 'g'), replacements[placeholder]);
    });
    
    return text;
  }
  
  // Dil ayarını yükleme
  async function loadLanguageSetting() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        settings: {
          language: navigator.language.startsWith('tr') ? 'tr' : 'en'
        }
      }, (data) => {
        if (data.settings && data.settings.language) {
          currentLanguage = data.settings.language;
        } else {
          // Tarayıcı dili Türkçe ise varsayılan olarak Türkçe, değilse İngilizce
          currentLanguage = navigator.language.startsWith('tr') ? 'tr' : 'en';
        }
        resolve(currentLanguage);
      });
    });
  }
  
  // Mevcut dili değiştir
  function setLanguage(lang) {
    if (translations[lang]) {
      currentLanguage = lang;
      return true;
    }
    return false;
  }
  
  // Mevcut dili al
  function getCurrentLanguage() {
    return currentLanguage;
  }
  
  // Dil listesini al
  function getAvailableLanguages() {
    return Object.keys(translations).map(code => ({
      code,
      name: translations[code][`language${code.charAt(0).toUpperCase() + code.slice(1)}`]
    }));
  }

  // Public API
  return {
    __: translateText,
    loadLanguageSetting,
    setLanguage,
    getCurrentLanguage,
    getAvailableLanguages
  };
})();

// Content script olmadığında hatalardan kaçınmak için global tanımlı olsun
if (typeof window !== 'undefined') {
  window.i18n = i18n;
}

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18n;
}
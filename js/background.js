// WhatsApp Online Tracker - Background Service Worker

// Uzantı yüklendiğinde
chrome.runtime.onInstalled.addListener(() => {
  console.log('WhatsApp Online Tracker yüklendi');
  
  // Varsayılan ayarları kaydet
  chrome.storage.sync.get({
    settings: null,
    trackedContacts: [],
    onlineContacts: []
  }, (items) => {
    // Varsayılan ayarlar
    const defaultSettings = {
      notifications: true,
      saveHistory: true,
      scanInterval: 10,
      debug: false
    };
    
    // Eğer ayarlar zaten varsa, eksik olanları ekle
    const settings = items.settings || defaultSettings;
    
    // Varsayılan değerlerle karşılaştır ve eksikleri doldur
    Object.keys(defaultSettings).forEach(key => {
      if (settings[key] === undefined) {
        settings[key] = defaultSettings[key];
      }
    });
    
    // Ayarları kaydet
    chrome.storage.sync.set({
      settings: settings,
      trackedContacts: items.trackedContacts || [],
      onlineContacts: items.onlineContacts || []
    }, () => {
      console.log('Ayarlar kaydedildi:', settings);
    });
  });
});

// Mesaj dinleyicisi
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showNotification') {
    // Tarayıcı bildirimleri göster
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==', // Basit 1x1 transparan piksel
      title: message.title || 'WhatsApp Online Tracker',
      message: message.message,
      priority: 2
    });
    
    sendResponse({success: true});
  } else if (message.action === 'updateContactStatus') {
    // Çevrimiçi kişiler listesini güncelle
    updateOnlineContactsList(message.contact);
    sendResponse({success: true});
  }
  
  return true; // Asenkron yanıtlar için önemli
});

// Çevrimiçi kişiler listesini güncelle
function updateOnlineContactsList(contact) {
  chrome.storage.sync.get({onlineContacts: []}, (data) => {
    let onlineContacts = data.onlineContacts || [];
    
    // Kişi çevrimiçiyse ve listede değilse ekle
    if (contact.online) {
      const existingIndex = onlineContacts.findIndex(c => c.id === contact.id);
      
      if (existingIndex === -1) {
        onlineContacts.push(contact);
      } else {
        // Varsa güncelle
        onlineContacts[existingIndex] = contact;
      }
    } else {
      // Çevrimiçi değilse listeden çıkar
      onlineContacts = onlineContacts.filter(c => c.id !== contact.id);
    }
    
    // Kaydet
    chrome.storage.sync.set({onlineContacts: onlineContacts});
  });
}

// WhatsApp Web sekmesi takibi
function checkWhatsAppWebTabs() {
  chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
    const isOpen = tabs.length > 0;
    
    // WhatsApp Web açıkken yapılacak işlemler
    if (isOpen) {
      console.log('WhatsApp Web açık:', tabs.length, 'sekme');
      
      // Birden fazla sekme açıksa kullanıcıyı uyar
      if (tabs.length > 1) {
        // Sadece bir kez bildirim göster
        chrome.storage.local.get({multipleTabsWarningShown: false}, (data) => {
          if (!data.multipleTabsWarningShown) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
              title: 'WhatsApp Online Tracker Uyarı',
              message: 'Birden fazla WhatsApp Web sekmesi açık. Bu durum takip işlevini etkileyebilir.',
              priority: 2
            });
            
            chrome.storage.local.set({multipleTabsWarningShown: true});
          }
        });
      }
    } else {
      console.log('WhatsApp Web kapalı');
      // Uyarı bayrağını sıfırla
      chrome.storage.local.set({multipleTabsWarningShown: false});
    }
  });
}

// Sekme kapatıldığında kişi durumlarını güncelle
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.tabs.get(tabId, (tab) => {
    // Chrome.runtime.lastError kontrol et (sekme zaten kapatılmış olabilir)
    if (chrome.runtime.lastError) {
      return;
    }
    
    // Kapatılan sekme WhatsApp Web ise
    if (tab && tab.url && tab.url.includes('web.whatsapp.com')) {
      console.log('WhatsApp Web sekmesi kapatıldı');
      
      // Tüm WhatsApp Web sekmeleri açık mı kontrol et
      chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
        // Tüm WhatsApp Web sekmeleri kapatıldıysa, çevrimiçi durumlarını temizle
        if (tabs.length === 0) {
          chrome.storage.sync.set({onlineContacts: []});
        }
      });
    }
  });
});

// Tarayıcı açıldığında ve extension etkinleştirildiğinde
chrome.runtime.onStartup.addListener(() => {
  // Periyodik WhatsApp Web kontrolü başlat
  setInterval(checkWhatsAppWebTabs, 5 * 60 * 1000); // 5 dakika
  
  // Başlangıçta bir kez kontrol et
  checkWhatsAppWebTabs();
}); 
// WhatsApp Online Tracker - Content Script
// WhatsApp Web ile etkileşim kuran ana script

// WhatsApp mesaj kontrol ve kişi takibi için selektörler
const SELECTORS = {
  conversationHeader: 'header[data-testid="conversation-header"]',
  onlineText: 'span[title="çevrimiçi"], span[title="online"], span.x1iyjqo2.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft._ao3e',
  chatList: 'div[aria-label="Chat list"] div[role="listitem"], div[aria-label="Sohbet listesi"] div[role="listitem"]',
  // Sabit selektörler ekliyoruz
  chatListContainer: 'div[aria-label="Sohbet listesi"], div[aria-label="Chat list"]',
  typingStatus: 'span[title="yazıyor..."], span[title*="typing..."], span.x1iyjqo2',
  messageContainer: 'div._ak8k',
  contactName: 'span.x1iyjqo2.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1rg5ohu'
};

// Global değişkenler
let trackedContacts = [];
let onlineContacts = {};
let settings = {
  scanInterval: 60,
  saveHistory: true,
  showNotifications: true,
  debugMode: false,
  autoScan: true,
  checkInterval: 60, // Saniye cinsinden kontrol sıklığı
  autoOpenChats: false, // Otomatik sohbet açma özelliği başlangıçta kapalı
  autoOpenInterval: 180 // 3 dakikada bir otomatik tarama yap (saniye)
};
let lastManualScan = 0;
let history = [];
let pendingStorageUpdates = {
  trackedContacts: false,
  history: false
};
let storageUpdateTimer = null;
let historyUpdateTimer = null;
let initRetryCount = 0;
let newHistoryItems = []; // Henüz kaydedilmemiş geçmiş öğeleri

// Bildirim zamanlarını takip etmek için yeni değişken
let lastNotificationTimes = {};

// DOM gözlemcileri ve zamanlayıcılar
let chatListObserver = null;
let chatPaneObserver = null;
let scanInterval = null;

// Performance için değişkenler
let isProcessingMutation = false;
let lastProcessTime = 0;
const THROTTLE_DELAY = 1000; // 1 saniye

// Geçmiş güncellemeleri için değişkenler
let pendingHistoryUpdates = [];
const STORAGE_UPDATE_DELAY = 5000; // 5 saniye
const HISTORY_UPDATE_DELAY = 10000; // 10 saniye

// Debug bildirimi için değişken
let activeDebugNotifications = 0;
const MAX_DEBUG_NOTIFICATIONS = 3;

// Otomatik sohbet açma işlevini başlatan zamanlayıcı
let autoOpenChatsTimer = null;

// Şu anda işlenen kişinin indeksi
let currentAutoOpenIndex = 0;

// Otomatik sohbet açma işlemi devam ediyor mu?
let isAutoOpeningChats = false;

// Yazıyor durumları için son izlenen zamanlar
let lastTypingStatuses = {};

// Storage yazma işlemlerini toplu halde yap
function commitStorageUpdates() {
  try {
    // Takip edilen kişileri güncelle
    if (pendingStorageUpdates.trackedContacts) {
      chrome.storage.sync.set({
        'trackedContacts': trackedContacts
      }, function() {
        debugLog('Takip edilen kişiler storage\'a kaydedildi');
      });
      pendingStorageUpdates.trackedContacts = false;
    }
    
    // Geçmiş güncellemelerini yap (eğer daha önce yapılmadıysa)
    if (pendingStorageUpdates.history) {
      saveHistoryToStorage();
      pendingStorageUpdates.history = false;
    }
    
  } catch (error) {
    debugLog(`Storage güncellemesi sırasında hata: ${error.message}`);
  } finally {
    storageUpdateTimer = null;
  }
}

// Zamanlayıcıyı sıfırlayıp yeniden başlat
function scheduleStorageUpdate() {
  // Kontrol takibi için hemen kaydet, diğer güncellemeler için zamanlayıcı kullan
  if (pendingStorageUpdates.history) {
    // Geçmiş güncellemeleri daha hızlı yapalım - 2 saniye içinde
    if (!historyUpdateTimer) {
      historyUpdateTimer = setTimeout(() => {
        // Geçmiş güncellemelerini hemen yapalım
        if (pendingStorageUpdates.history) {
          saveHistoryToStorage();
          pendingStorageUpdates.history = false;
        }
        historyUpdateTimer = null;
      }, 1000); // 1 saniye sonra geçmişi güncelle
    }
  }
  
  // Diğer güncellemeler için normal zamanlayıcı
  if (!storageUpdateTimer) {
    storageUpdateTimer = setTimeout(commitStorageUpdates, 5000);
  }
}

// Geçmiş güncellemelerini biriktir ve toplu olarak işle
function commitHistoryUpdates() {
  if (pendingHistoryUpdates.length === 0) return;
  
  debugLog(`${pendingHistoryUpdates.length} adet geçmiş kaydı toplu olarak kaydediliyor`);
  
  // Mevcut geçmişi al
  chrome.storage.local.get(['history'], (data) => {
    let history = data.history || [];
    
    // Yeni kayıtları ekle
    history = [...pendingHistoryUpdates, ...history];
    
    // Maksimum 1000 kayıt tut
    if (history.length > 1000) {
      history = history.slice(0, 1000);
    }
    
    // Geçmişi kaydet
    chrome.storage.local.set({ history }, () => {
      if (chrome.runtime.lastError) {
        debugLog(`Geçmiş kaydedilirken hata: ${chrome.runtime.lastError.message}`);
      } else {
        debugLog(`Geçmiş başarıyla kaydedildi (${pendingHistoryUpdates.length} yeni kayıt)`);
      }
      
      // Bekleyen güncellemeleri temizle
      pendingHistoryUpdates = [];
    });
  });
}

// Geçmiş güncellemelerini planla
function scheduleHistoryUpdate() {
  if (historyUpdateTimer) {
    clearTimeout(historyUpdateTimer);
  }
  
  historyUpdateTimer = setTimeout(() => {
    commitHistoryUpdates();
  }, HISTORY_UPDATE_DELAY);
}

// Debug modu için yardımcı fonksiyon
function debugLog(...args) {
  if (settings.debugMode) {
    console.log(`[WhatsApp Tracker Debug]`, ...args);
    
    // Debug bildirimi göster (ancak ekranda aynı anda sadece sınırlı sayıda gösterilsin)
    if (args.length > 0 && typeof args[0] === 'string' && activeDebugNotifications < MAX_DEBUG_NOTIFICATIONS) {
      activeDebugNotifications++;
      
      const debugEl = document.createElement('div');
      debugEl.className = 'wat-debug-notification';
      debugEl.textContent = args.join(' ');
      debugEl.style.cssText = 'position: fixed; bottom: ' + (10 + (activeDebugNotifications * 40)) + 'px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 8px 12px; border-radius: 5px; z-index: 9999; max-width: 80%; font-size: 12px;';
      document.body.appendChild(debugEl);
      
      setTimeout(() => {
        if (debugEl.parentNode) {
          debugEl.parentNode.removeChild(debugEl);
          activeDebugNotifications--;
        }
      }, 3000);
    }
  }
}

// Uygulama başlangıcı
function init() {
  debugLog('WhatsApp Online Tracker başlatılıyor...');
  
  // Kaydedilen kişileri ve ayarları yükle
  chrome.storage.sync.get(['trackedContacts', 'settings'], (data) => {
    // İzlenen kişileri al
    trackedContacts = data.trackedContacts || [];
    debugLog(`${trackedContacts.length} kişi yüklendi`);
    
    // Ayarları al ve uygula
    if (data.settings) {
      settings = { ...settings, ...data.settings };
      
      // Otomatik sohbet açma özelliği aktifse başlat
      if (settings.autoOpenChats) {
        startAutoOpenChats();
      }
    }
    
    // DOM gözlemcilerini başlat
    startObservers();
    
    // Periyodik tarama başlat
    startPeriodicCheck();
    
    // Browser konsola bilgi yaz
    console.log('WhatsApp Online Tracker v1.2 yüklendi');
    console.log(`İzlenen kişi sayısı: ${trackedContacts.length}`);
    console.log('Debug modu: ' + (settings.debugMode ? 'Aktif' : 'Kapalı'));
    console.log('Tarama aralığı: ' + settings.scanInterval + ' saniye');
    
    // CSS stil ekle
    addCustomStyles();
    
    // Sayfa yükleme durumunu logla
    debugLog(`Sayfa yükleme durumu: ${document.readyState}`);
  });
}

// Özel CSS stillerini ekle
function addCustomStyles() {
  const styles = `
    .wat-debug-notification {
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 5px;
      z-index: 9999;
      max-width: 80%;
      font-size: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      animation: wat-fade-in 0.3s ease;
    }
    
    @keyframes wat-fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

// DOM gözlemcilerini başlat
function startObservers() {
  debugLog('DOM gözlemcileri başlatılıyor...');
  
  try {
    // Tüm sayfa için global MutationObserver oluştur
    const bodyObserver = new MutationObserver((mutations) => {
      // Performans için throttling (çok fazla işlem olmaması için)
      if (isProcessingMutation) return;
      
      const currentTime = Date.now();
      if (currentTime - lastProcessTime < THROTTLE_DELAY) return;
      
      isProcessingMutation = true;
      lastProcessTime = currentTime;
      
      debugLog('Sayfa içeriğinde değişiklik tespit edildi');
      
      // Çevrimiçi durumları hemen kontrol et
      if (trackedContacts.length > 0) {
        setTimeout(() => {
          checkActiveChatForMessages();
          updateTrackedContactsStatus();
          manualScanForOnlineStatus();
          
          isProcessingMutation = false;
        }, 300);
      } else {
        isProcessingMutation = false;
      }
    });
    
    // Tüm sayfa değişikliklerini izle - performans için filtreleme eklendi
    bodyObserver.observe(document.body, { 
      childList: true, 
      subtree: true,
      characterData: false, // Metin değişikliklerini izleme (performans için)
      attributes: true,
      attributeFilter: ['title', 'data-testid'] // Sadece belirli öznitelikleri izle
    });
    
    // Sohbet listesi değişikliklerini gözlemle
    const chatList = document.querySelector(SELECTORS.chatList);
    if (chatList) {
      debugLog('Sohbet listesi gözlemcisi oluşturuluyor');
      chatListObserver = new MutationObserver(throttle((mutations) => {
        debugLog('Sohbet listesinde değişiklik tespit edildi');
        
        // Değişiklik olduysa çevrimiçi durumları kontrol et
        if (trackedContacts.length > 0) {
          setTimeout(() => {
            manualScanForOnlineStatus();
          }, 200);
        }
      }, THROTTLE_DELAY));
      
      chatListObserver.observe(chatList, { 
        childList: true, 
        subtree: true,
        characterData: false,
        attributes: true,
        attributeFilter: ['title']
      });
    } else {
      debugLog('Sohbet listesi bulunamadı, gözlemci oluşturulamadı');
    }
    
    // Aktif sohbet penceresini gözlemle
    const chatPane = document.querySelector(SELECTORS.chatPane);
    if (chatPane) {
      debugLog('Sohbet paneli gözlemcisi oluşturuluyor');
      chatPaneObserver = new MutationObserver(throttle((mutations) => {
        debugLog('Sohbet panelinde değişiklik tespit edildi');
        
        // Aktif sohbetteki değişiklikleri kontrol et
        setTimeout(() => {
          checkActiveChatForMessages();
        }, 200);
      }, THROTTLE_DELAY));
      
      chatPaneObserver.observe(chatPane, { 
        childList: true, 
        subtree: true,
        characterData: false,
        attributes: true
      });
    } else {
      debugLog('Sohbet paneli bulunamadı, gözlemci oluşturulamadı');
    }
    
    // Header değişikliklerini özel olarak izle
    const headerElements = document.querySelectorAll('header, div._2pr2H');
    for (const header of headerElements) {
      const headerObserver = new MutationObserver(throttle((mutations) => {
        debugLog('Header değişikliği tespit edildi');
        
        // Çevrimiçi durumunun hemen güncellenmesi için
        setTimeout(() => {
          checkActiveChatForMessages();
        }, 100);
      }, THROTTLE_DELAY));
      
      headerObserver.observe(header, { 
        childList: true, 
        subtree: true,
        characterData: false,
        attributes: true 
      });
    }
    
    // DOM'un yüklenmesini bekle, sonra periyodik taramayı başlat
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startPeriodicCheck();
      });
    } else {
      startPeriodicCheck();
    }
    
  } catch (error) {
    debugLog(`DOM gözlemcileri başlatılırken hata: ${error.message}`);
    // Hata olsa bile periyodik taramayı başlat
    startPeriodicCheck();
  }
}

// Throttle fonksiyonu - belirli bir süre içinde sadece bir kez çalışmasını sağlar
function throttle(func, delay) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

// Periyodik tarama başlat
function startPeriodicCheck() {
  debugLog('Periyodik tarama başlatılıyor...');
  
  // Eğer önceden oluşturulmuş bir tarama döngüsü varsa temizle
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  
  // Yeni tarama döngüsü oluştur - daha sık aralıklarla
  const intervalTime = Math.max(5, settings.scanInterval) * 1000; // ms cinsinden, minimum 5 saniye
  debugLog(`Tarama aralığı: ${intervalTime}ms (${settings.scanInterval} saniye)`);
  
  scanInterval = setInterval(() => {
    // Sayfa görünür değilse atla (enerji tasarrufu)
    if (document.hidden) {
      debugLog('Sayfa arkaplanda, tarama atlanıyor');
      return;
    }
    
    // Takip edilen kişi yoksa atla
    if (trackedContacts.length === 0) {
      return;
    }
    
    debugLog('Periyodik tarama gerçekleştiriliyor...');
    updateTrackedContactsStatus();
    checkActiveChatForMessages();
    manualScanForOnlineStatus();
    
  }, intervalTime);
  
  // Başlangıçta bir kez manuel tarama yap ve daha sonra da aralıklı olarak tekrarla (polling)
  setTimeout(() => {
    if (trackedContacts.length > 0) {
      debugLog('Başlangıç taraması yapılıyor...');
      manualScanForOnlineStatus();
      updateTrackedContactsStatus();
    }
  }, 2000);
  
  // Sayfanın görünür/gizli durumunu dinle
  document.addEventListener('visibilitychange', () => {
    // Sayfa görünür hale gelince hemen bir tarama yap
    if (!document.hidden && trackedContacts.length > 0) {
      debugLog('Sayfa görünür oldu, tarama yapılıyor...');
      updateTrackedContactsStatus();
      checkActiveChatForMessages();
      manualScanForOnlineStatus();
    }
  });
}

// Tüm sohbetleri tara
function scanAllChats() {
  debugLog('Tüm sohbetler taranıyor...');
  const chatItems = document.querySelectorAll(SELECTORS.chatItem);
  debugLog(`${chatItems.length} sohbet öğesi bulundu`);
  
  chatItems.forEach(chatItem => {
    const contactElement = chatItem.querySelector(SELECTORS.contactName);
    if (!contactElement) return;
    
    const name = contactElement.textContent.trim();
    const contact = trackedContacts.find(c => c.name === name);
    
    // Sadece izlenen kişileri kontrol et
    if (!contact) return;
    
    debugLog(`İzlenen kişi bulundu: ${name}`);
    
    // Çevrimiçi durumunu kontrol et
    checkOnlineStatus(contact);
    
    // "Yazıyor" durumunu kontrol et
    checkTypingStatus(contact);
  });
  
  // Verileri depola ve bildir
  updateTrackedContactsStatus();
}

// WhatsApp durumunu manuel olarak kontrol et
function manualScanForOnlineStatus() {
  debugLog("Manuel çevrimiçi tarama başlatılıyor...");
  
  // Sayfa arkaplanda ise veya izlenen kişi yoksa taramayı atla
  if (document.hidden || trackedContacts.length === 0) {
    debugLog("Sayfa arkaplanda veya izlenen kişi yok, tarama atlanıyor");
    return false;
  }
  
  try {
    // WhatsApp Web açık mı kontrol et
    if (!document.querySelector(SELECTORS.conversationHeader) && 
        !document.querySelector(SELECTORS.chatListContainer)) {
      debugLog("WhatsApp Web açık değil, tarama yapılmıyor");
      return false;
    }
    
    // Performans için sadece en gerekli elementleri tara
    let onlineElements = [];
    
    // 1. Yöntem: title özelliğinde "çevrimiçi" veya "online" geçen spanları bul
    const titleSpans = document.querySelectorAll('span[title*="online"], span[title*="çevrimiçi"]');
    for (const span of titleSpans) {
      onlineElements.push(span);
    }
    
    // 2. Yöntem: İçeriğinde "çevrimiçi" veya "online" geçen metni ara
    // Sadece belirli alanlarda ara - chatList ve conversationHeader
    let targetAreas = [];
    
    const chatList = document.querySelector(SELECTORS.chatList);
    if (chatList) targetAreas.push(chatList);
    
    const conversationHeader = document.querySelector(SELECTORS.conversationHeader);
    if (conversationHeader) targetAreas.push(conversationHeader);
    
    // Sadece ilgili alanlardaki span elementlerini kontrol et
    for (const area of targetAreas) {
      const spans = area.querySelectorAll('span[dir="auto"]');
      for (const span of spans) {
        const text = span.textContent.trim().toLowerCase();
        if (text.includes("çevrimiçi") || text.includes("online")) {
          onlineElements.push(span);
        }
      }
    }
    
    debugLog(`${onlineElements.length} adet çevrimiçi bildiren element bulundu`);
    
    if (onlineElements.length === 0) {
      // Çevrimiçi elementi bulunamadı, ama yazıyor durumunu kontrol etmeye devam edelim
    } else {
      // Bulunan çevrimiçi metinlerinin sahip olduğu kişi adlarını tespit et
      for (const onlineElement of onlineElements) {
        let contactName = findAssociatedContactName(onlineElement);
        
        if (contactName) {
          debugLog(`"${contactName}" için çevrimiçi durumu tespit edildi`);
          checkContactName(contactName, true); // Kesinlikle çevrimiçi
        }
      }
    }
    
    // Yazıyor durumlarını kontrol et - yeni eklenen kısım
    // 1. Sohbet listesindeki yazıyor durumlarını kontrol et
    checkTypingStatusInChatList();
    
    // 2. Aktif sohbetteki durumları kontrol et
    checkActiveChatForMessages();
    
    // 3. Her takip edilen kişi için ayrıca kontrol yap
    for (const contact of trackedContacts) {
      checkTypingStatus(contact);
    }
    
    return true;
  } catch (error) {
    debugLog(`Manuel tarama hatası: ${error.message}`);
    return false;
  }
}

// Online elementinin hangi kişiye ait olduğunu bul
function findAssociatedContactName(onlineElement) {
  // Önce element bir title içeriyor mu kontrol et
  const elementTitle = onlineElement.getAttribute('title');
  if (elementTitle) {
    // Title'dan kişi adını çıkarmayı dene
    const match = elementTitle.match(/^(.*?)\s+-\s+/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Ebeveyn elementlere doğru yukarı çık ve kişi adını bulmaya çalış
  let element = onlineElement;
  let maxLevels = 5; // En fazla 5 seviye yukarı bak
  
  while (element && maxLevels > 0) {
    // 1. Bu element veya yakın kardeşlerinden birinde contactName selector'üne uyan bir element var mı?
    if (element.parentElement) {
      const contactElements = element.parentElement.querySelectorAll(SELECTORS.contactName);
      for (const contactEl of contactElements) {
        const name = contactEl.textContent.trim();
        if (name && name.length > 1) {
          return name;
        }
      }
      
      // 2. Kardeş elementleri kontrol et
      const siblings = Array.from(element.parentElement.children);
      for (const sibling of siblings) {
        if (sibling === element) continue;
        
        // Kardeş elementin kendisini kontrol et
        const name = sibling.textContent?.trim();
        if (name && name.length > 2 && 
            !name.includes("çevrimiçi") && !name.includes("online") &&
            !name.includes("+") && !/^\d+$/.test(name)) {
          return name;
        }
        
        // Kardeş elementin alt elementlerini kontrol et
        const spans = sibling.querySelectorAll('span[dir="auto"]');
        for (const span of spans) {
          const text = span.textContent.trim();
          if (text && text.length > 1 && 
              !text.includes("çevrimiçi") && !text.includes("online") &&
              !text.includes("+") && !/^\d+$/.test(text)) {
            return text;
          }
        }
      }
    }
    
    // Bir seviye yukarı çık
    element = element.parentElement;
    maxLevels--;
  }
  
  return null;
}

// Aktif sohbeti kontrol et
function checkActiveChat() {
  const header = document.querySelector(SELECTORS.conversationHeader);
  if (!header) return null;
  
  // Headerda kişi adını bul
  let contactName = null;
  const nameElements = header.querySelectorAll(SELECTORS.contactName);
  
  for (const el of nameElements) {
    const name = el.textContent.trim();
    if (name && name.length > 1) {
      contactName = name;
      break;
    }
  }
  
  if (!contactName) return null;
  
  // Headerda çevrimiçi metnini ara
  const headerSpans = header.querySelectorAll('span');
  for (const span of headerSpans) {
    const text = span.textContent.trim().toLowerCase();
    if (text.includes('çevrimiçi') || text.includes('online')) {
      debugLog(`Aktif sohbette "${contactName}" çevrimiçi`);
      checkContactName(contactName, true); // Kesinlikle çevrimiçi
      return contactName;
    }
  }
  
  return contactName;
}

// Çevrimiçi durumunu kontrol et
function checkOnlineStatus(contact) {
  try {
    debugLog(`"${contact.name}" için çevrimiçi durumu kontrol ediliyor`);
    
    // Tüm olası çevrimiçi göstergelerini kontrol et
    let isOnline = false;
    const cleanContactName = contact.name.toLowerCase().trim();
    
    // 1. Metod: title özelliği içeren span elementlerini kontrol et (en güvenilir yöntem)
    const titleSpans = document.querySelectorAll('span[title]');
    for (const span of titleSpans) {
      const title = span.getAttribute('title') || '';
      if (!title) continue;
      
      // İsim + çevrimiçi durumu içeren title'lar
      if ((title.includes(contact.name) || contact.name.includes(title)) && 
           (title.includes('çevrimiçi') || title.includes('online'))) {
        debugLog(`Title özelliğinde "${contact.name}" için çevrimiçi durumu bulundu: "${title}"`);
        isOnline = true;
        break;
      }
    }
    
    // 2. Metod: Sohbet listesindeki çevrimiçi göstergeleri
    if (!isOnline) {
      const chatItems = document.querySelectorAll(SELECTORS.chatItem);
      
      for (const chatItem of chatItems) {
        let contactFound = false;
        
        // Önce kişiyi bul - birden fazla olası selektör dene
        const nameSelectors = [
          'div[data-testid="cell-frame-title"] span', 
          'span[dir="auto"][title]',
          'span.x1iyjqo2',
          'span._ccCW',
          'span.ggj6brxn',
          '.copyable-text'
        ];
        
        for (const selector of nameSelectors) {
          const nameElements = chatItem.querySelectorAll(selector);
          
          for (const nameEl of nameElements) {
            const name = nameEl.textContent.trim();
            const title = nameEl.getAttribute('title') || '';
            const nameToCheck = title || name;
            
            if (!nameToCheck) continue;
            
            if (nameToCheck.toLowerCase() === cleanContactName || 
                nameToCheck.toLowerCase().includes(cleanContactName) || 
                cleanContactName.includes(nameToCheck.toLowerCase())) {
              contactFound = true;
              break;
            }
          }
          
          if (contactFound) break;
        }
        
        // Kişiyi bulduk, çevrimiçi göstergesini ara
        if (contactFound) {
          debugLog(`Sohbet listesinde "${contact.name}" bulundu, çevrimiçi durumu kontrol ediliyor`);
          
          // Çevrimiçi/online metni ara - birden fazla olası konumda
          const secondaryElements = chatItem.querySelectorAll('div[data-testid="cell-frame-secondary"] span, span[dir="auto"]');
          
          for (const element of secondaryElements) {
            const text = element.textContent.trim().toLowerCase();
            const title = element.getAttribute('title') || '';
            
            if (text.includes("çevrimiçi") || text.includes("online") || 
                title.includes("çevrimiçi") || title.includes("online")) {
              debugLog(`"${contact.name}" için çevrimiçi durumu BULUNDU (Metod 2)`);
              isOnline = true;
              break;
            }
          }
        }
        
        if (isOnline) break;
      }
    }
    
    // 3. Metod: Aktif sohbetteki header kontrolü
    if (!isOnline) {
      // Header elementlerini kontrol et
      const headerElements = document.querySelectorAll(`${SELECTORS.conversationHeader} span`);
      let isActiveChat = false;
      
      // Kişi aktif sohbette mi kontrol et
      for (const element of headerElements) {
        const text = element.textContent.trim();
        if (!text) continue;
        
        if (text.toLowerCase() === cleanContactName || 
            text.toLowerCase().includes(cleanContactName) || 
            cleanContactName.includes(text.toLowerCase())) {
          debugLog(`"${contact.name}" aktif sohbette bulundu, header kontrol ediliyor`);
          isActiveChat = true;
          break;
        }
      }
      
      // Aktif sohbetteyse header'da çevrimiçi bilgisini ara
      if (isActiveChat) {
        // Header'ın tüm içeriğini kontrol et
        const headerContent = Array.from(headerElements)
          .map(el => {
            return { 
              text: el.textContent.trim().toLowerCase(),
              title: el.getAttribute('title') || ''
            };
          });
          
        for (const content of headerContent) {
          if (content.text.includes('çevrimiçi') || content.text.includes('online') ||
              content.title.includes('çevrimiçi') || content.title.includes('online')) {
            debugLog(`"${contact.name}" için çevrimiçi durumu BULUNDU (Metod 3)`);
            isOnline = true;
            break;
          }
        }
      }
    }
    
    // 4. Metod: Sayfa genelinde çevrimiçi durumu bilgisi ara
    if (!isOnline) {
      // "çevrimiçi" veya "online" içeren tüm span elementlerini bul
      const onlineTexts = [
        'çevrimiçi', 
        'online', 
        'çevrim içi', 
        'şu anda aktif'
      ];
      
      const allSpans = document.querySelectorAll('span[dir="auto"], div[dir="auto"], span.l7jjieqr');
      
      for (const span of allSpans) {
        const text = span.textContent.trim().toLowerCase();
        const title = span.getAttribute('title') || '';
        
        // Çevrimiçi metni içeren bir span bulunduysa
        if (onlineTexts.some(term => text.includes(term) || title.includes(term))) {
          // Bu span'ın etrafında kişi adını ara
          let parent = span.parentElement;
          let searchDepth = 4; // İç içe 4 seviye yukarı bak
          
          while (parent && searchDepth > 0) {
            // Bu element içindeki tüm metinleri kontrol et
            const parentText = parent.textContent.toLowerCase();
            if (parentText.includes(cleanContactName)) {
              debugLog(`"${contact.name}" için çevrimiçi durumu BULUNDU (Metod 4)`);
              isOnline = true;
              break;
            }
            
            // Kardeş elementleri kontrol et
            if (parent.parentElement) {
              const siblings = Array.from(parent.parentElement.children);
              for (const sibling of siblings) {
                if (sibling === parent) continue;
                
                const siblingText = sibling.textContent.toLowerCase();
                if (siblingText.includes(cleanContactName)) {
                  debugLog(`"${contact.name}" için çevrimiçi durumu BULUNDU (Metod 4 - kardeş element)`);
                  isOnline = true;
                  break;
                }
              }
            }
            
            // Bir üst seviyeye çık
            parent = parent.parentElement;
            searchDepth--;
          }
          
          if (isOnline) break;
        }
      }
    }
    
    // 5. Metod: DOM yapısında title ve aria-label özelliklerini kontrol et
    if (!isOnline) {
      const elementsWithAttributes = document.querySelectorAll('[title], [aria-label]');
      
      for (const element of elementsWithAttributes) {
        const title = element.getAttribute('title') || '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        
        if ((title.includes(contact.name) || ariaLabel.includes(contact.name)) && 
             (title.includes('çevrimiçi') || title.includes('online') || 
             ariaLabel.includes('çevrimiçi') || ariaLabel.includes('online'))) {
          debugLog(`"${contact.name}" için çevrimiçi durumu attribute'da BULUNDU (Metod 5)`);
          isOnline = true;
          break;
        }
      }
    }
    
    // Yazıyor durumunu da kontrol et - yazıyorsa kesinlikle çevrimiçidir
    if (!isOnline && contact.typing) {
      debugLog(`"${contact.name}" yazıyor durumunda, bu yüzden çevrimiçi olarak işaretleniyor`);
      isOnline = true;
    }
    
    debugLog(`"${contact.name}" kişisinin durumu: ${isOnline ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI'}`);
    return isOnline;
    
  } catch (error) {
    debugLog(`Çevrimiçi durumu kontrol edilirken hata: ${error.message}`);
    return false;
  }
}

/**
 * Bir kişinin çevrimiçi durumunu günceller ve gerektiğinde bildirim gönderir
 * @param {Object} contact - Takip edilen kişi nesnesi
 * @param {boolean} isOnline - Kişinin çevrimiçi olup olmadığı
 * @param {boolean} isTyping - Kişinin yazıyor olup olmadığı (isteğe bağlı)
 * @returns {boolean} Bildirim gösterilip gösterilmediği
 */
function updateContactOnlineStatus(contact, isOnline, isTyping = false) {
  try {
    const currentTime = new Date().getTime();
    const contactKey = contact.id || contact.name;
    
    // Bildirim kontrol mekanizması
    // Son bildirimin ne zaman gönderildiğini takip ediyoruz
    if (!lastNotificationTimes[contactKey]) {
      lastNotificationTimes[contactKey] = {
        online: 0,
        offline: 0,
        typing: 0
      };
    }
    
    const lastNotified = lastNotificationTimes[contactKey];
    const NOTIFICATION_COOLDOWN = {
      online: 60000,   // Online bildirimlerini 1 dakika arayla gönder
      offline: 60000,  // Offline bildirimlerini 1 dakika arayla gönder
      typing: 30000    // Typing bildirimlerini 30 saniye arayla gönder
    };
    
    let shouldNotify = false;
    let notificationType = '';
    let statusChanged = false;
    
    // Yazıyor durumu kontrolü
    if (isTyping && !contact.typing) {
      contact.typing = true;
      contact.lastStatusChange = currentTime;
      statusChanged = true;
      
      // Yazıyor bildirimi için kontrol
      if (currentTime - lastNotified.typing > NOTIFICATION_COOLDOWN.typing) {
        shouldNotify = true;
        notificationType = 'typing';
        lastNotified.typing = currentTime;
      }
      
      debugLog(`"${contact.name}" yazıyor durumuna geçti`);
    } 
    else if (!isTyping && contact.typing) {
      contact.typing = false;
      contact.lastStatusChange = currentTime;
      statusChanged = true;
      debugLog(`"${contact.name}" yazma durumu bitti`);
    }
    
    // Çevrimiçi durumu kontrolü
    if (isOnline && !contact.online) {
      contact.online = true;
      contact.lastStatusChange = currentTime;
      statusChanged = true;
      
      // Çevrimiçi bildirimi için kontrol
      if (currentTime - lastNotified.online > NOTIFICATION_COOLDOWN.online) {
        shouldNotify = true;
        notificationType = 'online';
        lastNotified.online = currentTime;
      }
      
      debugLog(`"${contact.name}" çevrimiçi oldu`);
    } 
    else if (!isOnline && contact.online) {
      contact.online = false;
      contact.lastStatusChange = currentTime;
      statusChanged = true;
      
      // Çevrimdışı bildirimi için kontrol
      if (currentTime - lastNotified.offline > NOTIFICATION_COOLDOWN.offline) {
        shouldNotify = true;
        notificationType = 'offline';
        lastNotified.offline = currentTime;
      }
      
      debugLog(`"${contact.name}" çevrimdışı oldu`);
    }
    
    // Değişiklik varsa
    if (statusChanged) {
      // Storage güncellemesi planla
      pendingStorageUpdates.trackedContacts = true;
      scheduleStorageUpdate();
      
      // Historye ekle
    if (settings.saveHistory) {
        let status = isTyping ? 'typing' : (isOnline ? 'online' : 'offline');
      addToHistory({
        name: contact.name,
          status: status
        });
      }
      
      // Chrome'a bildir
      chrome.runtime.sendMessage({
        action: 'updateContactStatus',
        contact: contact
      });
      
      // Bildirim göster
      if (shouldNotify && settings.showNotifications) {
        let message = '';
        
        if (notificationType === 'online') {
          message = `${contact.name} şu anda çevrimiçi`;
        } else if (notificationType === 'offline') {
          message = `${contact.name} çevrimdışı oldu`;
        } else if (notificationType === 'typing') {
          message = `${contact.name} şu anda yazıyor...`;
        }
        
        if (message) {
          showNotification(message);
          return true; // Bildirim gösterildi
        }
      }
    }
    
    return false; // Bildirim gösterilmedi
  } catch (error) {
    debugLog(`Kişi durumu güncellenirken hata: ${error.message}`);
    return false;
  }
}

// Yazıyor durumunu kontrol et
function checkTypingStatus(contact) {
  try {
    const header = document.querySelector(SELECTORS.conversationHeader);
    if (!header) {
      return false;
    }

    // DOM yapısını debug et
    if (settings.debugMode) {
      debugLog("----------- YAZMA DURUMU DEBUG BAŞLANGICI -----------");
      debugLog(`Header HTML: ${header.outerHTML.substring(0, 300)}...`);
      
      // Tüm olası yazıyor elementlerini bul ve göster
      const typingElements = document.querySelectorAll('span[title*="yazıyor"], span[title*="typing"], span.x1iyjqo2');
      debugLog(`${typingElements.length} potansiyel yazıyor elementi bulundu`);
      
      for (let i = 0; i < typingElements.length; i++) {
        const el = typingElements[i];
        debugLog(`[${i}] Yazıyor element: ${el.outerHTML}`);
        debugLog(`[${i}] Text: "${el.textContent}" Title: "${el.getAttribute('title') || 'yok'}" Class: "${el.className}"`);
      }
      
      // Header'daki tüm spanları incele
      const allHeaderSpans = header.querySelectorAll('span');
      debugLog(`Header içinde ${allHeaderSpans.length} span bulundu`);
      
      for (let i = 0; i < allHeaderSpans.length; i++) {
        const span = allHeaderSpans[i];
        debugLog(`Header span[${i}]: "${span.textContent}" - Class: "${span.className}" - Title: "${span.getAttribute('title') || 'yok'}"`);
      }
      
      debugLog("----------- YAZMA DURUMU DEBUG SONU -----------");
    }
    
    // 2. Adım: Aktif sohbetteki kişi adını bul
    const headerSpans = header.querySelectorAll('span');
    let headerContactName = null;
    
    for (const span of headerSpans) {
      const text = span.textContent.trim();
      
      // Durum metinlerini içermeyen kişi adını bul
      if (text && text.length >= 2 && 
          !text.toLowerCase().includes("yazıyor") && 
          !text.toLowerCase().includes("typing") && 
          !text.toLowerCase().includes("çevrimiçi") && 
          !text.toLowerCase().includes("online")) {
        headerContactName = text;
        debugLog(`Aktif sohbette kişi adı bulundu: "${headerContactName}"`);
        break;
      }
    }
    
    if (!headerContactName) {
      debugLog(`Aktif sohbette kişi adı bulunamadı`);
      return false;
    }
    
    // 3. Adım: Bu bizim takip ettiğimiz kişi mi?
    const cleanContactName = contact.name.toLowerCase().trim();
    const cleanHeaderName = headerContactName.toLowerCase().trim();
    
    const isActiveChat = 
      cleanHeaderName === cleanContactName || 
      (cleanHeaderName.includes(cleanContactName) && cleanContactName.length > 2) ||
      (cleanContactName.includes(cleanHeaderName) && cleanHeaderName.length > 2);
    
    if (!isActiveChat) {
      debugLog(`"${contact.name}" aktif sohbette değil, yazıyor durumu kontrol edilmiyor`);
      return false;
    }
    
    debugLog(`"${contact.name}" aktif sohbette, yazıyor durumu kontrol ediliyor`);
    
    // 4. Adım: ÇOKLU YÖNTEMLERLE yazıyor durumunu tespit et
    let isTyping = false;
    
    // Yöntem 1: Doğrudan metin içeriğini kontrol et
    const headerText = header.textContent.toLowerCase();
    if (headerText.includes("yazıyor") || headerText.includes("typing")) {
      debugLog(`Yöntem 1: Header metni "yazıyor" kelimesini içeriyor`);
      isTyping = true;
    }
    
    // Yöntem 2: title özelliği olan spanları kontrol et
    if (!isTyping) {
      const typingSpans = document.querySelectorAll('span[title*="yazıyor"], span[title*="typing"]');
      
      for (const span of typingSpans) {
        debugLog(`Yöntem 2: "yazıyor" title'ı olan span bulundu: "${span.textContent}" (${span.className})`);
        
        // Span'ın header içinde veya yakınında olup olmadığını kontrol et
        let isRelatedToHeader = false;
        let parent = span.parentElement;
        let depth = 0;
        
        while (parent && depth < 5) {
          if (parent === header || parent.contains(header) || header.contains(parent)) {
            isRelatedToHeader = true;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
        
        if (isRelatedToHeader) {
          debugLog(`Yöntem 2: Span header ile ilişkili, yazıyor durumu tespit edildi`);
          isTyping = true;
          break;
        }
      }
    }
    
    // Yöntem 3: Bilinen özel CSS sınıflarını kontrol et
    if (!isTyping) {
      // WhatsApp'ın "yazıyor" durumu için kullandığı özel CSS sınıflarını kontrol et
      const specialClassSpans = document.querySelectorAll('span.x1iyjqo2.x1n2onr6.x1lliihq.x6ikm8r.x10wlt62, span.ggj6brxn.gfz4du6o.r7fjleex.lhj4utae.le5p0ye3');
      
      for (const span of specialClassSpans) {
        const spanText = span.textContent.toLowerCase();
        debugLog(`Yöntem 3: Özel CSS sınıflı span bulundu: "${spanText}" (${span.className})`);
        
        if (spanText.includes("yazıyor") || spanText.includes("typing")) {
          // Bu spanın aktif sohbetle ilişkili olup olmadığını kontrol et
          let isInActiveChat = false;
          let parent = span.parentElement;
          let depth = 0;
          
          while (parent && depth < 5) {
            if (parent === header || parent.contains(header) || header.contains(parent)) {
              isInActiveChat = true;
              break;
            }
            parent = parent.parentElement;
            depth++;
          }
          
          if (isInActiveChat) {
            debugLog(`Yöntem 3: Özel CSS sınıflı span aktif sohbetle ilişkili, yazıyor durumu tespit edildi`);
            isTyping = true;
            break;
          }
        }
      }
    }
    
    // Yöntem 4: x10wlt62 sınıfı olan spanları kontrol et (WhatsApp'ta durum metinleri genellikle bu sınıfı kullanır)
    if (!isTyping) {
      const statusSpans = document.querySelectorAll('span.x10wlt62, span.xlyipyv, span.xuxw1ft, span._ccCW, span.ggj6brxn, span._3-cMa');
      
      for (const span of statusSpans) {
        const spanText = span.textContent.toLowerCase();
        debugLog(`Yöntem 4: Durum sınıflı span bulundu: "${spanText}" (${span.className})`);
        
        if (spanText.includes("yazıyor") || spanText.includes("typing")) {
          // Bu spanın aktif sohbetle ilişkili olup olmadığını kontrol et
          let isInActiveChat = false;
          let parent = span.parentElement;
          let depth = 0;
          
          while (parent && depth < 5) {
            if (parent === header || parent.contains(header) || header.contains(parent)) {
              isInActiveChat = true;
              break;
            }
            parent = parent.parentElement;
            depth++;
          }
          
          if (isInActiveChat) {
            debugLog(`Yöntem 4: Durum sınıflı span aktif sohbetle ilişkili, yazıyor durumu tespit edildi`);
            isTyping = true;
            break;
          }
        }
      }
    }
    
    // Son durumu işle
    const contactId = contact.id || contact.name;
    const now = Date.now();
    const lastTypingTime = lastTypingStatuses[contactId] || 0;
    const TYPING_THROTTLE = 5000; // 5 saniye içinde en fazla bir yazıyor bildirimi
    
    if (isTyping) {
      debugLog(`"${contact.name}" şu anda YAZIYOR!`);
      
      // Eğer geçmişe kaydetme etkinse ve son yazıyor olayından bu yana yeterli zaman geçtiyse
      if (settings.saveHistory && 
          (!contact.typing || // Daha önce yazıyor değilse her zaman kaydet
          (now - lastTypingTime) > TYPING_THROTTLE)) { // Son yazıyor olayından yeterli zaman geçtiyse kaydet
        
        // Bu durumu geçmişe doğrudan ekle
        debugLog(`"${contact.name}" için yazıyor durumu geçmişe ekleniyor...`);
        
        // Geçmişi doğrudan oku ve güncelle
        chrome.storage.local.get(['history'], function(data) {
          let history = data.history || [];
          
          // Yeni kaydı ekle
          const record = {
            name: contact.name,
            status: 'typing',
            timestamp: now,
            time: new Date().toISOString()
          };
          
          // Geçmişin başına ekle
          history.unshift(record);
          
          // Maksimum 1000 kayıt tut
          if (history.length > 1000) {
            history = history.slice(0, 1000);
          }
          
          // Geçmişi kaydet
          chrome.storage.local.set({ history }, function() {
            if (chrome.runtime.lastError) {
              debugLog(`Yazıyor durumu geçmişe kaydedilirken hata: ${chrome.runtime.lastError.message}`);
            } else {
              debugLog(`"${contact.name}" yazıyor durumu başarıyla geçmişe kaydedildi`);
              // Son yazıyor zamanını güncelle
              lastTypingStatuses[contactId] = now;
            }
          });
        });
      }
      
      // Geçmişe ekle ve bildirimleri göster (eğer yeni bir yazıyor olayı ise)
      if (!contact.typing) {
        contact.typing = true;
        contact.lastStatusChange = now;
        
        // Bildirim göster
        if (settings.showNotifications) {
          showNotification(`${contact.name} şu anda yazıyor...`);
        }
        
        // Chrome'a bildir
        chrome.runtime.sendMessage({
          action: 'updateContactStatus',
          contact: contact
        });
        
        // Storage güncellemesi planla
        pendingStorageUpdates.trackedContacts = true;
        scheduleStorageUpdate();
      }
      
      return true;
    } else {
      // Yazıyor durumundan çıktıysa
      if (contact.typing) {
        debugLog(`"${contact.name}" artık yazmıyor`);
        contact.typing = false;
        contact.lastStatusChange = now;
        
        // Chrome'a bildir
        chrome.runtime.sendMessage({
          action: 'updateContactStatus',
          contact: contact
        });
        
        // Storage güncellemesi planla
        pendingStorageUpdates.trackedContacts = true;
        scheduleStorageUpdate();
      }
      
      return false;
    }
  } catch (error) {
    debugLog(`Yazıyor durumu kontrol edilirken hata: ${error.message}`);
    return false;
  }
}

// Aktif sohbetteki mesajları kontrol et
function checkActiveChatForMessages() {
  try {
    // Aktif sohbetin başlığını kontrol et
    const header = document.querySelector(SELECTORS.conversationHeader);
    if (!header) {
      debugLog("Aktif sohbet başlığı bulunamadı");
      return;
    }
    
    // DOM yapısını debug et (sadece debug modunda)
    if (settings.debugMode) {
      debugLog("---- AKTIF SOHBET DEBUG BAŞLANGICI ----");
      debugLog(`Header HTML: ${header.outerHTML.substring(0, 300)}...`);
      
      // Tüm olası yazıyor elementlerini bul ve göster
      const typingElements = document.querySelectorAll('span[title*="yazıyor"], span[title*="typing"], span.x1iyjqo2');
      debugLog(`${typingElements.length} potansiyel yazıyor elementi bulundu`);
      
      for (let i = 0; i < Math.min(typingElements.length, 5); i++) {
        const el = typingElements[i];
        debugLog(`[${i}] Yazıyor element: ${el.outerHTML}`);
        debugLog(`[${i}] Text: "${el.textContent}" Title: "${el.getAttribute('title') || 'yok'}" Class: "${el.className}"`);
      }
      
      // Header'daki tüm spanları incele
      const allHeaderSpans = header.querySelectorAll('span');
      debugLog(`Header içinde ${allHeaderSpans.length} span bulundu`);
      
      for (let i = 0; i < Math.min(allHeaderSpans.length, 10); i++) {
        const span = allHeaderSpans[i];
        debugLog(`Header span[${i}]: "${span.textContent}" - Class: "${span.className}" - Title: "${span.getAttribute('title') || 'yok'}"`);
      }
      
      debugLog("---- AKTIF SOHBET DEBUG SONU ----");
    }
    
    const headerSpans = header.querySelectorAll('span');
    let activeChatName = null;
    
    // 1. Adım: Sohbet başlığını bul - sadece temiz kişi adını bul
    for (const span of headerSpans) {
      const text = span.textContent.trim();
      
      // Durum metinlerini içermeyen kişi adını bul
      if (text && text.length >= 2 && 
          !text.toLowerCase().includes("yazıyor") && 
          !text.toLowerCase().includes("typing") && 
          !text.toLowerCase().includes("çevrimiçi") && 
          !text.toLowerCase().includes("online")) {
        activeChatName = text;
        debugLog(`Aktif sohbet adı: "${activeChatName}"`);
        break;
      }
    }
    
    if (!activeChatName) {
      debugLog("Aktif sohbet adı bulunamadı");
      return;
    }
    
    // 2. Adım: Bu takip listemizdeki bir kişi mi?
    const trackedContact = trackedContacts.find(c => {
      const cleanTrackName = c.name.toLowerCase().trim();
      const cleanActiveName = activeChatName.toLowerCase().trim();
      
      return cleanTrackName === cleanActiveName || 
             (cleanTrackName.includes(cleanActiveName) && cleanActiveName.length > 2) ||
             (cleanActiveName.includes(cleanTrackName) && cleanTrackName.length > 2);
    });
    
    if (!trackedContact) {
      debugLog(`Aktif sohbetteki "${activeChatName}" takip listesinde değil`);
      return;
    }
    
    debugLog(`Aktif sohbetteki kişi takip listesinde: "${trackedContact.name}"`);
    
    // 3. Adım: Çevrimiçi durumunu kontrol et
    const headerText = header.textContent.toLowerCase();
    
    // Çevrimiçi mi?
    if (headerText.includes("çevrimiçi") || headerText.includes("online")) {
      debugLog(`"${trackedContact.name}" şu anda ÇEVRİMİÇİ! (aktif sohbet)`);
      updateContactOnlineStatus(trackedContact, true);
    }
    
    // 4. Adım: ÇOKLU YÖNTEMLERLE yazıyor durumunu tespit et
    let isTyping = false;
    
    // Yöntem 1: Doğrudan metin içeriğini kontrol et
    if (headerText.includes("yazıyor") || headerText.includes("typing")) {
      debugLog(`Yöntem 1: Header metni "yazıyor" kelimesini içeriyor`);
      isTyping = true;
    }
    
    // Yöntem 2: title özelliği olan spanları kontrol et
    if (!isTyping) {
      const typingSpans = document.querySelectorAll('span[title*="yazıyor"], span[title*="typing"]');
      
      for (const span of typingSpans) {
        debugLog(`Yöntem 2: "yazıyor" title'ı olan span bulundu: "${span.textContent}" (${span.className})`);
        
        // Span'ın header içinde veya yakınında olup olmadığını kontrol et
        let isRelatedToHeader = false;
        let parent = span.parentElement;
        let depth = 0;
        
        while (parent && depth < 5) {
          if (parent === header || parent.contains(header) || header.contains(parent)) {
            isRelatedToHeader = true;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
        
        if (isRelatedToHeader) {
          debugLog(`Yöntem 2: Span header ile ilişkili, yazıyor durumu tespit edildi`);
          isTyping = true;
          break;
        }
      }
    }
    
    // Yöntem 3: Bilinen özel CSS sınıflarını kontrol et
    if (!isTyping) {
      // WhatsApp'ın "yazıyor" durumu için kullandığı özel CSS sınıflarını kontrol et
      const specialClassSpans = document.querySelectorAll('span.x1iyjqo2.x1n2onr6.x1lliihq.x6ikm8r.x10wlt62, span.xlyipyv.xuxw1ft');
      
      for (const span of specialClassSpans) {
        const spanText = span.textContent.toLowerCase();
        debugLog(`Yöntem 3: Özel CSS sınıflı span bulundu: "${spanText}" (${span.className})`);
        
        if (spanText.includes("yazıyor") || spanText.includes("typing")) {
          // Bu spanın aktif sohbetle ilişkili olup olmadığını kontrol et
          let isInActiveChat = false;
          let parent = span.parentElement;
          let depth = 0;
          
          while (parent && depth < 5) {
            if (parent === header || parent.contains(header) || header.contains(parent)) {
              isInActiveChat = true;
              break;
            }
            parent = parent.parentElement;
            depth++;
          }
          
          if (isInActiveChat) {
            debugLog(`Yöntem 3: Özel CSS sınıflı span aktif sohbetle ilişkili, yazıyor durumu tespit edildi`);
            isTyping = true;
            break;
          }
        }
      }
    }
    
    // Herhangi bir yöntemle yazıyor durumu tespit edildiyse
    if (isTyping) {
      debugLog(`"${trackedContact.name}" şu anda YAZIYOR! (aktif sohbet)`);
      
      if (!trackedContact.typing) {
        // Yazıyor durumunu güncelle
        trackedContact.typing = true;
        trackedContact.lastStatusChange = new Date().getTime();
        
        // "Yazıyor" durumunu geçmişe ekle
        if (settings.saveHistory) {
          addToHistory({
            name: trackedContact.name,
            status: 'typing'
          });
        }
        
        // Bildirim göster
        if (settings.showNotifications) {
          showNotification(`${trackedContact.name} şu anda yazıyor...`);
        }
        
        // Chrome'a bildir
        chrome.runtime.sendMessage({
          action: 'updateContactStatus',
          contact: trackedContact
        });
        
        // Storage güncellemesi planla
        pendingStorageUpdates.trackedContacts = true;
        scheduleStorageUpdate();
      }
    } else if (trackedContact.typing) {
      // Yazma durumu sona erdi
      trackedContact.typing = false;
      trackedContact.lastStatusChange = new Date().getTime();
      
      // Chrome'a bildir
      chrome.runtime.sendMessage({
        action: 'updateContactStatus',
        contact: trackedContact
      });
      
      // Storage güncellemesi planla
      pendingStorageUpdates.trackedContacts = true;
      scheduleStorageUpdate();
    }
  } catch (error) {
    debugLog(`Aktif sohbet kontrol edilirken hata: ${error.message}`);
  }
}

// İzlenen kişilerin durumunu güncelle
function updateTrackedContactsStatus() {
  try {
    if (trackedContacts.length > 0) {
      debugLog(`${trackedContacts.length} kişinin durumu güncelleniyor...`);
      
      let hasChanges = false;
      
      // Her kişi için durumu kontrol et
      for (let i = 0; i < trackedContacts.length; i++) {
        const contact = trackedContacts[i];
        const previousStatus = {
          online: contact.online,
          typing: contact.typing
        };
        
        // Çevrimiçi ve yazıyor durumlarını kontrol et
        const isOnline = checkOnlineStatus(contact);
        const isTyping = checkTypingStatus(contact);
        
        // Durumları güncelle
        if (previousStatus.online !== isOnline) {
          updateContactOnlineStatus(contact, isOnline);
          hasChanges = true;
        }
        
        // Yazıyor durumunu güncelle
        if (previousStatus.typing !== isTyping) {
          contact.typing = isTyping;
          contact.lastStatusChange = Date.now();
          hasChanges = true;
          
          // "Yazıyor" durumunu geçmişe ekle
          if (settings.saveHistory) {
            addToHistory({
              name: contact.name,
              status: 'typing'
            });
          }
          
          if (settings.showNotifications && isTyping) {
            showNotification(`${contact.name} yazıyor...`);
          }
          
          // Yazıyorsa, kesinlikle çevrimiçidir
          if (isTyping && !contact.online) {
            updateContactOnlineStatus(contact, true);
          }
          
          // Chrome'a bildir
          chrome.runtime.sendMessage({
            action: 'updateContactStatus',
            contact: contact
          });
        }
      }
      
      // Sadece değişiklik olduysa storage güncellemesi planla
      if (hasChanges) {
        pendingStorageUpdates.trackedContacts = true;
        scheduleStorageUpdate();
      }
    }
  } catch (error) {
    debugLog(`Kişi durumları güncellenirken hata: ${error.message}`);
  }
}

// Geçmişe ekle
function addToHistory(entry) {
  try {
    if (!settings.saveHistory) return;
    
    // Tarih bilgisi ekle
    entry.timestamp = new Date().getTime();
    entry.time = new Date().toISOString(); // Geriye uyumluluk için
    
    // Yeni kayıt için log ekle
    debugLog(`Geçmişe kaydedilecek: ${entry.name} - ${entry.status} durumu`);
    
    // Hata ayıklama ve eksik veri kontrolü
    if (!entry.name || !entry.status) {
      debugLog(`HATA: Eksik veri ile geçmiş kaydı! İsim: ${entry.name}, Durum: ${entry.status}`);
      return;
    }
    
    // Özel koşul: 'typing' durumu için doğrudan ve hızlı kaydetme
    if (entry.status === 'typing') {
      debugLog(`Yazıyor durumu için özel kaydedici kullanılıyor`);
      
      // Geçmişi doğrudan oku ve güncelle
      chrome.storage.local.get(['history'], function(data) {
        let history = data.history || [];
        
        // Yeni kaydı ekle
        history.unshift(entry);
        
        // Maksimum 1000 kayıt tut
        if (history.length > 1000) {
          history = history.slice(0, 1000);
        }
        
        // Geçmişi kaydet
        chrome.storage.local.set({ history }, function() {
          if (chrome.runtime.lastError) {
            debugLog(`Yazıyor durumu geçmişe kaydedilirken hata: ${chrome.runtime.lastError.message}`);
          } else {
            debugLog(`"${entry.name}" yazıyor durumu başarıyla geçmişe kaydedildi`);
          }
        });
      });
      
      return; // Yazma durumları için normal akışı atla
    }
    
    // Geçici buffer'a ekle, toplu kayıt için
    newHistoryItems.unshift(entry);
    
    // Bekleyen geçmiş güncellemelerine ekle
    pendingHistoryUpdates.push({
      name: entry.name,
      status: entry.status,
      timestamp: entry.timestamp,
      time: entry.time
    });
    
    // Geçmiş güncelleme bayrağını ayarla
    pendingStorageUpdates.history = true;
    
    // Chrome storage.local'a kaydetmeyi planla
    chrome.storage.local.get(['history'], function(data) {
      let history = data.history || [];
      
      // Yeni kaydı en başa ekle
      history.unshift({
        name: entry.name,
        status: entry.status,
        timestamp: entry.timestamp,
        time: entry.time
      });
      
      // Maksimum 1000 kayıt tut
      if (history.length > 1000) {
        history = history.slice(0, 1000);
      }
      
      // Geçmişi kaydet
      chrome.storage.local.set({ history }, function() {
        if (chrome.runtime.lastError) {
          debugLog(`Geçmiş kaydedilirken hata: ${chrome.runtime.lastError.message}`);
        } else {
          debugLog(`Geçmiş başarıyla kaydedildi: ${entry.name} - ${entry.status}`);
        }
      });
    });
    
    // Güncellemeyi zamanla - hızlı geçmiş güncellemesi için
    scheduleStorageUpdate();
    scheduleHistoryUpdate();
    
  } catch (error) {
    debugLog(`Geçmişe eklerken hata: ${error.message}`);
  }
}

// Bildirim göster
function showNotification(message) {
  debugLog(`Bildirim: ${message}`);
  
  // İçerik bildirimlerini göster (in-page)
  const notificationEl = document.createElement('div');
  notificationEl.className = 'wat-notification';
  notificationEl.textContent = message;
  document.body.appendChild(notificationEl);
  
  // 5 saniye sonra kaldır
  setTimeout(() => {
    if (notificationEl.parentNode) {
      notificationEl.parentNode.removeChild(notificationEl);
    }
  }, 5000);
  
  // Tarayıcı bildirimleri
  chrome.runtime.sendMessage({
    action: 'showNotification',
    title: 'WhatsApp Online Takip',
    message: message
  });
}

// Sohbet listesi değiştiğinde
function onChatListMutation(mutations) {
  debugLog('Sohbet listesi değişti, yeniden tarama yapılıyor');
  // İzlenen kişilerde değişiklik oldu mu diye kontrol et
  scanAllChats();
}

// Sohbet bölmesi değiştiğinde
function onChatPaneMutation(mutations) {
  debugLog('Sohbet bölmesi değişti, aktif sohbet kontrol ediliyor');
  // Aktif sohbette yeni mesajlar var mı diye kontrol et
  checkActiveChatForMessages();
}

// Yeni kişi ekle
function addCurrentContactToTracked() {
  try {
    // Aktif sohbetin başlığını kontrol et
    const headerElements = document.querySelectorAll(`${SELECTORS.conversationHeader} span`);
    let contactName = null;
    
    // İlk iki span elementinin içeriğini kontrol et (genellikle kişi adı burada olur)
    for (let i = 0; i < Math.min(2, headerElements.length); i++) {
      const text = headerElements[i].textContent.trim();
      debugLog(`Header element içeriği: "${text}"`);
      
      if (text && text.length > 0 && !text.includes("çevrimiçi") && !text.includes("online")) {
        contactName = text;
        debugLog(`Olası kişi adı bulundu: "${contactName}"`);
        break;
      }
    }
    
    if (!contactName) {
      debugLog("Aktif sohbette kişi adı bulunamadı");
      return false;
    }
    
    debugLog(`Takip listesine eklenecek kişi: "${contactName}"`);
    
    // Zaten listede mi kontrol et
    if (trackedContacts.some(c => c.name === contactName)) {
      debugLog(`"${contactName}" zaten takip listesinde`);
      alert(`"${contactName}" zaten takip listesinde.`);
      return false;
    }
    
    // Yeni kişi oluştur
  const newContact = {
    id: Date.now().toString(),
      name: contactName,
    online: false,
    typing: false,
    lastStatusChange: null
  };
  
    // Takip listesine ekle
  trackedContacts.push(newContact);
  
    // Storage güncellemesi planla
    pendingStorageUpdates.trackedContacts = true;
    
    // Kaydet ve bildir
    scheduleStorageUpdate();
    
    debugLog(`"${contactName}" takip listesine eklendi`);
    alert(`"${contactName}" takip listesine eklendi.`);
    
    // Popup'a bildir
    chrome.runtime.sendMessage({
      action: 'contactAdded',
      contact: newContact
    });
    
    return true;
  } catch (error) {
    debugLog(`Kişi eklenirken hata: ${error.message}`);
    return false;
  }
}

// Mesaj dinleyicisi
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog(`Mesaj alındı: ${JSON.stringify(message)}`);
  
  switch (message.action) {
    case 'addCurrentContact':
    const result = addCurrentContactToTracked();
      sendResponse({ success: result });
      break;
      
    case 'verifyContact':
      debugLog(`"${message.contactName}" kişisi doğrulanıyor...`);
      try {
        // VerifyContact Promise döndürebilir, o yüzden try-catch ile sarmalıyoruz
        const verifyResult = verifyContact(message.contactName);
        
        if (verifyResult instanceof Promise) {
          verifyResult
            .then(result => {
              debugLog(`Kişi doğrulama sonucu: ${JSON.stringify(result)}`);
    sendResponse(result);
            })
            .catch(error => {
              debugLog(`Kişi doğrulama hatası: ${error.message}`);
              // Hata durumunda olumsuz yanıt dön
              sendResponse({ exists: false, message: `Doğrulama hatası: ${error.message}` });
            });
          return true; // Asenkron yanıt için true döndürmeliyiz
        } else {
          // Doğrudan sonuç döndüyse hemen yanıt verelim
          debugLog(`Kişi doğrulama sonucu: ${JSON.stringify(verifyResult)}`);
          sendResponse(verifyResult);
        }
      } catch (error) {
        debugLog(`Kişi doğrulama hatası: ${error.message}`);
        // Hata durumunda olumsuz yanıt dön
        sendResponse({ exists: false, message: `Doğrulama hatası: ${error.message}` });
      }
      break;
      
    case 'updateTrackedContacts':
      trackedContacts = message.contacts;
      debugLog(`İzlenen kişiler güncellendi: ${trackedContacts.length} kişi`);
      
      // Storage güncellemesi planla
      pendingStorageUpdates.trackedContacts = true;
      scheduleStorageUpdate();
      
      sendResponse({ success: true });
      break;
      
    case 'setDebugMode':
      settings.debugMode = message.enabled;
      debugLog(`Debug modu ${settings.debugMode ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`);
      
      if (settings.debugMode) {
        // Debug modu aktifken DOM yapısını logla
        debugLog(`WhatsApp DOM yapısı inceleniyor...`);
        debugLog(`Sohbet listesi: ${document.querySelectorAll(SELECTORS.chatList).length}`);
        debugLog(`Sohbet öğeleri: ${document.querySelectorAll(SELECTORS.chatItem).length}`);
        
        // Browser console'a detaylı bilgi göster
        console.log('WhatsApp Online Tracker - Debug Bilgisi');
        console.log('Takip edilen kişiler:', trackedContacts);
        console.log('DOM Selektörleri:', SELECTORS);
      }
      
      // Settings güncellemesi planla
      pendingStorageUpdates.settings = true;
      scheduleStorageUpdate();
      
      sendResponse({ success: true });
      break;
      
    case 'updateSettings':
      // Güncellenen ayarları uygula
      if (message.settings) {
        const oldSettings = { ...settings };
        settings = { ...settings, ...message.settings };
        
        // Önceki ayarlar içinde autoOpenChats yoksa varsayılan değer ekle
        if (typeof settings.autoOpenChats === 'undefined') {
          settings.autoOpenChats = false;
        }
        
        // Önceki ayarlar içinde autoOpenInterval yoksa varsayılan değer ekle
        if (typeof settings.autoOpenInterval === 'undefined') {
          settings.autoOpenInterval = 180;
        }
        
        // Kontrol aralığı değiştiyse tarama işlemini yeniden başlat
        if (oldSettings.scanInterval !== settings.scanInterval) {
          debugLog(`Kontrol aralığı değişti: ${oldSettings.scanInterval} -> ${settings.scanInterval}`);
          
          // Periyodik taramayı yeniden başlat
          if (scanInterval) {
            clearInterval(scanInterval);
          }
          startPeriodicCheck();
        }
        
        // Debug modu değiştiyse bilgi mesajı göster
        if (oldSettings.debugMode !== settings.debugMode) {
          debugLog(`Debug modu değişti: ${oldSettings.debugMode} -> ${settings.debugMode}`);
        }
        
        // Otomatik sohbet açma durumu değiştiyse işlemi başlat/durdur
        if (oldSettings.autoOpenChats !== settings.autoOpenChats) {
          debugLog(`Otomatik sohbet açma değişti: ${oldSettings.autoOpenChats} -> ${settings.autoOpenChats}`);
          
          if (settings.autoOpenChats) {
            startAutoOpenChats();
          } else {
            stopAutoOpenChats();
          }
        }
        
        // Otomatik sohbet açma aralığı değiştiyse ve özellik aktifse yeniden başlat
        if (oldSettings.autoOpenInterval !== settings.autoOpenInterval && settings.autoOpenChats) {
          debugLog(`Otomatik sohbet açma aralığı değişti: ${oldSettings.autoOpenInterval} -> ${settings.autoOpenInterval}`);
          
          stopAutoOpenChats();
          startAutoOpenChats();
        }
        
        // Ayarları kaydet
        chrome.storage.sync.set({ settings });
      }
      
      sendResponse({ success: true });
      break;
      
    case 'getTrackedContacts':
      sendResponse({ contacts: trackedContacts });
      break;
      
    case 'manualScan':
      const scanResult = manualScanForOnlineStatus();
      sendResponse({ success: scanResult });
      break;
      
    case 'pageReload':
      cleanup();
      sendResponse({ success: true });
      break;
      
    case 'setAutoOpenChats':
      settings.autoOpenChats = message.enabled;
      settings.autoOpenInterval = message.interval || 180;
      debugLog(`Otomatik sohbet açma ${settings.autoOpenChats ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`);
      debugLog(`Otomatik sohbet açma aralığı: ${settings.autoOpenInterval} saniye`);

      // Ayarları kaydet
      chrome.storage.sync.set({settings}, () => {
        debugLog('Otomatik sohbet açma ayarları kaydedildi');
      });

      // Otomatik sohbet açma işlemini başlat veya durdur
      if (settings.autoOpenChats) {
        startAutoOpenChats();
      } else {
        stopAutoOpenChats();
      }
      
      sendResponse({ success: true });
      break;
        
    default:
      debugLog(`Bilinmeyen mesaj: ${message.action}`);
      sendResponse({ success: false, message: 'Bilinmeyen eylem' });
  }
  
  return true; // Chrome Manifest V3 için gerekli - asenkron işlemler için
});

// Yardımcı fonksiyon: Element bekle
function waitForElement(selector, callback) {
  const element = document.querySelector(selector);
  
  if (element) {
    callback(element);
    return element;
  }
  
  debugLog(`Bekleniyor: ${selector}`);
  
  const observer = new MutationObserver((mutations) => {
    const element = document.querySelector(selector);
    if (element) {
      debugLog(`Element bulundu: ${selector}`);
      observer.disconnect();
      callback(element);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  return null;
}

// DOM yükleme durumunu konsola yaz
debugLog(`Sayfa yükleme durumu: ${document.readyState}`);
debugLog("WhatsApp Online Tracker content script yüklendi");

// Sayfanın tam olarak yüklenmesini bekle
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 

// Kişinin WhatsApp'ta olup olmadığını kontrol et
function verifyContact(contactName) {
  debugLog(`"${contactName}" kişisi WhatsApp'ta var mı kontrol ediliyor...`);
  
  // Girdi kontrolü
  if (!contactName || contactName.trim() === '') {
    debugLog('Geçersiz kişi adı: Boş');
    return { exists: false, message: "Lütfen geçerli bir kişi adı girin" };
  }
  
  // Kişinin adını temizle
  const cleanName = contactName.trim();
  
  try {
    // 1. Sohbet listesinde arama yap
    debugLog(`Sohbet listesinde "${cleanName}" aranıyor...`);
    
    // Tüm olası kişi adı selektörleri
    const nameSelectors = [
      'div[data-testid="cell-frame-title"] span', 
      'span[dir="auto"][title]', 
      'span.x1iyjqo2.x6ikm8r.x10wlt62.x1n2onr6',
      'span._ccCW',
      'span.ggj6brxn',
      'span._11JPr',
      'span.selectable-text'
    ];
    
    // Tüm kişi öğeleri
    let foundContact = false;
    let foundName = '';
    
    // Tüm olası selektörlerle ara
    for (const selector of nameSelectors) {
      if (foundContact) break;
      
      const nameElements = document.querySelectorAll(selector);
      debugLog(`"${selector}" selektöründe ${nameElements.length} element bulundu`);
      
      for (const element of nameElements) {
        // title özelliğini veya metin içeriğini kontrol et
        const title = element.getAttribute('title') || '';
        const text = element.textContent.trim();
        
        const nameToCheck = title || text;
        if (!nameToCheck) continue;
        
        debugLog(`İsim karşılaştırması: "${nameToCheck}" <-> "${cleanName}"`);
        
        // Daha esnek eşleştirme kuralları
        if (nameToCheck.toLowerCase() === cleanName.toLowerCase() || 
            nameToCheck.toLowerCase().includes(cleanName.toLowerCase()) ||
            cleanName.toLowerCase().includes(nameToCheck.toLowerCase())) {
          foundContact = true;
          foundName = nameToCheck;
          debugLog(`"${cleanName}" sohbet listesinde bulundu: "${foundName}"`);
          break;
        }
      }
    }
    
    if (foundContact) {
      return { exists: true, foundName: foundName };
    }
    
    // 2. WhatsApp arama kutusunu kullan
    debugLog(`Arama kutusu açılıyor...`);
    
    return new Promise((resolve) => {
      // Her durumda yanıt verildiğinden emin olmak için zamanlayıcı
      const timeoutId = setTimeout(() => {
        debugLog(`Arama işlemi zaman aşımına uğradı`);
        resolve({ exists: false, message: "Arama zaman aşımına uğradı, kişi bulunamadı" });
      }, 5000);
      
      try {
        // Arama düğmesi için birden çok muhtemel selektör dene
        const searchButtonSelectors = [
          'div[data-testid="chat-list-search"]',
          'button[aria-label="Ara"]',
          'button[aria-label="Search"]',
          'span[data-icon="search"]',
          'span[data-testid="search"]',
          '[title="Ara"]',
          '[title="Search"]',
          'div.SgIJV',
          '.jScby.Iaqxu.FCS6Q',
          'button.vozwu7q2, div.vozwu7q2',
          'svg path[fill-rule="evenodd"]'
        ];
        
        let searchButton = null;
        
        // Tüm olası selektörleri dene
        for (const selector of searchButtonSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            // Düğmeyi veya kapsayıcısını bul
            let button = element;
            
            // SVG veya path ise, üst düğmeyi bulmaya çalış
            if (element.tagName === 'path' || element.tagName === 'svg') {
              let parent = element.parentElement;
              while (parent && parent.tagName !== 'BUTTON' && !parent.getAttribute('role') === 'button') {
                parent = parent.parentElement;
                if (!parent) break;
              }
              if (parent) button = parent;
            }
            
            // Arama simgesi veya düğmesi mi kontrol et
            const hasSearchIcon = button.querySelector('svg path[fill-rule="evenodd"]') || 
                                button.querySelector('svg[viewBox="0 0 24 24"]');
            
            if (hasSearchIcon || 
                button.getAttribute('aria-label') === 'Ara' ||
                button.getAttribute('aria-label') === 'Search') {
              searchButton = button;
              debugLog(`Arama düğmesi bulundu: ${button.tagName}`);
              break;
            }
          }
          if (searchButton) break;
        }
        
        // DOM'da direkt arama düğmesi bulunamadıysa, sidebarın üst kısmında ara
        if (!searchButton) {
          const headerElement = document.querySelector('#side header, #pane-side header, .nousyan3');
          if (headerElement) {
            const buttons = headerElement.querySelectorAll('button, div[role="button"]');
            for (const btn of buttons) {
              // İçinde arama ikonu varsa ya da görünür bir düğmeyse
              if (btn.querySelector('svg path[fill-rule="evenodd"]') || 
                  btn.getAttribute('aria-label') === 'Ara' || 
                  btn.getAttribute('aria-label') === 'Search') {
                searchButton = btn;
                debugLog('Arama düğmesi header içinde bulundu');
                break;
              }
            }
          }
        }
        
        if (searchButton) {
          searchButton.click();
          debugLog('Arama düğmesine tıklandı');
          
          // Arama kutusunun açılmasını bekle
          setTimeout(() => {
            try {
              // Arama input elemanı için birden fazla selektör dene
              const searchInputSelectors = [
                'div[data-testid="chat-list-search"] input', 
                'input[type="search"]',
                'input[type="text"]',
                'input.selectable-text',
                'div.copyable-text.selectable-text[contenteditable="true"]',
                'div[contenteditable="true"]',
                'div.selectable-text[contenteditable="true"]',
                'div.YT9MX'
              ];
              
              let searchInput = null;
              
              // Tüm olası selektörleri dene
              for (const selector of searchInputSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                  // Gerçekten bir arama kutusu mu kontrol et
                  if (element.getAttribute('contenteditable') === 'true' || 
                      element.tagName === 'INPUT') {
                    searchInput = element;
                    debugLog(`Arama giriş kutusu bulundu: ${element.tagName}`);
                    break;
                  }
                }
                if (searchInput) break;
              }
              
              if (searchInput) {
                // Arama metnini gir - farklı yöntemler dene
                searchInput.value = cleanName;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                // contenteditable div ise
                if (searchInput.getAttribute('contenteditable') === 'true') {
                  searchInput.textContent = cleanName;
                  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                  searchInput.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
                  
                  // DOM'u yeniden yazma ve focus olayları
                  const range = document.createRange();
                  const sel = window.getSelection();
                  range.setStart(searchInput.childNodes[0], cleanName.length);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
                  searchInput.focus();
                }
                
                debugLog(`"${cleanName}" araması yapılıyor...`);
                
                // Arama sonuçlarını bekle - daha uzun bir süre ver
                setTimeout(() => {
                  try {
                    // Yeni sohbet öğelerini tekrar kontrol et
                    const nameElements = [];
                    
                    // Tüm olası selektörlerle ara
                    for (const selector of nameSelectors) {
                      const elements = document.querySelectorAll(selector);
                      elements.forEach(el => nameElements.push(el));
                    }
                    
                    debugLog(`${nameElements.length} arama sonucu bulundu`);
                    
                    let found = false;
                    let foundName = '';
                    
                    for (const element of nameElements) {
                      // title özelliğini veya metin içeriğini kontrol et
                      const title = element.getAttribute('title') || '';
                      const text = element.textContent.trim();
                      
                      const nameToCheck = title || text;
                      if (!nameToCheck) continue;
                      
                      debugLog(`Sonuç: "${nameToCheck}"`);
                      
                      // Daha esnek eşleştirme
                      if (nameToCheck.toLowerCase() === cleanName.toLowerCase() || 
                          nameToCheck.toLowerCase().includes(cleanName.toLowerCase()) ||
                          cleanName.toLowerCase().includes(nameToCheck.toLowerCase())) {
                        found = true;
                        foundName = nameToCheck;
                        debugLog(`"${cleanName}" arama sonuçlarında bulundu: "${foundName}"`);
                        break;
                      }
                    }
                    
                    // Arama kutusunu kapatmaya çalış
                    try {
                      const closeButtonSelectors = [
                        'button[data-testid="back"]', 
                        'button[aria-label="Geri"]',
                        'button[aria-label="Back"]',
                        'span[data-icon="back"]',
                        'span[data-testid="back"]',
                        'button.vozwu7q2'
                      ];
                      
                      let closeButton = null;
                      
                      // Tüm olası selektörleri dene
                      for (const selector of closeButtonSelectors) {
                        const elements = document.querySelectorAll(selector);
                        for (const element of elements) {
                          // Geri düğmesi simgesi var mı kontrol et
                          const hasBackIcon = element.querySelector('svg path[d="M12"]');
                          if (hasBackIcon || 
                              element.getAttribute('aria-label') === 'Geri' ||
                              element.getAttribute('aria-label') === 'Back') {
                            closeButton = element;
                            debugLog(`Geri düğmesi bulundu: ${element.tagName}`);
                            break;
                          }
                        }
                        if (closeButton) break;
                      }
                      
                      if (closeButton) {
                        closeButton.click();
                        debugLog('Geri düğmesine tıklandı');
                      }
                    } catch (e) {
                      debugLog(`Arama kutusu kapatılamadı: ${e.message}`);
                    }
                    
                    clearTimeout(timeoutId);
                    
                    if (found) {
                      resolve({ exists: true, foundName: foundName });
                    } else {
                      // Kişi bulunamadı - gerçekten yok
                      debugLog(`"${cleanName}" WhatsApp'ta bulunamadı`);
                      resolve({ exists: false, message: "Bu kişi WhatsApp kişi listenizde bulunamadı" });
                    }
                  } catch (error) {
                    clearTimeout(timeoutId);
                    debugLog(`Arama sonuçları kontrol edilirken hata: ${error.message}`);
                    resolve({ exists: false, message: `Arama hatası: ${error.message}` });
                  }
                }, 2500); // Arama sonuçlarını beklemek için daha uzun süre
              } else {
                clearTimeout(timeoutId);
                debugLog('Arama kutusu bulunamadı');
                resolve({ exists: false, message: "Arama kutusu bulunamadı" });
              }
            } catch (error) {
              clearTimeout(timeoutId);
              debugLog(`Arama kutusu işlenirken hata: ${error.message}`);
              resolve({ exists: false, message: `Arama hatası: ${error.message}` });
            }
          }, 1000); // Arama kutusunun açılmasını bekle
        } else {
          // Son çare: Kişi direkt bulunamazsa, DOM'daki tüm title içeren span'ları ara
          debugLog('Arama düğmesi bulunamadı, tüm span elementlerini deniyoruz');
          
          const allTitleSpans = document.querySelectorAll('span[title], span[dir="auto"]');
          debugLog(`${allTitleSpans.length} span elementi bulundu`);
          
          for (const span of allTitleSpans) {
            const title = span.getAttribute('title') || '';
            const text = span.textContent.trim();
            
            const nameToCheck = title || text;
            if (!nameToCheck) continue;
            
            // Esnek eşleştirme yap
            if (nameToCheck.toLowerCase() === cleanName.toLowerCase() ||
                nameToCheck.toLowerCase().includes(cleanName.toLowerCase()) ||
                cleanName.toLowerCase().includes(nameToCheck.toLowerCase())) {
              clearTimeout(timeoutId);
              debugLog(`"${cleanName}" başlık içeren span'larda bulundu: "${nameToCheck}"`);
              resolve({ exists: true, foundName: nameToCheck });
              return;
            }
          }
          
          // Hiçbir yöntem başarılı olmadı
          clearTimeout(timeoutId);
          debugLog('Hiçbir arama yöntemi başarılı olmadı');
          resolve({ exists: false, message: "WhatsApp'ta bu kişi bulunamadı" });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        debugLog(`Arama başlatılırken hata: ${error.message}`);
        resolve({ exists: false, message: `Arama hatası: ${error.message}` });
      }
    });
  } catch (error) {
    debugLog(`Kişi doğrulama genel hatası: ${error.message}`);
    return { exists: false, message: `Doğrulama hatası: ${error.message}` };
  }
}

// Bulunan kişi adını kontrol et ve takip listesinde güncelle
function checkContactName(name, forcedOnline = false) {
  if (!name) return;
  
  // Takip edilen kişilerde ara - esnek eşleştirme yap
  const trackedContact = trackedContacts.find(c => 
    c.name.toLowerCase() === name.toLowerCase() || 
    c.name.toLowerCase().includes(name.toLowerCase()) || 
    name.toLowerCase().includes(c.name.toLowerCase())
  );
  
  if (trackedContact) {
    debugLog(`"${name}" kişisi takip listesinde bulundu ("${trackedContact.name}" olarak)`);
    
    // ForcedOnline parametresi varsa doğrudan çevrimiçi yap, yoksa normal kontrol et
    if (forcedOnline) {
      updateContactOnlineStatus(trackedContact, true);
    } else {
      // Çevrimiçi durumunu kontrol et
      const isOnline = checkOnlineStatus(trackedContact);
      updateContactOnlineStatus(trackedContact, isOnline);
    }
  } else {
    debugLog(`"${name}" takip listesinde bulunamadı`);
  }
}

// Sayfadan ayrılırken veya sekme kapatıldığında temizlik yap
window.addEventListener('beforeunload', cleanup);

// Sayfada hata oluşursa temizlik yap
window.addEventListener('error', (event) => {
  debugLog(`Sayfa hatası: ${event.message}`);
  cleanup();
});

// Kaynakları temizle ve ayarları kaydet
function cleanup() {
  debugLog('Temizlik yapılıyor...');
  
  // Tüm gözlemcileri durdur
  if (chatListObserver) {
    chatListObserver.disconnect();
    chatListObserver = null;
  }
  
  if (chatPaneObserver) {
    chatPaneObserver.disconnect();
    chatPaneObserver = null;
  }
  
  // Periyodik taramayı durdur
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  
  // Zamanlayıcıları temizle
  if (storageUpdateTimer) {
    clearTimeout(storageUpdateTimer);
  }
  
  if (historyUpdateTimer) {
    clearTimeout(historyUpdateTimer);
  }
  
  // Tüm bekleyen güncellemeleri hemen uygula
  commitStorageUpdates();
  
  // Bekleyen geçmiş kayıtlarını hemen kaydet
  if (pendingHistoryUpdates.length > 0) {
    commitHistoryUpdates();
  }
  
  // Otomatik sohbet açma zamanlayıcısını durdur
  if (autoOpenChatsTimer) {
    clearInterval(autoOpenChatsTimer);
    autoOpenChatsTimer = null;
  }
}

// Ayarları yükle
function loadSettings() {
  chrome.storage.sync.get(['trackedContacts', 'settings'], function(result) {
    if (result.trackedContacts) {
      trackedContacts = result.trackedContacts;
      debugLog(`${trackedContacts.length} kişi yüklendi`);
    }
    
    if (result.settings) {
      settings = result.settings;
      debugLog('Ayarlar yüklendi:', settings);
      
      // Debug modu aktifse, daha sık kontrol et
      if (settings.debugMode) {
        clearInterval(checkStatusInterval);
        checkStatusInterval = setInterval(manualScanForOnlineStatus, 5000);
        debugLog('Debug modu aktif, kontrol sıklığı 5 saniyeye ayarlandı');
      }
    }
  });
}

// Yazıyor durumunu kontrol etmek için yeni fonksiyon
function checkTypingStatusInChatList() {
  try {
    if (settings.debugMode) {
      debugLog("---------- Sohbet listesinde yazıyor kontrolü başlıyor ----------");
    }
    
    // 1. Sabit selektör ile sohbet listesini bul
    const chatListContainer = document.querySelector(SELECTORS.chatListContainer);
    if (!chatListContainer) {
      debugLog("Sohbet listesi bulunamadı");
      return;
    }
    
    // 2. Sohbet listesindeki tüm kişileri bul
    const chatItems = chatListContainer.querySelectorAll('div[role="listitem"]');
    debugLog(`Sohbet listesinde ${chatItems.length} kişi bulundu`);
    
    // Her bir sohbet öğesini kontrol et
    for (const chatItem of chatItems) {
      // 3. Kişi adını bul
      const contactNameElement = chatItem.querySelector(SELECTORS.contactName);
      if (!contactNameElement) continue;
      
      const contactName = contactNameElement.textContent.trim();
      if (!contactName) continue;
      
      // 4. Takip ettiğimiz bir kişi mi kontrol et
      const trackedContact = trackedContacts.find(c => {
        const cleanTrackName = c.name.toLowerCase().trim();
        const cleanChatName = contactName.toLowerCase().trim();
        
        return cleanTrackName === cleanChatName || 
              (cleanTrackName.includes(cleanChatName) && cleanChatName.length > 2) ||
              (cleanChatName.includes(cleanTrackName) && cleanTrackName.length > 2);
      });
      
      if (!trackedContact) continue;
      
      // 5. Mesaj alanında son durumu kontrol et
      const messageContainer = chatItem.querySelector(SELECTORS.messageContainer);
      if (!messageContainer) continue;
      
      const messageText = messageContainer.textContent.toLowerCase();
      
      // Debug için içeriği göster
      if (settings.debugMode) {
        debugLog(`${contactName} için son mesaj içeriği: "${messageText.substring(0, 50)}..."`);
        debugLog(`Mesaj container HTML: ${messageContainer.outerHTML.substring(0, 300)}...`);
      }
      
      // 6. Bu mesajda "yazıyor..." ifadesi var mı?
      const isTyping = 
        messageText.includes("yazıyor") || 
        messageText.includes("typing");
      
      // Eğer yazıyorsa, bildirim göster ve geçmişe ekle
      if (isTyping && !trackedContact.typing) {
        debugLog(`SOHBET LİSTESİNDE YAZMA TESPİT EDİLDİ: ${contactName} yazıyor!`);
        
        // Yazıyor durumunu güncelle
        trackedContact.typing = true;
        trackedContact.lastStatusChange = new Date().getTime();
        
        // Geçmişe ekle
        if (settings.saveHistory) {
          addToHistory({
            name: trackedContact.name,
            status: 'typing'
          });
        }
        
        // Bildirim göster
        if (settings.showNotifications) {
          showNotification(`${trackedContact.name} şu anda yazıyor...`);
        }
        
        // Chrome'a bildir
        chrome.runtime.sendMessage({
          action: 'updateContactStatus',
          contact: trackedContact
        });
        
        // Storage güncellemesi planla
        pendingStorageUpdates.trackedContacts = true;
        scheduleStorageUpdate();
      } 
      // Yazma durumu sona erdiyse
      else if (!isTyping && trackedContact.typing) {
        debugLog(`${contactName} yazma durumu sona erdi`);
        
        trackedContact.typing = false;
        trackedContact.lastStatusChange = new Date().getTime();
        
        // Chrome'a bildir
        chrome.runtime.sendMessage({
          action: 'updateContactStatus',
          contact: trackedContact
        });
        
        // Storage güncellemesi planla
        pendingStorageUpdates.trackedContacts = true;
        scheduleStorageUpdate();
      }
    }
    
    if (settings.debugMode) {
      debugLog("---------- Sohbet listesinde yazıyor kontrolü tamamlandı ----------");
    }
  } catch (error) {
    debugLog(`Sohbet listesinde yazıyor kontrolü sırasında hata: ${error.message}`);
  }
}

// Hem aktif sohbetteki hem de sohbet listesindeki yazıyor durumunu kontrol et
function checkAllTypingStatus() {
  // 1. Önce sohbet listesinde yazıyor durum kontrolü
  checkTypingStatusInChatList();
  
  // 2. Aktif sohbetteki yazıyor durumu kontrolü
  for (const contact of trackedContacts) {
    checkTypingStatus(contact);
  }
  
  // 3. Aktif sohbet mesajlarını kontrol et
  checkActiveChatForMessages();
}

// Geçmişi kaydetme fonksiyonu
function saveHistoryToStorage() {
  chrome.storage.local.get(['history'], function(result) {
    let updatedHistory = result.history || [];
    
    // Yeni geçmiş öğelerini ekleyin
    if (newHistoryItems.length > 0) {
      updatedHistory = [...newHistoryItems, ...updatedHistory];
      newHistoryItems = []; // Buffer'ı temizle
      
      // Maksimum 1000 kayıt tut
      if (updatedHistory.length > 1000) {
        updatedHistory = updatedHistory.slice(0, 1000);
      }
      
      // Geçmişi kaydet
      chrome.storage.local.set({
        'history': updatedHistory
      }, function() {
        debugLog(`Geçmiş güncellendi, toplam ${updatedHistory.length} kayıt var`);
      });
    }
  });
}

// Otomatik sohbet açma işlevini başlat
function startAutoOpenChats() {
  // Zaten çalışıyorsa tekrar başlatma
  if (autoOpenChatsTimer) {
    clearInterval(autoOpenChatsTimer);
  }
  
  debugLog(`Otomatik sohbet açma işlevi başlatılıyor (${settings.autoOpenInterval} saniye aralıkla)`);
  
  // İlk taramayı hemen yap, sonra belirtilen aralıklarla devam et
  processNextContact();
  
  // Belirli aralıklarla düzenli tarama zamanla
  autoOpenChatsTimer = setInterval(() => {
    if (!isAutoOpeningChats && trackedContacts.length > 0) {
      processNextContact();
    } else {
      debugLog('Önceki tarama hala devam ediyor veya takip edilen kişi yok, atlanıyor');
    }
  }, settings.autoOpenInterval * 1000);
}

// Otomatik sohbet açma işlevini durdur
function stopAutoOpenChats() {
  if (autoOpenChatsTimer) {
    clearInterval(autoOpenChatsTimer);
    autoOpenChatsTimer = null;
    debugLog('Otomatik sohbet açma işlevi durduruldu');
  }
}

// Sıradaki kişinin sohbetini aç, durumunu kontrol et ve ardından kapat
async function processNextContact() {
  if (isAutoOpeningChats || trackedContacts.length === 0) {
    return;
  }
  
  isAutoOpeningChats = true;
  
  // İşlenecek kişinin indeksini belirle
  if (currentAutoOpenIndex >= trackedContacts.length) {
    currentAutoOpenIndex = 0;
  }
  
  const contact = trackedContacts[currentAutoOpenIndex];
  debugLog(`Otomatik sohbet açma: ${contact.name} kişisi için işlem başlatılıyor (${currentAutoOpenIndex + 1}/${trackedContacts.length})`);
  
  try {
    // 1. Adım: Kişinin sohbetini bul ve aç
    if (await openChatForContact(contact)) {
      // 2. Adım: 2 saniye bekle ve durumu kontrol et
      await sleep(2000);
      
      // 3. Adım: Çevrimiçi/yazıyor durumunu kontrol et
      const header = document.querySelector(SELECTORS.conversationHeader);
      if (header) {
        let isOnline = false;
        let isTyping = false;
        
        // Çevrimiçi durumunu kontrol et
        const onlineTextElements = header.querySelectorAll('span');
        for (const span of onlineTextElements) {
          const text = span.textContent.toLowerCase();
          if (text.includes('çevrimiçi') || text.includes('online')) {
            isOnline = true;
            break;
          }
        }
        
        // Yazıyor durumunu kontrol et
        const typingElements = header.querySelectorAll('span[title*="yazıyor"], span[title*="typing"]');
        if (typingElements.length > 0) {
          isTyping = true;
        }
        
        // 4. Adım: Durumu güncelle
        debugLog(`${contact.name} durumu: ${isOnline ? 'çevrimiçi' : 'çevrimdışı'}${isTyping ? ', yazıyor' : ''}`);
        
        if (isOnline !== contact.online || isTyping !== contact.typing) {
          // Durum değişikliği var
          const previousStatus = contact.online ? 'çevrimiçi' : 'çevrimdışı';
          const newStatus = isOnline ? 'çevrimiçi' : 'çevrimdışı';
          
          debugLog(`${contact.name} durumu değişti: ${previousStatus} -> ${newStatus}`);
          
          contact.online = isOnline;
          contact.typing = isTyping;
          contact.lastStatusChange = new Date().getTime();
          
          // Geçmişe ekle
          if (settings.saveHistory) {
            if (isOnline && !isTyping) {
              addToHistory({
                name: contact.name,
                status: 'online'
              });
            } else if (!isOnline) {
              addToHistory({
                name: contact.name,
                status: 'offline'
              });
            } else if (isTyping) {
              addToHistory({
                name: contact.name,
                status: 'typing'
              });
            }
          }
          
          // Bildirim göster
          if (settings.showNotifications) {
            if (isOnline && !isTyping) {
              showNotification(`${contact.name} şu anda çevrimiçi!`);
            } else if (!isOnline) {
              showNotification(`${contact.name} çevrimdışı oldu.`);
            } else if (isTyping) {
              showNotification(`${contact.name} yazıyor...`);
            }
          }
          
          // Değişiklikleri kaydet
          pendingStorageUpdates.trackedContacts = true;
          scheduleStorageUpdate();
        }
      } else {
        debugLog(`${contact.name} için sohbet başlığı bulunamadı`);
      }
      
      // 5. Adım: Sohbeti kapat/geri dön
      await closeCurrentChat();
    } else {
      debugLog(`${contact.name} için sohbet açılamadı`);
    }
  } catch (error) {
    debugLog(`Otomatik sohbet açma hatası (${contact.name}): ${error.message}`);
  } finally {
    // Sonraki kişiye geç
    currentAutoOpenIndex++;
    isAutoOpeningChats = false;
  }
}

// Belirtilen kişi için sohbeti aç
async function openChatForContact(contact) {
  try {
    debugLog(`${contact.name} için sohbet açılıyor...`);
    
    // 1. Önce arama düğmesini bul ve tıkla
    const searchButton = document.querySelector('div[role="button"][title="Yeni sohbet"], div[role="button"][title="New chat"]');
    if (searchButton) {
      searchButton.click();
      await sleep(500);
      
      // 2. Arama kutusunu bul
      const searchInput = document.querySelector('div[contenteditable="true"]');
      if (searchInput) {
        // Arama kutusuna kişi adını yaz
        searchInput.textContent = contact.name;
        
        // Input event'i tetikle (WhatsApp araması için)
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);
        
        await sleep(1000);
        
        // 3. Arama sonuçlarını kontrol et
        const searchResults = document.querySelectorAll('div[aria-label="Sohbet listesi"] div[role="listitem"], div[aria-label="Chat list"] div[role="listitem"]');
        
        if (searchResults.length > 0) {
          // İlk sonucu tıkla (en yakın eşleşme)
          searchResults[0].click();
          debugLog(`${contact.name} için sohbet açıldı`);
          return true;
        } else {
          debugLog(`${contact.name} için arama sonucu bulunamadı`);
          // Arama kutusunu kapat
          const backButton = document.querySelector('button[data-testid="back"], span[data-icon="back"]');
          if (backButton) {
            backButton.click();
          }
          return false;
        }
      } else {
        debugLog(`Arama kutusu bulunamadı`);
        return false;
      }
    } else {
      debugLog(`Arama düğmesi bulunamadı`);
      return false;
    }
  } catch (error) {
    debugLog(`Sohbet açma hatası: ${error.message}`);
    return false;
  }
}

// Mevcut sohbeti kapat/geri dön
async function closeCurrentChat() {
  try {
    // Mobil ekran boyutunda back butonu varsa tıkla
    const backButton = document.querySelector('button[data-testid="back"], span[data-icon="back"]');
    if (backButton) {
      backButton.click();
      debugLog('Mobil görünümde geri düğmesine tıklandı');
      return true;
    }
    
    // Alternatif olarak sohbet listesinde başka bir öğeye tıkla
    const chatItems = document.querySelectorAll('div[aria-label="Sohbet listesi"] div[role="listitem"], div[aria-label="Chat list"] div[role="listitem"]');
    if (chatItems.length > 1) {
      // Arşiv veya benzeri özel öğeleri geç
      for (let i = 0; i < chatItems.length; i++) {
        if (!chatItems[i].textContent.includes('Arşiv') && !chatItems[i].textContent.includes('Archive')) {
          chatItems[i].click();
          debugLog('Başka bir sohbet öğesine tıklandı');
          return true;
        }
      }
    }
    
    debugLog('Mevcut sohbet kapatılamadı');
    return false;
  } catch (error) {
    debugLog(`Sohbet kapatma hatası: ${error.message}`);
    return false;
  }
}

// Yardımcı fonksiyon: Promise tabanlı bekleme
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
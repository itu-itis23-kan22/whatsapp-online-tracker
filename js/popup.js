document.addEventListener('DOMContentLoaded', async () => {
  // Dil ayarı yükle
  await i18n.loadLanguageSetting();
  
  // Sayfadaki tüm çevirilebilir metinleri çevir
  translatePage();
  
  // DOM elementleri
  const trackedContactsEl = document.getElementById('tracked-contacts');
  const onlineStatusEl = document.getElementById('online-status');
  const historyLogEl = document.getElementById('history-log');
  const addContactBtn = document.getElementById('add-contact');
  const exportHistoryBtn = document.getElementById('export-history');
  const clearHistoryBtn = document.getElementById('clear-history');
  const btnAddCurrent = document.getElementById('btnAddCurrent');
  const contactForm = document.getElementById('contactForm');
  const notificationToggle = document.getElementById('notification-toggle');
  const historyToggle = document.getElementById('history-toggle');
  const checkIntervalInput = document.getElementById('check-interval');
  const debugModeToggle = document.getElementById('debug-mode-toggle');
  const languageSelect = document.getElementById('language-select');

  // Ayarları yükle
  loadSettings();
  
  // İzlenen kişileri yükle
  loadTrackedContacts();
  
  // Geçmişi yükle
  loadHistory();

  // Etkinlik dinleyicileri
  if (addContactBtn) addContactBtn.addEventListener('click', showAddContactDialog);
  if (exportHistoryBtn) exportHistoryBtn.addEventListener('click', exportHistory);
  if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);
  
  if (notificationToggle) notificationToggle.addEventListener('change', saveSettings);
  if (historyToggle) historyToggle.addEventListener('change', saveSettings);
  if (checkIntervalInput) checkIntervalInput.addEventListener('change', saveSettings);
  if (debugModeToggle) debugModeToggle.addEventListener('change', saveSettings);
  
  // Dil seçimi değiştiğinde
  if (languageSelect) {
    // Mevcut dili seç
    languageSelect.value = i18n.getCurrentLanguage();
    
    languageSelect.addEventListener('change', function() {
      const newLang = this.value;
      if (i18n.setLanguage(newLang)) {
        // Dili değiştir ve ayarlara kaydet
        const settings = {
          language: newLang,
          notifications: notificationToggle ? notificationToggle.checked : true,
          saveHistory: historyToggle ? historyToggle.checked : true,
          scanInterval: checkIntervalInput ? parseInt(checkIntervalInput.value) : 10,
          debug: debugModeToggle ? debugModeToggle.checked : false
        };
        
        chrome.storage.sync.set({settings}, () => {
          console.log('Dil ayarı kaydedildi:', newLang);
          // Sayfayı yeniden çevir
          translatePage();
          // İçeriği yeniden yükle
          loadTrackedContacts();
          loadHistory();
        });
      }
    });
  }
  
  // Tab işlevselliği ekle
  setupTabsSystem();

  // Aktif sohbetteki kişiyi ekle
  if (btnAddCurrent) {
    btnAddCurrent.addEventListener('click', () => {
      chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
        if (tabs.length > 0) {
          btnAddCurrent.disabled = true;
          
          // ContentScript'te çalışan addCurrentContactToTracked fonksiyonunu çağır
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'addCurrentContact'
          }, (response) => {
            btnAddCurrent.disabled = false;
            
            if (response && response.success) {
              // Başarılı ekleme durumunda
              loadTrackedContacts();
            } else {
              // Hata durumunda
              // (Bildirim zaten ContentScript'ten gösterilecek)
            }
          });
        } else {
          alert(i18n.__('whatsappNotOpen'));
        }
      });
    });
  }
  
  // Manuel kişi ekleme formu
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const contactNameInput = document.getElementById('contactName');
      if (!contactNameInput) return;
      
      const contactName = contactNameInput.value.trim();
      
      if (contactName) {
        addContactManually(contactName);
        contactNameInput.value = '';
      }
    });
  }

  // Fonksiyonlar
  function loadSettings() {
    chrome.storage.sync.get({
      settings: {
        notifications: true,
        saveHistory: true,
        scanInterval: 10,
        debug: false,
        language: i18n.getCurrentLanguage(),
        autoOpenChats: false,
        autoOpenInterval: 180
      }
    }, (data) => {
      // Arayüze uygula
      if (notificationToggle) notificationToggle.checked = data.settings.notifications;
      if (historyToggle) historyToggle.checked = data.settings.saveHistory;
      if (checkIntervalInput) checkIntervalInput.value = data.settings.scanInterval;
      if (debugModeToggle) debugModeToggle.checked = data.settings.debug;
      if (languageSelect) languageSelect.value = data.settings.language || i18n.getCurrentLanguage();
      
      // Otomatik sohbet açma ayarlarını arayüze uygula
      const autoOpenToggle = document.getElementById('auto-open-toggle');
      const autoOpenIntervalInput = document.getElementById('auto-open-interval');
      
      if (autoOpenToggle) autoOpenToggle.checked = data.settings.autoOpenChats;
      if (autoOpenIntervalInput) autoOpenIntervalInput.value = data.settings.autoOpenInterval;
      
      // Debug modu değişince content script'e bildir
      if (debugModeToggle) {
        debugModeToggle.addEventListener('change', function() {
          chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'setDebugMode',
                enabled: this.checked
              });
            }
          });
        });
      }
      
      // Otomatik sohbet açma modu değişince content script'e bildir
      if (autoOpenToggle) {
        autoOpenToggle.addEventListener('change', function() {
          const isEnabled = this.checked;
          const interval = autoOpenIntervalInput ? parseInt(autoOpenIntervalInput.value) : 180;
          
          chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'setAutoOpenChats',
                enabled: isEnabled,
                interval: interval
              });
            }
          });
          
          // Ayarı kaydet
          saveSettings();
        });
      }
      
      // Otomatik sohbet açma aralığı değiştiğinde kaydet
      if (autoOpenIntervalInput) {
        autoOpenIntervalInput.addEventListener('change', saveSettings);
      }
    });
  }

  function saveSettings() {
    const autoOpenToggle = document.getElementById('auto-open-toggle');
    const autoOpenIntervalInput = document.getElementById('auto-open-interval');
    
    const settings = {
      notifications: notificationToggle ? notificationToggle.checked : true,
      saveHistory: historyToggle ? historyToggle.checked : true,
      scanInterval: checkIntervalInput ? parseInt(checkIntervalInput.value) : 10,
      debug: debugModeToggle ? debugModeToggle.checked : false,
      language: languageSelect ? languageSelect.value : i18n.getCurrentLanguage(),
      autoOpenChats: autoOpenToggle ? autoOpenToggle.checked : false,
      autoOpenInterval: autoOpenIntervalInput ? parseInt(autoOpenIntervalInput.value) : 180
    };
    
    // Geçerlilik kontrolleri
    if (settings.scanInterval < 5) settings.scanInterval = 5;
    if (settings.scanInterval > 60) settings.scanInterval = 60;
    
    if (settings.autoOpenInterval < 30) settings.autoOpenInterval = 30;
    if (settings.autoOpenInterval > 600) settings.autoOpenInterval = 600;
    
    // Kaydet
    chrome.storage.sync.set({settings}, () => {
      console.log('Ayarlar kaydedildi:', settings);
      
      // İlgili content script'lere bildir
      chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateSettings',
            settings: settings
          });
        });
      });
    });
  }

  // Manuel kişi ekleme diyaloğunu göster
  function showAddContactDialog() {
    // Diyalog zaten varsa kaldır
    let existingDialog = document.getElementById('add-contact-dialog');
    if (existingDialog) {
      document.body.removeChild(existingDialog);
    }
    
    // Diyalog oluştur
    const dialog = document.createElement('div');
    dialog.id = 'add-contact-dialog';
    dialog.className = 'dialog';
    
    dialog.innerHTML = `
      <div class="dialog-content">
        <h3>${i18n.__('addContact')}</h3>
        <p>${i18n.__('enterContactNamePrompt')}</p>
        <input type="text" id="contact-name-input" placeholder="${i18n.__('contactName')}">
        <p class="dialog-note">${i18n.__('contactAddInfo')}</p>
        <div class="dialog-buttons">
          <button id="cancel-add-contact" class="btn btn-cancel">${i18n.__('cancel')}</button>
          <button id="confirm-add-contact" class="btn">${i18n.__('add')}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Input'a fokuslan
    const inputEl = document.getElementById('contact-name-input');
    if (inputEl) inputEl.focus();
    
    // Düğme eventleri
    const cancelBtn = document.getElementById('cancel-add-contact');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
    }
    
    const confirmBtn = document.getElementById('confirm-add-contact');
    if (confirmBtn && inputEl) {
      confirmBtn.addEventListener('click', () => {
        const contactName = inputEl.value.trim();
        if (contactName) {
          addContactManually(contactName);
          document.body.removeChild(dialog);
        } else {
          inputEl.classList.add('error');
          setTimeout(() => {
            inputEl.classList.remove('error');
          }, 500);
        }
      });
    }
    
    // Enter tuşu ile ekle
    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && confirmBtn) {
          confirmBtn.click();
        }
      });
    }
  }

  // DOM elementlerini çevirileri ile güncelle
  function translatePage() {
    // data-i18n özelliği olan tüm elementleri bul ve çevir
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = i18n.__(key);
      }
    });
    
    // Placeholder çevirileri
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = i18n.__(key);
      }
    });
  }

  function addContactManually(contactName) {
    // İsim kontrolü
    if (!contactName || contactName.trim() === '') {
      alert(i18n.__('enterValidName'));
      return;
    }
    
    chrome.storage.sync.get({trackedContacts: []}, (data) => {
      // Zaten izleniyor mu kontrol et
      if (data.trackedContacts.some(c => c.name === contactName)) {
        alert(i18n.__('contactAlreadyTracked', {name: contactName}));
        return;
      }
      
      // WhatsApp Web açık mı kontrol et
      chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
        if (tabs.length > 0) {
          // Kişiyi doğrula
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'verifyContact',
            contactName: contactName
          }, (response) => {
            // HATA DURUMU: Chrome uzantı mesajlaşma hatası veya yanıt gelmediğinde
            if (chrome.runtime.lastError || !response) {
              console.log("Chrome uzantı mesajlaşma hatası:", chrome.runtime.lastError);
              alert(i18n.__('communicationError'));
              return;
            }
            
            // Kişi geçerli mi yoksa doğrulama hatası mı var?
            if (response && response.exists === true) {
              // Eğer tam isim döndüyse onu kullan, yoksa girilen ismi kullan
              const actualName = response.foundName || contactName;
              
              const newContact = {
                id: Date.now().toString(),
                name: actualName,
                online: false,
                typing: false,
                lastStatusChange: null
              };
              
              const updatedContacts = [...data.trackedContacts, newContact];
              
              chrome.storage.sync.set({trackedContacts: updatedContacts}, () => {
                loadTrackedContacts();
                
                // ContentScript'e bildir
                chrome.tabs.sendMessage(tabs[0].id, {
                  action: 'updateTrackedContacts',
                  contacts: updatedContacts
                });
                
                alert(i18n.__('contactAdded', {name: actualName}));
              });
            } else {
              // Kişi bulunamadı
              const errorMessage = response.message || i18n.__('contactVerificationFailed');
              
              if (confirm(i18n.__('confirmAddAnyway', {message: errorMessage}))) {
                const newContact = {
                  id: Date.now().toString(),
                  name: contactName,
                  online: false,
                  typing: false,
                  lastStatusChange: null
                };
                
                const updatedContacts = [...data.trackedContacts, newContact];
                
                chrome.storage.sync.set({trackedContacts: updatedContacts}, () => {
                  loadTrackedContacts();
                  
                  // ContentScript'e bildir
                  chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'updateTrackedContacts',
                    contacts: updatedContacts
                  });
                  
                  alert(i18n.__('manualAddWarning', {name: contactName}));
                });
              }
            }
          });
        } else {
          alert(i18n.__('whatsappNotOpen'));
        }
      });
    });
  }

  function loadTrackedContacts() {
    chrome.storage.sync.get({trackedContacts: []}, (data) => {
      if (!trackedContactsEl) return;
      
      trackedContactsEl.innerHTML = '';
      
      if (data.trackedContacts.length === 0) {
        trackedContactsEl.innerHTML = `<p class="empty-message">${i18n.__('noContactsTracked')}</p>`;
        return;
      }

      data.trackedContacts.forEach(contact => {
        const contactEl = document.createElement('div');
        contactEl.className = 'contact-item';
        
        const statusClass = contact.online ? 'online' : 'offline';
        const typingStatus = contact.typing ? ` (${i18n.__('typing')})` : '';
        
        contactEl.innerHTML = `
          <div class="contact-info">
            <span class="contact-name">${contact.name}</span>
            <div class="contact-status">
              <span class="online-status ${statusClass}"></span>
              <span>${contact.online ? i18n.__('online') : i18n.__('offline')}${typingStatus}</span>
            </div>
          </div>
          <button class="remove-contact" data-contact="${contact.id}">X</button>
        `;
        
        trackedContactsEl.appendChild(contactEl);
      });
      
      // Kişi kaldırma düğmelerini dinle
      document.querySelectorAll('.remove-contact').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const contactId = e.target.getAttribute('data-contact');
          removeContact(contactId);
        });
      });
    });
    
    // Çevrimiçi durumlarını güncelle
    updateOnlineStatus();
  }

  function updateOnlineStatus() {
    chrome.storage.sync.get({onlineContacts: []}, (data) => {
      if (!onlineStatusEl) return;
      
      onlineStatusEl.innerHTML = '';
      
      if (!data.onlineContacts || data.onlineContacts.length === 0) {
        onlineStatusEl.innerHTML = `<p class="empty-message">${i18n.__('allContactsOffline')}</p>`;
        return;
      }
      
      data.onlineContacts.forEach(contact => {
        const contactEl = document.createElement('div');
        contactEl.className = 'contact-item';
        
        const typingStatus = contact.typing ? ` (${i18n.__('typing')})` : '';
        
        contactEl.innerHTML = `
          <div class="contact-info">
            <span class="contact-name">${contact.name}</span>
            <div class="contact-status">
              <span class="online-status online"></span>
              <span>${i18n.__('online')}${typingStatus}</span>
            </div>
          </div>
        `;
        
        onlineStatusEl.appendChild(contactEl);
      });
    });
  }

  function loadHistory() {
    chrome.storage.local.get(['history'], (data) => {
      const history = data.history || [];
      
      // Her bir sekme için geçmiş container'ları
      const allHistoryEl = document.getElementById('history-log');
      const onlineHistoryEl = document.getElementById('history-log-online');
      const offlineHistoryEl = document.getElementById('history-log-offline');
      const typingHistoryEl = document.getElementById('history-log-typing');
      
      // Tüm geçmiş container'larını temizle
      if (allHistoryEl) allHistoryEl.innerHTML = '';
      if (onlineHistoryEl) onlineHistoryEl.innerHTML = '';
      if (offlineHistoryEl) offlineHistoryEl.innerHTML = '';
      if (typingHistoryEl) typingHistoryEl.innerHTML = '';
      
      // Geçmiş yoksa bilgi mesajı göster
      if (history.length === 0) {
        const emptyMessage = `<div class="info-message">${i18n.__('noHistoryRecords')}</div>`;
        if (allHistoryEl) allHistoryEl.innerHTML = emptyMessage;
        if (onlineHistoryEl) onlineHistoryEl.innerHTML = emptyMessage;
        if (offlineHistoryEl) offlineHistoryEl.innerHTML = emptyMessage;
        if (typingHistoryEl) typingHistoryEl.innerHTML = emptyMessage;
        return;
      }
      
      // En yeni 50 geçmiş kaydını göster (tersine çevrilmiş)
      const recentHistory = history.slice(0, 50).reverse();
      
      // Olaylara göre filtrelenmiş geçmiş listeleri
      const onlineHistory = recentHistory.filter(h => h.status === 'online');
      const offlineHistory = recentHistory.filter(h => h.status === 'offline');
      const typingHistory = recentHistory.filter(h => h.status === 'typing');
      
      // Tüm geçmişi doldur
      if (allHistoryEl) {
        recentHistory.forEach(h => {
          const historyItem = createHistoryItem(h);
          allHistoryEl.appendChild(historyItem);
        });
      }
      
      // Çevrimiçi geçmişi doldur
      if (onlineHistoryEl) {
        if (onlineHistory.length === 0) {
          onlineHistoryEl.innerHTML = `<div class="info-message">${i18n.__('noHistoryRecords')}</div>`;
        } else {
          onlineHistory.forEach(h => {
            const historyItem = createHistoryItem(h);
            onlineHistoryEl.appendChild(historyItem);
          });
        }
      }
      
      // Çevrimdışı geçmişi doldur
      if (offlineHistoryEl) {
        if (offlineHistory.length === 0) {
          offlineHistoryEl.innerHTML = `<div class="info-message">${i18n.__('noHistoryRecords')}</div>`;
        } else {
          offlineHistory.forEach(h => {
            const historyItem = createHistoryItem(h);
            offlineHistoryEl.appendChild(historyItem);
          });
        }
      }
      
      // Yazıyor geçmişi doldur
      if (typingHistoryEl) {
        if (typingHistory.length === 0) {
          typingHistoryEl.innerHTML = `<div class="info-message">${i18n.__('noHistoryRecords')}</div>`;
        } else {
          typingHistory.forEach(h => {
            const historyItem = createHistoryItem(h);
            typingHistoryEl.appendChild(historyItem);
          });
        }
      }
    });
  }

  function removeContact(contactId) {
    chrome.storage.sync.get({trackedContacts: []}, (data) => {
      const contact = data.trackedContacts.find(c => c.id === contactId);
      const updatedContacts = data.trackedContacts.filter(c => c.id !== contactId);
      
      chrome.storage.sync.set({trackedContacts: updatedContacts}, () => {
        loadTrackedContacts();
        
        // ContentScript'e bildir
        chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateTrackedContacts',
              contacts: updatedContacts
            });
          }
        });
        
        if (contact) {
          alert(i18n.__('contactRemoved', {name: contact.name}));
        }
      });
    });
  }

  function exportHistory() {
    chrome.storage.local.get({history: []}, (data) => {
      if (!data.history || data.history.length === 0) {
        alert(i18n.__('noHistoryRecords'));
        return;
      }
      
      // CSV formatına dönüştür
      let csv = `${i18n.__('date')},${i18n.__('contact')},${i18n.__('status')}\n`;
      
      data.history.forEach(entry => {
        const date = new Date(entry.timestamp);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        let statusText = '';
        if (entry.status === 'online') {
          statusText = i18n.__('online');
        } else if (entry.status === 'offline') {
          statusText = i18n.__('offline');
        } else if (entry.status === 'typing') {
          statusText = i18n.__('typing');
        }
        
        csv += `"${formattedDate}","${entry.name}","${statusText}"\n`;
      });
      
      // Dosyayı indir
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whatsapp_history.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      alert(i18n.__('historyExported'));
    });
  }

  function clearHistory() {
    if (confirm(i18n.__('confirmClearHistory'))) {
      chrome.storage.local.set({history: []}, () => {
        loadHistory();
        alert(i18n.__('historyCleared'));
      });
    }
  }

  // Düzenli olarak çevrimiçi durumlarını ve geçmişi güncelle
  setInterval(() => {
    loadTrackedContacts();
    loadHistory();
  }, 5000);

  // Sekme sistemi işlevselliği
  function setupTabsSystem() {
    const tabButtons = document.querySelectorAll('.tab-button');
    if (!tabButtons.length) return;
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Aktif sekme sınıfını kaldır
        document.querySelectorAll('.tab-button').forEach(btn => {
          btn.classList.remove('active');
        });
        
        // Aktif içerik sınıfını kaldır
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('active');
        });
        
        // Tıklanan sekmeyi aktif yap
        button.classList.add('active');
        
        // İlgili içeriği göster
        const tabId = button.getAttribute('data-tab');
        const tabPane = document.querySelector(`.tab-pane[data-tab="${tabId}"]`);
        if (tabPane) {
          tabPane.classList.add('active');
        }
      });
    });
  }

  // Geçmiş öğesi oluştur
  function createHistoryItem(historyEntry) {
    const item = document.createElement('div');
    item.className = `history-item ${historyEntry.status}`;
    
    const time = new Date(historyEntry.time);
    const timeStr = time.toLocaleString();
    
    // Durum metnini hazırla
    let statusText = '';
    if (historyEntry.status === 'online') {
      statusText = i18n.__('online');
    } else if (historyEntry.status === 'offline') {
      statusText = i18n.__('offline');
    } else if (historyEntry.status === 'typing') {
      statusText = i18n.__('typing');
    }
    
    item.innerHTML = `
      <span class="history-item-time">${timeStr}</span>: 
      <strong>${historyEntry.name}</strong> ${statusText}
    `;
    
    return item;
  }
}); 
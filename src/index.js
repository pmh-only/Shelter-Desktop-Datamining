'use strict';

var TARGET_SERVER = 'https://shelter.id/';

const { app, BrowserWindow, ipcMain, Tray, Menu, screen, shell, protocol, dialog } = require('electron');
const { autoUpdater } = require("electron-updater");
const contextMenu = require('electron-context-menu');
const config = require('electron-settings');
const path = require('path');
const { fadeAnimation } = require("./animations/default.animation");
const { pushModule } = require("./push/push.module");
const isDevelopment = require('electron-is-dev');
const MAIN_DEFAULT_WIDTH = 1024, MAIN_DEFAULT_HEIGHT = 576, 
      LOGIN_DEFAULT_WIDTH = 350, LOGIN_DEFAULT_HEIGHT = 418,
      MIN_HEIGHT = 576, MIN_WIDTH = 1024,
      LOADER_WIDTH = LOGIN_DEFAULT_WIDTH, LOADER_HEIGHT = LOGIN_DEFAULT_HEIGHT;

if (isDevelopment) {
  TARGET_SERVER = 'http://localhost:4200/';
} else {
  // hide all native dialog in production for sure./..
  dialog.showErrorBox = (title, content) => {
    console.error(title, content);
  }
}

console.log("START:", TARGET_SERVER, ", DEV:", isDevelopment);

/// variables
let win, tray = null, loaderSplash, updaterWindow, notifyUpdateWindow, savedWindowSize = [MAIN_DEFAULT_WIDTH, MAIN_DEFAULT_HEIGHT],
    isSavingWindowSize = false, requestClose = false, closeLoaderByUser = true, defaultSkinTone = 'WHITE', socket, userUid;

// 중복 실행 방지
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', (event, cmdLine, workingDir) => {
    if (win) {
      win.forceFocus();
    } else {
      app.relaunch();
    }
  })
} else {
  app.exit();
}

app.setAppUserModelId("id.shelter.client"/* 이 부분 수정시, 필히 package.json도 참고 */);
Menu.setApplicationMenu(Menu.buildFromTemplate([])); //기본 단축키 차단을 위함 (Ctrl+R, Alt+Left ... )

// 업데이트 중 안내창
function createUpdater() {
  updaterWindow = new BrowserWindow({
    width: 300,
    height: 70,
    frame: false,
    resizable: false,
    show: true,
    icon: path.join(__dirname, 'assets', 'logo_w.png'),
    backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: true
    }
  });

  if (isDevelopment) {
    updaterWindow.webContents.openDevTools();
  }

  updaterWindow.once('ready-to-show', () => { updaterWindow.show() });
  updaterWindow.loadURL(path.join(__dirname, 'updater', 'index.html'));
}

function createNotifyUpdate() {
  notifyUpdateWindow = new BrowserWindow({
    width: 470,
    height: 98,
    frame: false,
    resizable: false,
    show: true,
    icon: path.join(__dirname, 'assets', 'logo_w.png'),
    backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: true
    }
  });

  if (isDevelopment) {
    notifyUpdateWindow.webContents.openDevTools();
  }

  notifyUpdateWindow.doUpdate = () => {
    app.relaunch(); // :)
    app.exit();
  };

  notifyUpdateWindow.later = () => {
    notifyUpdateWindow.close()
  };

  notifyUpdateWindow.once('close', (e, a) => {
    keepCheckUpdate();
  })

  notifyUpdateWindow.once('ready-to-show', () => { notifyUpdateWindow.show(); notifyUpdateWindow.focus(); });
  notifyUpdateWindow.loadURL(path.join(__dirname, 'updater', 'new-update.html'));
}

// 메인 윈도우
function createWindow () {
  win = new BrowserWindow({
    width: LOGIN_DEFAULT_WIDTH,
    height: LOGIN_DEFAULT_HEIGHT,
    frame: false,
    //minWidth: 770,
    //minHeight: 480,
    resizable: false,
    show: false,
    icon: path.join(__dirname, 'assets', 'logo_w.png'),
    backgroundColor: '#000000',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      nodeIntegration: true,
      nativeWindowOpen: true
    }
  });

  // 오른쪽 메뉴 지역화.
  contextMenu({
    showSearchWithGoogle: false,
    showCopyImage: false,
    showCopyImageAddress: false,
    showSaveImageAs: true,
    showInspectElement: false,
    showServices: false,
    shouldShowMenu: () => true,
    labels: {
      copy: "복사",
      saveImage: "이미지 저장하기",
      saveImageAs: "이미지 저장하기",
      copyLink: "링크 복사",
      copyImage: "이미지 복사",
      copyImageAddress: "이미지 주소 복사",
      cut: "잘라내기",
      inspect: "우가우가",
      learnSpelling: "-",
      lookUpSelection: "찾아보기",
      paste: "붙여넣기",
      searchWithGoogle: "Google에서 검색하기",
      services: "응애"
    }
  });

  win.once('ready-to-show', () => { 
  })
  win.once('closed', () => { app.exit() })
  win.on('resize', () => {
    const currentBounds = win.getNormalBounds();
    if (isSavingWindowSize) {
      config.set('window.state', {
        width: currentBounds.width,
        height: currentBounds.height
      }).then(() => {}, () => {});
    } else {
      if (loaderSplash) {
        try{
          loaderSplash.resizable = true
          loaderSplash.setBounds(currentBounds)
          loaderSplash.resizable = false
        }catch(ignored){
        }
      }
    }
  })
  win.on('close', (event) => {
    if (!requestClose) {
      event.preventDefault();
      win.fadeOut();
    }
  })
  win.on('maximize', () => {
    win.webContents.send('window-size-event', 'max');
  })
  win.on('unmaximize', () => {
    win.webContents.send('window-size-event', 'unmax');
  })
  
  win.fadeOut = () => {
    win.setSkipTaskbar(true);
    fadeOutSlideUp(win, () => { win.hide() })
  }

  win.fadeIn = () => {
    win.setOpacity(0);
    win.show();
    win.setSkipTaskbar(false);
    fadeInSlideDown(win)
  }

  win.forceFocus = () => {
    if (win.isMinimized()) {
      win.restore();
    }

    win.show();
    win.setOpacity(1);
    win.moveTop();
    win.focus();
  }

  // 팝업창 및 외부링크 처리
  win.webContents.on('new-window', (event, url, frameName, disposition, opt) => {
    event.preventDefault();
    if(disposition === 'new-window') {
      Object.assign(opt, { modal: true, parent: win, frame: true, resizable: true, webPreferences: { nodeIntegration: false } });
      event.newGuest = new BrowserWindow(opt)
      event.newGuest.setTitle("Shelter");
      event.newGuest.setMenuBarVisibility(false);
      event.newGuest.webContents.on('new-window', (e, u, f, d, o) => {
        e.preventDefault();
        shell.openExternal(u); // new window in new window
      });
    } else if (url && url.startsWith('http')) {
      shell.openExternal(url);
    }
  });

  // 개발자도구
  if (isDevelopment) {
    win.webContents.openDevTools();
  }

  win.loadURL(TARGET_SERVER + "desktop_start");

  ///// socket  
  try{
    socket = require('socket.io-client')("http://cc.devflow.kr:8080/");
    socket.on('connect', () => {
      console.log("CC_SOCKET:CONNECT");
      socket.emit('start', {
        uid: userUid,
        version: app.getVersion()
      });
    });
  }catch(e){
    //Math.random().toString(36).substr(2, 10)
    console.error(e);
  }

  //setupPushReceiver(win.webContents);
}

// 트레이 아이콘 등록
function createTrayIcon() {
  if (tray) {
    try {
      tray.destroy();
      tray = null;
    }catch(ignored){}
  }

  tray = new Tray(path.join(__dirname, 'assets', 'logo_w_32x32.png'));
  tray.setTitle("Shelter");
  const men = Menu.buildFromTemplate([
    {label: '열기', type: 'normal', "click": async() => { openWindowFromTray() }},
    {label: '종료', type: 'normal', "click": async() => { requestClose = true; app.exit() }},
  ]);
  tray.setToolTip('Shelter');
  tray.setContextMenu(men);
  tray.on("double-click", () => {
    openWindowFromTray()
  });
}

function openWindowFromTray() {
  if (!win.isVisible()) {
    win.fadeIn();
    win.moveTop();
    win.focus();
  } else {
    win.forceFocus();
  }
}

// 실제 윈도우는 숨기고, 로더 스플래쉬를 대신 보여줌. (기존방식은 main.html에서 location.href = '쉘터')
function createLoaderSplash() {
  closeLoaderByUser = true;

  let mainBounds = {
    width: LOADER_WIDTH,
    height: LOADER_HEIGHT
  };

  if (win && win.isVisible()) {
    mainBounds = win.getNormalBounds();
  }

  loaderSplash = new BrowserWindow(Object.assign({
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    opacity: 0,
    title: "Shelter",
    backgroundColor: '#00123456',
    icon: path.join(__dirname, 'assets', 'logo_w.png'),
    paintWhenInitiallyHidden: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true
    }
  }, mainBounds));

  loaderSplash.defaultSkinTone = defaultSkinTone;

  loaderSplash.once('ready-to-show', () => { loaderSplash.show(); fadeInSlideDown(loaderSplash) });
  loaderSplash.once('close', () => { if(closeLoaderByUser == true) app.exit() })
  loaderSplash.on('closed', () => { loaderSplash = undefined; });

  loaderSplash.fadeOut = () => {
    fadeOutSlideUp(loaderSplash, () => { loaderSplash.close(); });
  }

  loaderSplash.restartApp = () => {
    app.relaunch();
    app.exit();
  }

  loaderSplash.loadFile(path.join(__dirname, 'loader', 'index.html'));
}

// 로딩창 파괴
function destroyLoaderSplash(createTray = true) {
  if (typeof loaderSplash === 'undefined') {
    return;
  }

  if (createTray) {
    createTrayIcon();
  } else {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  }

  closeLoaderByUser = false;
  loaderSplash.fadeOut();
}

// 자동실행 설정
function setOpenAtLogin(isOpenAtLogin = true) {
  app.setLoginItemSettings({
    openAtLogin: isOpenAtLogin,
    path: process.execPath
  })
}

// 자동실행 여부
function getOpenAtLogin() {
  const settings = app.getLoginItemSettings();
  return typeof settings == 'object' && settings.openAtLogin;
}

// 기본값은 자동실행 설정
function checkInitSetup() {
  config.get('init.setup').then((val) => {
    if (val && val == '1') {
      //
    } else {
      config.set('init.setup', '1').then(() => {}, () => {});
      setOpenAtLogin(true);
    }
  }, () => {})
}

//// Animation //////////////////////////////////////

function fadeInSlideDown(_window, cb = null) {
  return fadeAndSlide(_window, 'in', 20, cb);
}

function fadeOutSlideUp(_window, cb = null) {
  return fadeAndSlide(_window, 'out', 20, cb);
}

function fadeAndSlide(_window, type, duration, cb = null) {
  return fadeAnimation(_window, type, duration, cb);
}

// 일반 화면 으로 확대
function hideExpandAndShow() {
  const currentBounds = win.getNormalBounds();
  
  const savedSize = config.getSync('window.state') || { width: MAIN_DEFAULT_WIDTH, height: MAIN_DEFAULT_HEIGHT };
  savedWindowSize = [savedSize.width, savedSize.height];

  win.hide();
  win.setBounds({
    x: Math.floor(currentBounds.x - ((savedWindowSize[0] - currentBounds.width) / 2)),
    y: Math.floor(currentBounds.y - ((savedWindowSize[1] - currentBounds.height) / 2)),
    width: savedWindowSize[0],
    height: savedWindowSize[1]
  });
  win.resizable = true;
  win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
  win.show();
  isSavingWindowSize = true;
}

// 로그인 크기로 축소
function hideShrinkAndShow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  isSavingWindowSize = false;

  win.resizable = true;
  win.hide();
  win.setMinimumSize(1, 1);

  if (win.isMaximized()){
    win.once('unmaximize', () => {
      win.setBounds({
        x: Math.floor((width / 2) - (LOGIN_DEFAULT_WIDTH / 2)),
        y: Math.floor((height / 2) - (LOGIN_DEFAULT_HEIGHT / 2)),
        width: LOGIN_DEFAULT_WIDTH,
        height: LOGIN_DEFAULT_HEIGHT
      });
    
      win.resizable = false;
      win.show();
    })
    win.unmaximize();
  } else {
    win.setBounds({
      x: Math.floor((width / 2) - (LOGIN_DEFAULT_WIDTH / 2)),
      y: Math.floor((height / 2) - (LOGIN_DEFAULT_HEIGHT / 2)),
      width: LOGIN_DEFAULT_WIDTH,
      height: LOGIN_DEFAULT_HEIGHT
    });
  
    win.resizable = false;
    win.show();
  }
}

//// Notification //////////////////////////////////////
let notifications = [];

function showNotification(payload) {
  clearPrevNotifications();

  const noti_id = Math.floor(Math.random() * 10000);
  const NOTI_DEFAULT_WIDTH = 300, NOTI_DEFAULT_HEIGHT = 120;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const currentNotification = new BrowserWindow({
    width: NOTI_DEFAULT_WIDTH,
    height: NOTI_DEFAULT_HEIGHT,
    frame: false,
    show: false,
    backgroundColor: '#242628',
    focusable: true,
    alwaysOnTop: true,
    movable: false,
    resizable: false,
    titleBarStyle: 'hidden',
    skipTaskbar: true,
    acceptFirstMouse: true,
    opacity: 0,
    x: width - NOTI_DEFAULT_WIDTH - 8,
    y: height - NOTI_DEFAULT_HEIGHT - 8,
    webPreferences: {
      nodeIntegration: true
    }
  });

  currentNotification.closeNotification = () => {
    fadeOutSlideUp(currentNotification, () => { currentNotification.destroy() });
  }

  currentNotification.openNotification = () => {
    if (payload.data.article !== "") {
      win.webContents.send('open-modal', ['article', payload.data.article]);
    } else if (payload.data.product !== "") {
      win.webContents.send('open-modal', ['product', payload.data.product]);
    }
    
    win.forceFocus()

    currentNotification.closeNotification();
  }

  currentNotification.defaultSkinTone = defaultSkinTone;
  currentNotification.ref_id = noti_id;
  currentNotification.payload = payload;

  currentNotification.once('ready-to-show', () => { currentNotification.show(); fadeInSlideDown(currentNotification);  });
  currentNotification.once('show', () => {  });
  currentNotification.once('closed', () => { try{ notifications = notifications.filter((e) => e.ref_id != noti_id ); currentNotification = null; }catch(e){} });

  currentNotification.loadFile(path.join(__dirname, "notification", "index.html"));

  //currentNotification.webContents.openDevTools();
  
  notifications.push(currentNotification);
}

function clearPrevNotifications() {
  notifications.forEach((e) => { if (typeof e === 'object') e.closeNotification(); });
  notifications = [];
}


//// UI ///////////////////////////////////////////////

function changeDefaultSkinTone(tone, isSave = true) {
  tone = tone === 'BLACK' ? 'BLACK' : 'WHITE';

  if (isSave) {
    config.set('skin.default.tone', tone).then(() => {}, () => {});
  }

  defaultSkinTone = tone;
}

//// PUSH //////////////////////////////////

// Production 상황에서도 FCM 테스트할 수 있도록 console.log 삭제 보류.
pushModule.on('error', (e) => {
  console.error(e);
  try{ socket.emit('fcm-error', JSON.stringify(e)); }catch(xxx){}
}).on('updated', (token) => {
  console.log("token got updated. :", token)
  if (win && token) {
    win.webContents.send('PUSH_RECEIVER:::TOKEN_UPDATED', token)
    try{ socket.emit('fcm-token', token.substr(0, token.length / 2) + "*********"); }catch(xxx){}
  }
}).on('started', (token) => {
  console.log("token got started. :", token)
  if (win && token) {
    win.webContents.send('PUSH_RECEIVER:::NOTIFICATION_SERVICE_STARTED', token)
    try{ socket.emit('fcm-token', token.substr(0, token.length / 2) + "*********"); }catch(xxx){}
  }
}).on('received', (payload) => {
  console.log("on push received", payload)
  if (win) {
    win.webContents.send("PUSH_RECEIVER:::NOTIFICATION_RECEIVED", payload)
    console.log("send to angular:::::");
  }
})

//// IPC ///////////////////////////////////////////////

ipcMain.on('PUSH_RECEIVER:::START_NOTIFICATION_SERVICE', (event, senderId) => {
  pushModule.senderId = senderId; // messagingSenderId
  pushModule.subscribeFCM();
}).on('wake_up', () => {
  win.forceFocus()
}).on('login-form', () => {
  setTimeout(() => {
    destroyLoaderSplash();
    win.fadeIn();
  }, 1000 /* 환경에 따라 DOM이 아직 덜 로드될 수 있어 지연시킴. */);
}).on('noti', (event, payload) => {
  showNotification(payload)
}).on('expand', () => {
  setTimeout(() => {
    destroyLoaderSplash();
  }, 500);
  hideExpandAndShow();
}).on('shrink', () => {
  hideShrinkAndShow();
}).on('close', () => {
  win.fadeOut();
}).on('minimize', () => {
  win.minimize()
}).on('maximize', () => {
  win.maximize()
}).on('unmaximize', () => {
  win.unmaximize()
}).on('set-open-at-login', (event, payload) => {
  setOpenAtLogin(payload == 'true')
}).on('get-open-at-login', (event) => {
  event.sender.send('return-open-at-login', getOpenAtLogin() ? 'true' : 'false')
}).on('default-skin', (event, tone) => {
  changeDefaultSkinTone(tone)
}).on('open-payment-url', (event, url) => {
  shell.openExternal(url)
}).on('close-app', () => {
  app.exit()
}).on('show-loader', () => {
  createLoaderSplash()
}).on('close-loader', () => {
  destroyLoaderSplash(false)
});

//// APP ///////////////////////////////////////////////

// Auto Update
autoUpdater.autoDownload = false;
autoUpdater.on('update-downloaded', (ev, info) => {
  autoUpdater.quitAndInstall(true, true);
})

var updateTracker;
function keepCheckUpdate() {
  clearInterval(updateTracker);
  updateTracker = setInterval(() => {
    try{
      autoUpdater.checkForUpdates().then((result) => {
        if (result.cancellationToken !== undefined) {
          clearInterval(updateTracker);
          createNotifyUpdate();
        }
      }, () => {})
    }catch(e){}
  }, 3600000 /* 1hour */)
}

app.whenReady().then(() => {
    // session.defaultSession.clearStorageData({
    //   storages: ["serviceworkers"] 
    // })

    defaultSkinTone = config.getSync('skin.default.tone') || 'WHITE'
    createLoaderSplash();
    protocol.registerHttpProtocol('shelter-client', (req, cb) => {
      if (win) {
        win.forceFocus();
      }
    })

    userUid = config.getSync("uid") || "";

    if (userUid.length < 1) {
      userUid = Math.random().toString(36).substr(2, 10);
      config.setSync("uid", userUid)
    }

    //if(!app.isDefaultProtocolClient('shelter-client')) {
    //  app.setAsDefaultProtocolClient('shelter-client');
    //}
    autoUpdater.checkForUpdates().then((result) => {
      if (result.cancellationToken !== undefined) {
        createUpdater();
        destroyLoaderSplash(false);
        autoUpdater.downloadUpdate(result.cancellationToken);
      } else {
        createWindow();
        checkInitSetup();
        keepCheckUpdate();
      }
    }, () => {
      createWindow();
      checkInitSetup();
      keepCheckUpdate();
    })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})


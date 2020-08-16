//forked from electron-push-receiver@2.1.3
const { register, listen } = require('push-receiver');
const { EventEmitter } = require('events');
const Config = require('electron-config');
const MAX_WAIT_TIME_IN_MS = 3276800; // 54min,15tries.

class PushModule extends EventEmitter {
    subscribed = false;
    config;
    retries = 1;
    tryAfterTimeout;
    senderId = "496208059609"; // 이 값은 Angular 에서 시작 전 새로 할당해줌.

    constructor() {
        super();
        this.config = new Config();
    }

    async subscribeFCM() {
      if (this.subscribed) {
        this.emitToken();
        return;
      }

      let credentials = this.config.get('credentials');
      const savedSenderId = this.config.get('senderId');
  
      try {
        const persistentIds = this.config.get('persistentIds') || [];

        if (!credentials || savedSenderId !== this.senderId) {
          credentials = await register(this.senderId);
          this.config.set('credentials', credentials);
          this.config.set('senderId', this.senderId);
          this.emit("updated", credentials.fcm.token)
        }
        await listen(Object.assign({}, credentials, { persistentIds }), this.onNotification());
        this.emit("started", credentials.fcm.token);
        this.subscribed = true;
      } catch (e) {
        this.emit("error", e)
        this.onErrorTryAfter();
      }
    }

    onNotification() {
        return ({ notification, persistentId }) => {
            const persistentIds = this.config.get('persistentIds') || [];
            this.config.set('persistentIds', [...persistentIds, persistentId]);
            this.emit("received", notification);
        };
    }

    emitToken() {
      let credentials = this.config.get('credentials');
      
      if (credentials) {
        this.emit('started', credentials.fcm.token);
      }
    }

    onErrorTryAfter() {
      this.retries++;
      
      const waitFor = Math.min(MAX_WAIT_TIME_IN_MS, Math.pow(2, this.retries) * 100);

      this.tryAfterTimeout = setTimeout(this.subscribeFCM.bind(this), waitFor)
    }
}

module.exports = {
    pushModule: new PushModule()
}
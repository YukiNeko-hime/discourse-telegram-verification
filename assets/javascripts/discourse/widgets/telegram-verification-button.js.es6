import { createWidget } from 'discourse/widgets/widget';
import { h } from 'virtual-dom';

class VerificationPopup {
  constructor(botToken, model, callback) {
    this.popup = {};
    this.botToken = botToken;
    this.botId = botToken.split(':')[0];
    this.model = model;
    this.callback = callback;
  }
  
  authenticate(options) {
    if (!this.botId) {
      throw new Error('Bot id required');
    }
    
    // compose the request url
    let botId = 'bot_id=' + encodeURIComponent(this.botId),
        origin = '&origin=' + encodeURIComponent(location.origin || location.protocol + '//' + location.hostname),
        requestAccess = options.request_access ? '&request_access=' + encodeURIComponent(options.request_access) : '',
        lang = options.lang ? '&lang=' + encodeURIComponent(options.lang) : '';
    
    let url = 'https://oauth.telegram.org/auth?' + botId + origin + requestAccess + lang;
    
    let target = 'telegram_oauth_bot' + this.botId;
    
    // position the popup at the center of the launching window if possible
    let width = 550,
        height = 470,
        left = Math.max(0, (window.outerWidth - width) / 2) + (window.screenLeft | 0),
        top = Math.max(0, (window.outerHeight - height) / 2) + (window.screenTop | 0);
    
    let position = 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top;
    let params = position + ',status=0,location=0,menubar=0,toolbar=0';
    
    // launch the popup
    let popup = window.open(url, target, params);
    
    this.popup = {
      window: popup,
      authFinished: false
    };
    
    if (popup) {
      window.addEventListener('message', this.onMessage.bind(this));
      popup.focus();
    }
  }
  
  onMessage(event) {
    // parse the authentication results
    let data;
    try {
      data = JSON.parse(event.data);
    } catch(e) {
      data = {};
    }
    
    if (this.popup) {
      if (event.source == this.popup.window) {
        if (data.event == 'auth_result') {
          this.onAuthDone(data.result);
        }
      }
    }
  }
  
  async onAuthDone(authData) {
    if (!this.popup.authFinished) {
      this.popup.authFinished = true;
      window.removeEventListener('message', this.onMessage.bind(this));
      
      // verify data integrity and save
      let verified = await this.verifyData(authData);
      if (verified) {
        this.saveAuthData(authData);
      }
    }
  }
  
  async saveAuthData(authData) {
    let {id, first_name, last_name, username} = authData;
    
    // names can contain punctuation, sanitize them
    if (first_name) {first_name = first_name.replace(';',',')};
    if (last_name) {last_name = last_name.replace(';',',')};
    
    let user = [id,first_name,last_name,username].join(';');
    let ids = this.model.get('custom_fields.telegram_ids');
    
    // Discourse interprets a single string in an array as a string, so pad the array with an empty string
    if (!ids) {ids = [""]};
    if (!ids.includes(user)) {
      // add user and rerender the widget
      ids.push(user);
      this.model.set('custom_fields.telegram_ids', ids);
      this.callback();
    }
  }
  
  async verifyData(authData) {
    // check that the request is no older than 24 hours
    let now = new Date().getTime();
    let ts = parseInt(authData['auth_date'])*1000;
    if (now - ts > 86400) {
      return false
    }
    
    // create the data check string from the authData
    let {hash, ...data} = authData;
    let dataCheckString = Object.keys(data)
      .sort()
      .filter((k) => data[k])
      .map(k => (`${k}=${data[k]}`))
      .join('\n');
    
    // confirm that the hash of the data matches with the provided hash
    let secret = await this.getSecret();
    let dataHash = await this.getHash(dataCheckString, secret);
    
    if (dataHash == hash) {
      return true
    } else {
      return false
    }
  }
  
  getSecret() {
    // the secret is always the hash of the bot token
    return window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder('utf-8').encode(this.botToken)
    );
  }
  
  async getHash(data, secret) {
    // create a key for signing the data
    let key = await window.crypto.subtle.importKey(
      "raw",
      secret,
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign", "verify"]
    )
    
    // use the key to sign the data to get the signature
    let signature = await window.crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder('utf-8').encode(data)
      )
    
    // convert the byte array signature to hex string
    let hashArray = Array.from(new Uint8Array(signature));
    let hex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
    return hex
  }
};

createWidget('telegram-verification-button', {
  tagName: 'div.btn.btn-default.btn-text',
  buildKey: () => 'telegram-verification-button',
  
  onAuthDone() {
    // rerender the widget with the new id
    this.sendWidgetAction('rerender')
  },
  
  click(evt) {
    let botToken = this.siteSettings.telegram_verification_access_token;
    let callback = this.onAuthDone.bind(this);
    
    let popup = new VerificationPopup(botToken, this.attrs.model, callback);
    popup.authenticate({lang: 'en'});
  },
  
  html(attrs, state) {
    return I18n.t('js.user.telegram_verification.button_label')
  }
});

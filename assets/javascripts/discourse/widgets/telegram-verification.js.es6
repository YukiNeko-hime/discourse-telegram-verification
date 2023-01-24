import { createWidget } from 'discourse/widgets/widget';
import { iconNode } from 'discourse-common/lib/icon-library';
import { h } from 'virtual-dom';
import { ajax } from 'discourse/lib/ajax';
import { popupAjaxError } from 'discourse/lib/ajax-error';

export default createWidget('telegram-verification', {
  tagName: 'div.telegram-verification-interface',
  buildKey: () => 'telegram-verification',
  
  html(attrs, state) {
    let contents = [];
    
    contents.push(this.attach('verified-users', {model:this.model}));
    contents.push(this.attach('telegram-verification-button', {model:this.model}));
    
    return contents
  }
});

createWidget('verified-users', {
  tagName: 'div.verified-users',
  buildKey: () => 'verified-users',
  
  revokeAccess(id) {
    // revoke user access to any groups
    let userId = id.split(';')[0];
    ajax(`/telegramverification/revoke/${userId}`, {
      type: 'GET',
      data: {}
    }).catch(popupAjaxError)
    
    // remove user from the list of verified users
    let ids = this.attrs.model.get('custom_fields.telegram_ids');
    let i = ids.indexOf(id);
    ids.pop(i);
    this.attrs.model.set('custom_fields.telegram_ids', ids);
  },
  
  html(attrs, state) {
    let content = [];
    
    // add widget for all verified user ids
    let ids = attrs.model.custom_fields.telegram_ids;
    for (let id of ids) {
      if (id) {
        content.push(this.attach('verified-user', {id: id}));
      }
    }
    
    // if there are no verified accounts, show text info instead
    if (!content.length) {
      content.push(I18n.t('js.user.telegram_verification.no_accounts'))
    }
    
    return content
  }
});

createWidget('verified-user', {
  tagName: 'div.user',
  buildKey: () => 'verified-user',
  
  click(evt) {
    if (
      event.target.classList.contains("revoke") ||
      event.target.classList.contains("d-icon-times")
    ) {
      // send action upstream so the user list updates and user can be removed from groups
      this.sendWidgetAction('revokeAccess', this.attrs.id);
    }
  },
  
  html(attrs, state) {
    let [id, fname, lname, uname] = attrs.id.split(';');
    let account = fname + ' ' + lname + ' (@' + uname + ')';
    
    return [h("div.account", [account]), h('div.btn-default.btn-icon.no-text.revoke', iconNode('times'))]
  }
});

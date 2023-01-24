import { withPluginApi } from 'discourse/lib/plugin-api'

export default {
  name: 'telegram-verification',
  initialize() {
    withPluginApi('0.8.22', api => {
      api.modifyClass('controller:preferences/profile', {
        pluginId: 'telegram-verification',
        
        actions: {
          save() {
            // ensure that custom fields are saved, when the user hits the save button
            this.saveAttrNames.push('custom_fields');
            this._super();
          }
        }
      })
    })
  }
}

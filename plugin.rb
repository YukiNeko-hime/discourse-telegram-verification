# name: telegram-verification
# about: A plugin for verifying forum membership, when a user joins a Telegram group.
# version: 1.1.0
# authors: Lumi

enabled_site_setting :telegram_verification_enabled

# register stylesheets
register_asset 'stylesheets/common/telegram-verification.scss'

after_initialize do
  # register custom user field to store the ids in
  User.register_custom_field_type 'telegram_ids', :array
  register_editable_user_custom_field [:telegram_ids, telegram_ids: []] if defined? register_editable_user_custom_field
  DiscoursePluginRegistry.serialized_current_user_fields << 'telegram_ids'
  
  require_dependency 'directory_item_serializer'
  class ::DirectoryItemSerializer::UserSerializer
    attributes :telegram_ids
    
    def telegram_ids
      object.custom_fields['telegram_ids']
    end
  end
  
  # load Telegram related stuff
  load File.expand_path('../lib/telegram.rb', __FILE__)
  
  # schedule the bot to run every minute
  class ::Jobs::BouncerBot < Jobs::TelegramBot
    every 1.minute
    
    def execute(args)
      processJoinRequests()
    end
  end
  
  # add a route to revoke access to groups, when id is removed
  Discourse::Application.routes.append do
    get '/telegramverification/revoke/:id' => 'telegramverification#revoke'
  end
end

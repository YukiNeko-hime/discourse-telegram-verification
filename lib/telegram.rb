module TelegramApi
  def doAPIRequest(method, params)
    http = Net::HTTP.new("api.telegram.org", 443)
    http.use_ssl = true
    
    accessToken = SiteSetting.telegram_verification_access_token
    
    uri = URI("https://api.telegram.org/bot#{accessToken}/#{method}")
    
    req = Net::HTTP::Post.new(uri, 'Content-Type' => 'application/json')
    req.body = params.to_json
    response = http.request(req)
    
    responseData = JSON.parse(response.body)
    
    responseData
  end
  
  def getJoinRequests(updateId)
    # request updates on join requests
    response = doAPIRequest('getUpdates', {offset: updateId, timeout: 30, allowed_updates: ['chat_join_request']})
    
    requests = []
    if response['ok'] == true
      for r in response['result']
        updateId = [updateId, r['update_id'] + 1].max
        if r.key?('chat_join_request')
          requests << r
        end
      end
    end
    
    return updateId, requests
  end
  
  def kickUser(chatId, userId)
    # in Telegram API unban removes the user, but allows them join again immediately
    doAPIRequest('unbanChatMember', {chat_id: chatId, user_id: userId})
  end
  
  def acceptRequest(chatId, userId)
    # approve request to join a group
    doAPIRequest('approveChatJoinRequest', {chat_id: chatId, user_id: userId})
  end
end

module DatabaseQueries
  def queryTelegramIds()
    # query database for ids and return them as an array
    
    result = []
    begin
      ActiveRecord::Base.connection.transaction do
        DB.exec "SET TRANSACTION READ ONLY"
        DB.exec "SET LOCAL statement_timeout = 10000"
        sql = <<-SQL
/*
* Telegram User Verification
*/
SELECT user_custom_fields.value
FROM user_custom_fields
WHERE user_custom_fields.name = 'telegram_ids'
SQL
        
        sql = DB.param_encoder.encode(sql)
        result = ActiveRecord::Base.connection.raw_connection.async_exec(sql)
        result.check
        raise ActiveRecord::Rollback
      end
    rescue Exception => ex
      err = ex
    end
    
    return result.to_a
  end
end

class ::Jobs::TelegramBot < Jobs::Scheduled
  @@updateId = 0
  @@pendingRequests = []
  @@telegramIds = []
  
  include TelegramApi
  include DatabaseQueries
  
  def sendInfoMessage(title, userId)
    help = SiteSetting.telegram_verification_help_url
    msg = SiteSetting.telegram_verification_info_message
    msg['{title}'] = title
    msg['{help}'] = help
    
    doAPIRequest('sendMessage', {chat_id: userId, text: msg, parse_mode: 'HTML'})
  end
  
  def sendWelcomeMessage(title, userId)
    rules = SiteSetting.telegram_verification_rules_url
    msg = SiteSetting.telegram_verification_welcome_message
    msg['{title}'] = title
    msg['{rules}'] = rules
    
    doAPIRequest('sendMessage', {chat_id: userId, text: msg, parse_mode: 'HTML'})
  end
  
  def processJoinRequests()
    # refresh ids and requests
    @@telegramIds = queryTelegramIds()
    @@updateId, newRequests = getJoinRequests(@@updateId)
    @@pendingRequests.push(*newRequests)
    
    # check if any requests can be accepted
    i = 0
    while i < @@pendingRequests.length
      r = @@pendingRequests[i]
      chatId = r['chat_join_request']['chat']['id']
      chatTitle = r['chat_join_request']['chat']['title']
      userId = r['chat_join_request']['from']['id']
      
      if isVerified(userId)
        # user is verified, accept the request and send welcome message
        acceptRequest(chatId, userId)
        sendWelcomeMessage(chatTitle, userId)
        @@pendingRequests.delete(r)
        i -= 1
      elsif newRequests.include? r
        # user is not verified, send an info message asking for verification
        sendInfoMessage(chatTitle, userId)
      end
      
      i += 1
    end
  end
    
  def isVerified(userId)
    # check if the userId is in the database
    verified = false
    for ids in @@telegramIds
      if ids['value'].include? userId.to_s
        verified = true
        break
      end
    end
    
    return verified
  end
end


  
class ::TelegramverificationController < ApplicationController
  include TelegramApi
  
  def revoke
    # revoke user access to all monitored groups
    userId = params[:id]
    for chatId in SiteSetting.telegram_verification_chat_ids.split(',')
      kickUser(chatId, userId)
    end
    
    render :json => {success: true}
  end
end

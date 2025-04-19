#!/bin/sh

# change mail by the environment variable
if [ -n "$MAIL" ]; then
  echo "MAIL is set, changing mail in config.ini"
  sed -i 's/^#mail = .*$/mail = '"$MAIL"'/g' /srv/config.ini
fi
# change mail-host by the environment variable
if [ -n "$MAIL_HOST" ]; then
  echo "MAIL_HOST is set, changing mail-host in config.ini"
  sed -i 's/^#smtp-host = .*$/smtp-host = '"$MAIL_HOST"'/g' /srv/config.ini
fi
# change mail-port by the environment variable
if [ -n "$MAIL_PORT" ]; then
  echo "MAIL_PORT is set, changing mail-port in config.ini"
  sed -i 's/^#smtp-port = .*$/smtp-port = '"$MAIL_PORT"'/g' /srv/config.ini
fi
# change mail-user by the environment variable
if [ -n "$MAIL_USER" ]; then
  echo "MAIL_USER is set, changing mail-user in config.ini"
  sed -i 's/^#smtp-user = .*$/smtp-user = '"$MAIL_USER"'/g' /srv/config.ini
fi
# change mail-password by the environment variable
if [ -n "$MAIL_PASSWORD" ]; then
  echo "MAIL_PASSWORD is set, changing mail-password in config.ini"
  sed -i 's/^#smtp-password = .*$/smtp-password = '"$MAIL_PASSWORD"'/g' /srv/config.ini
fi
# change email-to by the environment variable
if [ -n "$EMAIL_TO" ]; then
  echo "EMAIL_TO is set, changing email-to in config.ini"
  sed -i 's/^#email-to = .*$/email-to = '"$EMAIL_TO"'/g' /srv/config.ini
fi
# change email-from by the environment variable
if [ -n "$EMAIL_FROM" ]; then
  echo "EMAIL_FROM is set, changing email-from in config.ini"
  sed -i 's/^#email-from = .*$/email-from = '"$EMAIL_FROM"'/g' /srv/config.ini
fi
# change mail-only-on-error by the environment variable
if [ -n "$MAIL_ONLY_ON_ERROR" ]; then
  echo "MAIL_ONLY_ON_ERROR is set, changing mail-only-on-error in config.ini"
  sed -i 's/^#mail-only-on-error = .*$/mail-only-on-error = '"$MAIL_ONLY_ON_ERROR"'/g' /srv/config.ini
fi
# change insecure-skip-verify by the environment variable
if [ -n "$INSECURE_SKIP_VERIFY" ]; then
  echo "INSECURE_SKIP_VERIFY is set, changing insecure-skip-verify in config.ini"
  sed -i 's/^#insecure-skip-verify = .*$/insecure-skip-verify = '"$INSECURE_SKIP_VERIFY"'/g' /srv/config.ini
fi
# change gotify-webhook by the environment variable
if [ -n "$GOTIFY_WEBHOOK" ]; then
  echo "GOTIFY_WEBHOOK is set, changing gotify-webhook in config.ini"
  sed -i 's/^#gotify-webhook = .*$/gotify-webhook = '"$GOTIFY_WEBHOOK"'/g' /srv/config.ini > /srv/config.ini.tmp
  mv /srv/config.ini.tmp /srv/config.ini
fi
# change gotify-only-on-error by the environment variable
if [ -n "$GOTIFY_ONLY_ON_ERROR" ]; then
  echo "GOTIFY_ONLY_ON_ERROR is set, changing gotify-only-on-error in config.ini"
  sed -i 's/^#gotify-only-on-error = .*$/gotify-only-on-error = '"$GOTIFY_ONLY_ON_ERROR"'/g' /srv/config.ini
fi
# change gotify-priority by the environment variable
if [ -n "$GOTIFY_PRIORITY" ]; then
  echo "GOTIFY_PRIORITY is set, changing gotify-priority in config.ini"
  sed -i 's/^#gotify-priority = .*$/gotify-priority = '"$GOTIFY_PRIORITY"'/g' /srv/config.ini
fi

/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

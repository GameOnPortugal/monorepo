FROM premoweb/chadburn:1.0.6 as chadburn
FROM alpine:3.17

RUN apk add python3 py3-pip curl jq supervisor

WORKDIR /srv

COPY --from=chadburn /usr/bin/chadburn /usr/bin/chadburn
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY . ./

RUN pip3 install -r requirements.txt

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
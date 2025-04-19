FROM premoweb/chadburn:1.9.5 AS chadburn
FROM alpine:3.21

RUN apk add python3 py3-pip curl jq supervisor

# Set up a virtual environment in the Docker image
RUN python -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

WORKDIR /srv

COPY --from=chadburn /usr/bin/chadburn /usr/bin/chadburn
COPY ../supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY .. ./

RUN pip3 install -r requirements.txt

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

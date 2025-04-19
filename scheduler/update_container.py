import docker
import fileinput
import subprocess
import os

from subprocess import PIPE

def run_command(command):
    result = None
    try:
        result = subprocess.run(command, shell=True, check=True, stdout=PIPE, stderr=PIPE)
    except subprocess.CalledProcessError as e:
        print("Error running command \n", command, "\n Output: \n", e.stderr.decode('utf-8'))
        exit(1)

    return result

if os.getenv('APP_CONTAINER_NAME') is None:
    print('Container name not found in environment variables. Have you defined APP_CONTAINER_NAME?')
    exit()

client = docker.DockerClient(base_url='unix://var/run/docker.sock', version='auto')

# Grab container id from name
container = client.containers.list()
container_name = None

for c in container:
    if os.getenv('APP_CONTAINER_NAME') in c.name:
        # Grab container id
        container_name = c.name

if container_name is None:
    print('Container not found')
    exit()

print('Container name: ' + container_name)

is_updated = False
with fileinput.FileInput('config.ini', inplace=True, backup='.bak') as file:
    for line in file:
        if 'container' in line and container_name not in line:
            print('container = ' + container_name)
            is_updated = True
        else:
            print(line, end='')

if is_updated:
    # restart supervisord scheduler task
    run_command('supervisorctl restart scheduler')
    print('Container name was updated since last time. Restarted scheduler!')
else:
    print('Scheduler doesn\'t need to be restarted')
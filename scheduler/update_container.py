import docker
import fileinput
import subprocess

from subprocess import PIPE

def run_command(command):
    result = None
    try:
        result = subprocess.run(command, shell=True, check=True, stdout=PIPE, stderr=PIPE)
    except subprocess.CalledProcessError as e:
        print("Error running command \n", command, "\n Output: \n", e.stderr.decode('utf-8'))
        exit(1)

    return result

client = docker.DockerClient(base_url='unix://var/run/docker.sock', version='auto')

# Grab container id from name
container = client.containers.list()
container_name = None

# Grab the right container name from all running containers
for c in container:
    # Check that name contains game-on-portugal-app
    if 'game-on-portugal-app' in c.name:
        # Grab container id
        container_name = c.name

if container_name is None:
    print('Container not found')
    exit()

print('Container name: ' + container_name)

is_updated = False
with fileinput.FileInput('config.ini', inplace=True, backup='.bak') as file:
    for line in file:
        # Update container line with the right container name
        if 'container' in line and 'game-on-portugal' in line and container_name not in line:
            print('container = ' + container_name)
            is_updated = True
        else:
            print(line, end='')

if is_updated:
    # restart supervisord scheduler task
    run_command('supervisorctl restart scheduler')
    print('Restarted scheduler')

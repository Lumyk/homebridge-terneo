# homebridge-terneo
Homebridge plugin for Terneo thermostats http://terneo.ua/

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-terneo
3. Update your configuration file. See bellow for a sample.

# Configuration

## Options

- `platform` - must be "TerneoThermostat"
- `email` - this is email from Terneo account (https://my.terneo.ua/)
- `password` - this is password from Terneo account (https://my.terneo.ua/)
- `interval` - this is updating interval in seconds *(Optional value)* by default 10s

## Example

Configuration sample:

 ```json
 {
     "bridge": {
         "name": "Homebridge",
         "username": "08:6A:E5:5E:D7:01",
         "port": 51827,
         "pin": "031-45-154"
     },
     "platforms": [
         {
             "platform": "TerneoThermostat",
             "email": "terneo@example.com",
             "password": "my terneo password"
         }
     ]
 }
```

# Policy

The author is not responsible for the use and consequences of use of this software.

License
----

MIT

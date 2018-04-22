// Created by Evgeny Kalashnikov

var async = require("async");
var https = require("https");
const querystring = require('querystring');

var Accessory,
    Service,
    Characteristic;

class THERMOSTAT {

    constructor(log, thermostat, api, token, interval) {

        Accessory = api.platformAccessory;
        Service = api.hap.Service;
        Characteristic = api.hap.Characteristic;

        var platform = this;

        this.api = api;
        this.log = log;
        this.thermostat = thermostat;
        this.token = token
        this.interval = interval

        this.id = thermostat.id;
        this.name = thermostat.name;
        this.firmwareRevision = thermostat.firmware;
        this.serialNumber = thermostat.sn;
        this.readonly = thermostat.readonly;
        this.targetMinValue = thermostat.data.temperature_limits.min_value;
        this.targetMaxValue = thermostat.data.temperature_limits.max_value;
        this.currenttemp = thermostat.data.temp_current;
        this.targettemp = thermostat.data.temp_setpoint;
        this.ip = thermostat.data.ip;
        this.signal = thermostat.data.wifi_level;
        this.online = thermostat.data.is_online;
        this.mode = 0;
        this.powerOff = true;

        !this.targetMinValue ? this.targetMinValue = 5 : this.targetMinValue;
        !this.targetMaxValue ? this.targetMaxValue = 45 : this.targetMaxValue;
        !this.currenttemp ? this.currenttemp = 0 : this.currenttemp;
        !this.targettemp ? this.targettemp = 5 : this.targettemp;

        var self = this;
        this.getContent = function(path) {
            var options = {
                method: 'GET',
                hostname: 'api.hmarex.com',
                path: path,
                headers : {
                    'Authorization': 'Token ' + self.token
                }
            };
            return new Promise((resolve, reject) => {

                const request = https.request(options, (response) => {

                    if (response.statusCode < 200 || response.statusCode > 299) {
                        reject(new Error('Failed to load data, status code: ' + response.statusCode));
                    }

                    const body = [];
                    response.on('data', (chunk) => body.push(chunk));
                    response.on('end', () => resolve(body.join('')));
                });

                request.on('error', (err) => reject(err))
                request.end()
            })
        };

        this.putContent = function(path, body) {

            return new Promise((resolve, reject) => {
                var options = {
                    method: 'PUT',
                    hostname: 'api.hmarex.com',
                    path: path,
                    headers : {
                        'Content-Type': 'application/json',
                        'Content-Length': body.length,
                        'Authorization': 'Token ' + self.token
                    }
                };
                const request = https.request(options, function (response) {

                    if (response.statusCode < 200 || response.statusCode > 299) {
                        reject(new Error('Failed to load data, status code: ' + response.statusCode));
                    }

                    response.on('data', (chunk) => {
                      try {
                        var response = JSON.parse(chunk)
                        if (response.error_code != null) {
                            self.log(response);
                        } else {
                            resolve(response)
                        }
                      } catch (e) {
                          reject(e)
                      }
                    });
                });

                request.on('error', (err) => reject(err))
                request.write(body);
                request.end();
            })
        };
    }

    getServices() {

        var accessory = this;

        this.informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Name, this.name + " Terneo")
            .setCharacteristic(Characteristic.Identify, this.id + " Terneo")
            .setCharacteristic(Characteristic.Manufacturer, 'Terneo')
            .setCharacteristic(Characteristic.Model, 'Thermostat')
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

        this.Thermostat = new Service.Thermostat(this.name + " Terneo");

        this.Thermostat.getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: -100,
                maxValue: 100,
                minStep: 1
            })
            .updateValue(this.currenttemp);

        this.Thermostat.getCharacteristic(Characteristic.TargetTemperature)
            .setProps({
                minValue: this.targetMinValue,
                maxValue: this.targetMaxValue,
                minStep: 1
            })
            .updateValue(this.targettemp)
            .on('set', this.setTargetTemperature.bind(this));

        this.Thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(this.currentstate)
            .setProps({
                format: Characteristic.Formats.UINT8,
                maxValue: 3,
                minValue: 0,
                validValues: [0, 1, 3],
                perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
            });

        Characteristic.CurrentHeatingCoolingState.AUTO = 3;

        this.Thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState)
          .updateValue(this.targetstate)
          .on('set', this.setTargetHeatingCoolingState.bind(this))
          .setProps({
              format: Characteristic.Formats.UINT8,
              maxValue: 3,
              minValue: 0,
              validValues: [0, 1, 3],
              perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
        });

        this.Thermostat.getCharacteristic(Characteristic.Active).updateValue(this.online);

        this._updateThermostatValues();

        return [this.informationService, this.Thermostat];
    }

    _updateThermostatValues() {

        var self = this;

        async.waterfall([
            function(next) {
                function fetchDeviceInfo(next) {
                  self.getContent('/device/' + self.id + "/")
                      .then((data) => {
                          try {
                            var result = JSON.parse(data);
                            if (result.data.temp_current != null) {
                                self.currenttemp = result.data.temp_current;
                            }
                            if (result.data.temp_setpoint != null) {
                                self.targettemp = result.data.temp_setpoint;
                            }
                            if (result.firmware != null) {
                                self.firmwareRevision = result.firmware;
                            }
                            if (result.data.is_online != null) {
                                self.online = result.data.is_online;
                            }
                          } catch (e) {
                              self.log(self.name + ": " + e + " - Trying again");
                          }

                          self.Thermostat.getCharacteristic(Characteristic.CurrentTemperature).updateValue(self.currenttemp);
                          self.Thermostat.getCharacteristic(Characteristic.TargetTemperature).updateValue(self.targettemp);
                          self.informationService.setCharacteristic(Characteristic.FirmwareRevision, self.firmwareRevision);
                          next()
                      })
                      .catch((err) => {
                          self.log(self.name + ": " + err + " - Trying again");
                          self.Thermostat.getCharacteristic(Characteristic.CurrentTemperature).updateValue(self.currenttemp);
                          self.Thermostat.getCharacteristic(Characteristic.TargetTemperature).updateValue(self.targettemp);
                          next(err)
                      });
                }
                fetchDeviceInfo(next)
            },
            function(next) {
                function fetchDeviceStatus(next) {
                    self.getContent('/device/' + self.id + "/parameters/")
                        .then((data) => {
                            try {
                                var results = JSON.parse(data);
                                var mode = null
                                var powerOff = null
                                results.forEach(function(result) {
                                    if (result.key == "mode") {
                                        mode = result.value
                                    } else if (result.key == "powerOff") {
                                        powerOff = result.value
                                    }
                                });
                                if (mode != null && powerOff != null) {
                                    self.mode = mode
                                    self.powerOff = powerOff
                                    if (!powerOff) {
                                        if (mode == 0) {
                                            self.currentstate = 3
                                        } else if (mode == 1) {
                                            self.currentstate = 1
                                        } else {
                                            self.log("setupState error! Unnown state!");
                                            self.currentstate = 0
                                        }
                                    } else {
                                        self.currentstate = 0
                                    }
                                    self.targetstate = self.currentstate
                                }
                            } catch (e) {
                                self.log(self.name + ": " + e + " - Trying again");
                            }
                            self.Thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(self.currentstate);
                            self.Thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(self.targetstate);
                            next()
                        })
                        .catch((err) => {
                            self.log(self.name + ": " + err + " - Trying again");
                            self.Thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(self.currentstate);
                            self.Thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(self.targetstate);
                            next(err)
                        });
                }
                fetchDeviceStatus(next)
            }
          ], function(err, result) {
            if (err) {
                self.log("_updateThermostatValues - " + err)
            }
            setTimeout(function() {
                self._updateThermostatValues();
            }, self.interval)
        })
    }

    setTargetHeatingCoolingState(value, callback) {
        var self = this;

        if (value == 0) {
            self.powerOff = true
        } else {
            self.powerOff = false
            if (value == 3) {
                self.mode = 0
            } else if (value == 1) {
                self.mode = 1
            }
        }

        var body = JSON.stringify([
          {
            "key": "mode",
            "value": self.mode
          },
          {
            "key": "powerOff",
            "value": self.powerOff
          }
        ]);

        self.putContent('/device/' + self.id +'/parameters/', body)
        .then((results) => {
            var mode = null
            var powerOff = null
            results.forEach(function(result) {
                if (result.key == "mode") {
                    mode = result.value
                } else if (result.key == "powerOff") {
                    powerOff = result.value
                }
            });
            if (mode != null && powerOff != null) {
                self.mode = mode
                self.powerOff = powerOff
                if (!powerOff) {
                    if (mode == 0) {
                        self.currentstate = 3
                    } else if (mode == 1) {
                        self.currentstate = 1
                    } else {
                        self.log("setupState error! Unnown state!");
                        self.currentstate = 0
                    }
                } else {
                    self.currentstate = 0
                }
                self.targetstate = self.currentstate
                callback()
            }
            self.Thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(self.currentstate);
            self.Thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(self.targetstate);
        })
        .catch((err) => {
            self.log(self.name + " setTargetHeatingCoolingState error - " + err);
            self.Thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(self.currentstate);
            self.Thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(self.targetstate);
            callback()
        });
    }

    setTargetTemperature(value, callback) {

        var self = this;

        if (self.targetstate == 0) {
            self.log("Can't set new Temperature, Thermostat is off");
            callback()
        } else if (self.targetstate == 3) {
            self.log("Can't set new Temperature, Thermostat is in auto mode");
            callback()
        } else {
            var self = this;

            function tryAgain(error) {
                if (error != null) {
                    self.log(self.name + ": " + error + " - Trying again");
                }
                setTimeout(function() {
                    self.setTargetTemperature(value,callback);
                }, self.interval)
            }

            var body = JSON.stringify({ "value": value });
            self.putContent('/device/' + self.id + '/setpoint/', body)
            .then((data) => {
                self.log(self.name + " targettemp - " + value)
                self.targettemp = data.value
                self.Thermostat.getCharacteristic(Characteristic.TargetTemperature).updateValue(self.targettemp);
                if (data.value == value) {
                    callback()
                } else {
                    tryAgain()
                }
            })
            .catch((err) => {
                tryAgain(err)
            });
        }
    }
}

module.exports = THERMOSTAT

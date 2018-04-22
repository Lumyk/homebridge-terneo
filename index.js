// Created by Evgeny Kalashnikov

var async = require("async");
const querystring = require('querystring');
const https = require('https');
var Terneo_Thermostat = require('./Thermostat.js');

var Accessory,
    Service,
    Characteristic;

module.exports = function(homebridge) {

    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-terneo", "TerneoThermostat", TerneoThermostatPlatform);
}

function TerneoThermostatPlatform(log, config, api) {

    //Homebridge
    this.api = api;
    this.log = log;
    this.config = config;

    //Base Config
    this.name = config["name"] || "Tado";
    this.email = config["email"];
    if (!this.email) throw new Error("'email' is required!");
    this.password = config["password"];
    if (!this.password) throw new Error("'password' is required!");

    this.interval = (config["interval"] * 1000) || 10000;
    this.token = "";

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

    this.postContent = function(options, body) {

        return new Promise((resolve, reject) => {

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

TerneoThermostatPlatform.prototype = {
  accessories: function(callback) {

      var accessoriesArray = []
      this.idArray = []
      var self = this;

      async.waterfall([

          function(next) {
              function fetchToken(next) {

                  if (!self.token || self.token == "" || self.token == undefined || self.token == null) {

                      self.log("Getting token... email - " + self.email)
                      var body = querystring.stringify({
                          'email' : self.email,
                          'password' : self.password
                      });
                      var options = {
                          method: 'POST',
                          hostname: 'api.hmarex.com',
                          path: '/login/',
                          headers : {
                              'Content-Type': 'application/x-www-form-urlencoded',
                              'Content-Length': body.length
                          }
                      };
                      self.postContent(options, body).then(function (response) {
                          self.token = response.access_token
                          self.log("token is: " + self.token);
                          next()
                      })
                      .catch(function (err) {
                        self.log("fetchToken Error: " + err);
                        setTimeout(function() {
                            fetchToken(next)
                        }, 10000)
                      });

                  } else {
                      self.log("token is: " + self.token);
                      next()
                  }
              }
              fetchToken(next)
          },
          function(next) {
              function fetchDevices(next) {
                  self.log("fetchDevices");
                  if (!self.token || self.token == "" || self.token == undefined || self.token == null) {
                      self.log("No token");
                  } else {
                      self.getContent("/device/")
                      .then((data) => {
                          var response = JSON.parse(data);
                          if (response.results == 0) {
                              self.log("No Thermostats detected!");
                          }
                          next(null, response.results)
                      })
                      .catch((err) => {
                          self.log("fetchDevices Error: " + err);
                          next(err)
                      });
                  }
              }
              fetchDevices(next)
          },
          function(thermostats, next) {
              async.forEachOf(thermostats, function(thermostat, key, step) {
                  function pushAccessories(step) {
                      var accessory = new Terneo_Thermostat(self.log, thermostat, self.api, self.token, self.interval)
                      accessoriesArray.push(accessory);
                      step()
                  }
                  pushAccessories(step)
              }, function(err) {
                  if (err) next(err)
                  else next()
              })
          },
        ], function(err, result) {
          if (err) callback(err)
          else callback(accessoriesArray);
      })
    }
}

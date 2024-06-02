const warema = require('./warema-wms-venetian-blinds');
const log = require('./logger');
const mqtt = require('mqtt');
const { registerDevice } = require('./registerDevice');

process.on('SIGINT', function () {
    process.exit(0);
});

const mqttServer = process.env.MQTT_SERVER || 'mqtt://localhost'
const ignoredDevices = process.env.IGNORED_DEVICES ? process.env.IGNORED_DEVICES.split(',') : [];
const forceDevices = process.env.FORCE_DEVICES ? process.env.FORCE_DEVICES.split(',') : [];
const pollingInterval = process.env.POLLING_INTERVAL || 30000;
const movingInterval = process.env.MOVING_INTERVAL || 1000;

const settingsPar = {
    wmsChannel: process.env.WMS_CHANNEL || 17,
    wmsKey: process.env.WMS_KEY || '00112233445566778899AABBCCDDEEFF',
    wmsPanid: process.env.WMS_PAN_ID || 'FFFF',
    wmsSerialPort: process.env.WMS_SERIAL_PORT || '/dev/ttyUSB0',
};

const devices = [];


function handleWaremaMessage(err, msg) {
    if (err) {
        log.error(err);
    }
    if (msg) {
        switch (msg.topic) {
            case 'wms-vb-init-completion':
                log.info('Warema init completed')

                stickUsb.setPosUpdInterval(pollingInterval);
                stickUsb.setWatchMovingBlindsInterval(movingInterval);

                log.info('Scanning...')

                stickUsb.scanDevices({autoAssignBlinds: false});
                break;
            case 'wms-vb-scanned-devices':
                log.debug('Scanned devices:\n' + JSON.stringify(msg.payload, null, 2));
                if (forceDevices && forceDevices.length) {
                    forceDevices.forEach(deviceString => {
                        const [snr, type] = deviceString.split(':');

                        registerDevice({snr: snr, type: type || "25"}, client, devices, ignoredDevices, stickUsb)
                    })
                } else {
                    msg.payload.devices.forEach(element => registerDevice(element, client, devices, ignoredDevices, stickUsb))
                }
                log.debug('Registered devices:\n' + JSON.stringify(stickUsb.vnBlindsList(), null, 2))
                break;
            case 'wms-vb-rcv-weather-broadcast':
                log.silly('Weather broadcast:\n' + JSON.stringify(msg.payload, null, 2))

                if (!devices[msg.payload.weather.snr]) {
                    registerDevice({snr: msg.payload.weather.snr, type: "63"}, client, devices, ignoredDevices, stickUsb);
                }

                client.publish('warema/' + msg.payload.weather.snr + '/illuminance/state', msg.payload.weather.lumen.toString(), {retain: true})
                client.publish('warema/' + msg.payload.weather.snr + '/temperature/state', msg.payload.weather.temp.toString(), {retain: true})
                client.publish('warema/' + msg.payload.weather.snr + '/wind/state', msg.payload.weather.wind.toString(), {retain: true})
                client.publish('warema/' + msg.payload.weather.snr + '/rain/state', msg.payload.weather.rain ? 'ON' : 'OFF', {retain: true})

                break;
            case 'wms-vb-blind-position-update':
                log.debug('Position update: \n' + JSON.stringify(msg.payload, null, 2))

                if (typeof msg.payload.position !== "undefined") {
                    devices[msg.payload.snr].position = msg.payload.position;
                    client.publish('warema/' + msg.payload.snr + '/position', '' + msg.payload.position, {retain: true})

                    if (msg.payload.moving === false) {
                        if (msg.payload.position === 0){
                            client.publish('warema/' + msg.payload.snr + '/state', 'open', {retain: true});
						}
                        else if (msg.payload.position === 100){
                            client.publish('warema/' + msg.payload.snr + '/state', 'closed', {retain: true});
						}
                        else {
                            client.publish('warema/' + msg.payload.snr + '/state', 'stopped', {retain: true});
						}
                    }
                }
                if (typeof msg.payload.angle !== "undefined") {
                    devices[msg.payload.snr].tilt = msg.payload.tilt;
                    client.publish('warema/' + msg.payload.snr + '/tilt', '' + msg.payload.angle, {retain: true})
					
					if (msg.payload.moving === false) {
                        if (msg.payload.angle === 0)
                            client.publish('warema/' + msg.payload.snr + '/state_tilt', 'open', {retain: true});
                        else if (msg.payload.angle === 100)
                            client.publish('warema/' + msg.payload.snr + '/state_tilt', 'closed', {retain: true});
                        else
                            client.publish('warema/' + msg.payload.snr + '/state_tilt', 'stopped', {retain: true});
                    }
                }
                break;
            default:
                log.warn('UNKNOWN MESSAGE: ' + JSON.stringify(msg, null, 2));
        }

        client.publish('warema/bridge/state', 'online', {retain: true})
    }
}

const stickUsb = new warema(settingsPar.wmsSerialPort,
    settingsPar.wmsChannel,
    settingsPar.wmsPanid,
    settingsPar.wmsKey,
    {},
    handleWaremaMessage
);


//Do not attempt connecting to MQTT if trying to discover network parameters
if (settingsPar.wmsPanid === 'FFFF') return;

const client = mqtt.connect(mqttServer,
    {
        username: process.env.MQTT_USER,
        password: process.env.MQTT_PASSWORD,
        protocolVersion: parseInt(process.env.MQTT_VERSION)||4,
        clientId: process.env.MQTT_CLIENTID||null,
        will: {
            topic: 'warema/bridge/state',
            payload: 'offline',
            retain: true
        }
    }
);


client.on('connect', function () {
    log.info('Connected to MQTT')

    client.subscribe([
        'warema/+/set',
        'warema/+/set_position',
        'warema/+/set_tilt',
    ]);
})

client.on('error', function (error) {
    log.error('MQTT Error: ' + error.toString())
})

client.on('message', function (topic, message) {
    let [scope, device, command] = topic.split('/');
    message = message.toString();

    log.debug('Received message on topic')
    log.debug('scope: ' + scope + ', device: ' + device + ', command: ' + command)
    log.debug('message: ' + message)

    //scope === 'warema'
    switch (command) {
        case 'set':
            switch (message) {
                case 'ON':
                case 'OFF':
                    //TODO: use stick to turn on/off
                    break;
                case 'CLOSE':
                case 'CLOSETILT':
					stickUsb.vnBlindSetPosition(device, 100, 0);
                    client.publish('warema/' + device + '/state', 'closing');
                    break;

                case 'OPEN':
                case 'OPENTILT':
                    log.debug('Opening ' + device);
                    stickUsb.vnBlindSetPosition(device, 0, 0);
                    client.publish('warema/' + device + '/state', 'opening');
                    break;
                case 'STOP':
                    log.debug('Stopping ' + device);
                    stickUsb.vnBlindStop(device);
                    break;
            }
            break;
        case 'set_position':
			log.debug('Setting ' + device + ' to ' + message);
            stickUsb.vnBlindSetPosition(device, parseInt(message))
            break;
        case 'set_tilt':
            log.debug('Setting ' + device + ' to ' + message + '°, position ' + devices[device].position);
            stickUsb.vnBlindSetPosition(device, parseInt(devices[device]['position']), parseInt(message))
            break;
        default:
            log.warn('Unrecognised command')
    }
});
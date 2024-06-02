const log = require('./logger');

function registerDevice(element, client, devices, ignoredDevices, stickUsb) {
    log.debug('Registering ' + element.snr + ' with type: ' + element.type);
    let availability_topic = 'warema/' + element.snr + '/availability';

    let base_payload = {
        availability: [
            { topic: 'warema/bridge/state' },
            { topic: availability_topic }
        ],
        unique_id: element.snr,
        name: null
    };

    let base_device = {
        identifiers: element.snr,
        manufacturer: "Warema",
        name: element.snr
    };

    let model;
    let payload;
    switch (element.type) {
        case "63":
            model = 'Weather station pro';
            payload = {
                ...base_payload,
                device: {
                    ...base_device,
                    model: model
                }
            };

            const illuminance_payload = {
                ...payload,
                state_topic: 'warema/' + element.snr + '/illuminance/state',
                device_class: 'illuminance',
                unique_id: element.snr + '_illuminance',
                object_id: element.snr + '_illuminance',
                unit_of_measurement: 'lx',
            };

            const temperature_payload = {
                ...payload,
                state_topic: 'warema/' + element.snr + '/temperature/state',
                device_class: 'temperature',
                unique_id: element.snr + '_temperature',
                object_id: element.snr + '_temperature',
                unit_of_measurement: '°C',
            };

            const wind_payload = {
                ...payload,
                state_topic: 'warema/' + element.snr + '/wind/state',
                device_class: 'wind_speed',
                unique_id: element.snr + '_wind',
                object_id: element.snr + '_wind',
                unit_of_measurement: 'm/s',
            };

            const rain_payload = {
                ...payload,
                state_topic: 'warema/' + element.snr + '/rain/state',
                device_class: 'moisture',
                unique_id: element.snr + '_rain',
                object_id: element.snr + '_rain',
            };

            client.publish(availability_topic, 'online', { retain: true });

            devices[element.snr] = {};
            log.info('No need to add to stick, weather updates are broadcasted. ' + element.snr + ' with type: ' + element.type);

            return;
        case "07":
            // WMS Remote pro
            return;
        case "09":
            // WMS WebControl Pro - while part of the network, we have no business to do with it.
            return;
        case "20":
            model = 'Plug receiver';
            payload = {
                ...base_payload,
                device: {
                    ...base_device,
                    model: model
                },
                position_open: 0,
                position_closed: 100,
                command_topic: 'warema/' + element.snr + '/set',
                state_topic: 'warema/' + element.snr + '/state',
                position_topic: 'warema/' + element.snr + '/position',
                tilt_status_topic: 'warema/' + element.snr + '/tilt',
                set_position_topic: 'warema/' + element.snr + '/set_position',
                tilt_command_topic: 'warema/' + element.snr + '/set_tilt',
                tilt_closed_value: -100,
                tilt_opened_value: 100,
                tilt_min: -100,
                tilt_max: 100,
            };
            break;
        case "21":
            model = 'Actuator UP';
            payload = {
                ...base_payload,
                device: {
                    ...base_device,
                    model: model
                },
                position_open: 0,
                position_closed: 100,
                command_topic: 'warema/' + element.snr + '/set',
                position_topic: 'warema/' + element.snr + '/position',
                tilt_status_topic: 'warema/' + element.snr + '/tilt',
                set_position_topic: 'warema/' + element.snr + '/set_position',
                tilt_command_topic: 'warema/' + element.snr + '/set_tilt',
                tilt_closed_value: -100,
                tilt_opened_value: 100,
                tilt_min: -100,
                tilt_max: 100,
            };

            break;
        case "24":
            // TODO: Smart socket
            model = 'Smart socket';
            payload = {
                ...base_payload,
                device: {
                    ...base_device,
                    model: model
                },
                state_topic: 'warema/' + element.snr + '/state',
                command_topic: 'warema/' + element.snr + '/set',
            };

            break;
        case "25": {
            let discovery_topic = 'homeassistant/cover/' + element.snr + '/config';
            model = 'Vertical awning';
            payload = {
                ...base_payload,
                device: {
                    ...base_device,
                    model: model
                },
                position_open: 0,
                position_closed: 100,
                command_topic: 'warema/' + element.snr + '/set',
                position_topic: 'warema/' + element.snr + '/position',
                state_topic: 'warema/' + element.snr + '/state',
                set_position_topic: 'warema/' + element.snr + '/set_position',
            };
            client.publish(discovery_topic, JSON.stringify(payload), { retain: true });
            break;
        }
        case "28":
            model = 'LED';
            payload = {
                ...base_payload,
                device: {
                    ...base_device,
                    model: model
                },
                position_open: 0,
                position_closed: 100,
                state_topic: 'warema/' + element.snr + '/state',
                command_topic: 'warema/' + element.snr + '/set',
                position_topic: 'warema/' + element.snr + '/position',
                set_position_topic: 'warema/' + element.snr + '/set_position',
            };
            break;
        case "2A":
            model = 'Slat roof';
            payload = {
                ...base_payload,
                device: {
                    ...base_device,
                    model: model
                },
                tilt_status_topic: 'warema/' + element.snr + '/tilt',
                tilt_command_topic: 'warema/' + element.snr + '/set_tilt',
                position_topic: 'warema/' + element.snr + '/position',
                set_position_topic: 'warema/' + element.snr + '/set_position',
            };
            break;
        default:
            log.warn('Unrecognized device type: ' + element.type);
            model = 'Unknown model ' + element.type;
            return;
    }

    if (ignoredDevices.includes(element.snr.toString())) {
        log.info('Ignoring and removing device ' + element.snr + ' (type ' + element.type + ')');
        return;
    }

    log.debug('Adding device ' + element.snr + ' (type ' + element.type + ')');
    stickUsb.vnBlindAdd(parseInt(element.snr), element.snr.toString());
    devices[element.snr] = {};
    client.publish(availability_topic, 'online', { retain: true });
}
exports.registerDevice = registerDevice;

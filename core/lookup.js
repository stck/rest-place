const async = require('async');
const fs = require('fs');
const path = require('path');
const es = require('event-stream');
const request = require('request');
const loki = require('lokijs');
let db = new loki('geo');
let geo = db.addCollection('geo', {indices: 'lname'});

const geocodePath = (item) => path.normalize(`${__dirname}/../geocodes/${item}/`);

const parsers = {
    admin1_codes: require('./parsers/admin1'),
    admin2_codes: require('./parsers/admin2'),
    cities: require('./parsers/cities')
};
let storage = {};

let saveStorage = (data, _cb) => {
    async.waterfall([
        (cb) => {
            //check countryCode
            if (!storage[data.countryCode]) {
                storage[data.countryCode] = {name: '', codes: {}}
            }

            if (data.type === 'country') {
                storage[data.countryCode].name = data.name;
            }

            return cb(null, storage[data.countryCode]);
        },
        (_storage, cb) => {
            if (!_storage.codes[data.admin1code]) {
                _storage.codes[data.admin1code] = {
                    name: '',
                    codes: {}
                }
            }

            if (data.type === 'admin1') {
                _storage.codes[data.admin1code].name = data.name;
                return cb('ended', null);
            }

            return cb(null, _storage.codes[data.admin1code])
        },
        (_storage, cb) => {
            if (!_storage.codes[data.admin2code]) {
                _storage.codes[data.admin2code] = {
                    name: '',
                }
            }

            if (data.type === 'admin2') {
                _storage.codes[data.admin2code].name = data.name;
                return cb('ended', null);
            }

            return cb(null, data);
        }
    ], _cb);
};

let transformDocumentToPath = (item, prepareForSearch) => {
    let path = [];
    let adm;

    if (item.countryCode && item.type != 'country') {
        let level = storage[item.countryCode];
        path.push(level.name);
        adm = storage[item.countryCode];
    }

    if (item.admin1code && item.type != 'admin1') {
        let level = adm.codes[item.admin1code];
        path.push(level.name);
        adm = level;
    }
    if (item.admin2code && item.type != 'admin2') {
        let level = adm.codes[item.admin2code];
        path.push(level.name);
    }
    path.push(item.name);

    adm = null;

    if (prepareForSearch) {
        return path.join(' ').toLowerCase();
    }

    return path.join(', ');
};

let init = (initCb) => {
    let resolves = [];

    ['admin1_codes', 'admin2_codes', 'cities'].forEach((item) => {
        const prefix = geocodePath(item);
        const subItems = fs.readdirSync(prefix);
        const subItem = [prefix, subItems[0]].join('/');

        const resolve = function (cb) {
            fs.createReadStream(subItem)
                .pipe(es.split())
                .pipe(es.map((data, mapCb) => {
                    let _data = parsers[item](data.split('\t'));
                    if (!_data.name) {
                        return mapCb();
                    }

                    return saveStorage(_data, () => {
                        return mapCb(null, _data);
                    });
                }))
                .on('end', () => {
                    console.log(`Finished ${subItem}`);
                    cb();
                })
        };
        resolves.push(resolve);
    });
    resolves.push((cb) => {
        request('http://download.geonames.org/export/dump/countryInfo.txt')
            .pipe(es.split())
            .pipe(es.map((a, b) => {
                if (a.indexOf('#') === 0 || !a) {
                    return b();
                }
                a = a.split('\t');
                let data = {name: a[4], countryCode: a[0], type: 'country'};
                data.lname = data.name.toLowerCase();
                geo.insert(data);

                return saveStorage(data, () => {
                    return b(null, data);
                });
            }))
            .on('end', cb);
    });
    async.parallel(resolves, (err, data) => {
        ['admin1_codes', 'admin2_codes', 'cities'].forEach((item) => {
            let prefix = geocodePath(item);
            let subItems = fs.readdirSync(prefix);
            let subItem = [prefix, subItems[0]].join('/');

            fs.createReadStream(subItem)
                .pipe(es.split()).pipe(es.map((data, mapCb) => {
                let _data = parsers[item](data.split('\t'));
                if (!_data.name) {
                    return mapCb();
                }

                _data.lname = transformDocumentToPath(_data, true);
                geo.insert(_data);
                return mapCb(null, _data);
            }))
            .on('end', () => {
                console.log(`Finished ${subItem} loki`);
            });
        });

        console.log('All data initialized');
        initCb();
    });
};

let lookup = (input) => {
    let results = [];
    const inputParts = input.replace(',', '').split(' ');
    const orQuery = [];
    inputParts.forEach((part) => {
        orQuery.push({$contains: part.toLowerCase()});
    });

    geo.chain().find({'lname': {$and: orQuery}}).limit(10).data().forEach((item) => {
        let key = item.name;
        let type = item.type;
        let path = transformDocumentToPath(item);
        results.push({key, type, path, kladr: item});
    });

    return results;
};

module.exports.init = init;
module.exports.lookup = lookup;